import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { onboardingRegisterSchema } from '@/lib/schemas'
import { slugifyOrFallback } from '@/lib/slugify'
import { isReservedSlug } from '@/lib/reserved-slugs'
import { resolveInitialPlan } from '@/lib/plans'
import { sendOnboardingVerifyEmail } from '@/lib/email'
import { rateLimit } from '@/lib/rateLimit'
import { checkFormToken, consumeFormToken, takeGlobalSignupSlot, clientIp } from '@/lib/onboarding-guard'

import crypto from 'crypto'
import { headers } from 'next/headers'
import { NEW_TENANT_WHATSAPP_ORDER_LINK } from '@/lib/whatsapp-order-link'

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers()
    const ip = clientIp(requestHeaders)
    const limitReg = await rateLimit(`onb:reg:ip:${ip}`, 3, 10 * 60_000) // 3 per 10 min
    if (!limitReg.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá más tarde.' }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
    }

    // Campo trampa: una persona no lo ve; si viene completo, es un bot.
    // Respuesta genérica para no darle pistas al script.
    const honeypot = (body as { website?: unknown }).website // HONEYPOT_FIELD
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      return NextResponse.json({ error: 'No pudimos procesar la solicitud.' }, { status: 400 })
    }

    // Token del formulario: firmado al abrir /empezar, ≥ 3 s y de un solo uso.
    const formCheck = checkFormToken(body.formToken)
    if (!formCheck.ok) {
      const message = formCheck.reason === 'expired' || formCheck.reason === 'missing'
        ? 'La página venció. Recargala y volvé a intentarlo.'
        : 'No pudimos procesar la solicitud. Recargá la página y volvé a intentarlo.'
      return NextResponse.json({ error: message, code: 'form_token' }, { status: 400 })
    }

    const parsed = onboardingRegisterSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { name, slug, email, selectedPlan, origen } = parsed.data

    // Texto libre → slug válido. Cualquier nombre (tildes, mayúsculas, símbolos,
    // no-ASCII, emoji) produce un enlace usable; nunca queda vacío.
    const finalSlug = slugifyOrFallback(name, slug)

    await connectDB()

    // 1. Check if email exists
    const userExists = await User.exists({ email })
    if (userExists) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 })
    }

    // 2. Slugs reservados (auditoría 30/10/2026, M5): rutas propias de la app
    // y nombres que suplantarían a la plataforma.
    if (isReservedSlug(finalSlug)) {
      return NextResponse.json(
        { error: `El enlace "${finalSlug}" está reservado. Probá con otro.` },
        { status: 400 }
      )
    }

    // 2b. Check if slug exists
    const tenantExists = await Tenant.exists({ slug: finalSlug })
    if (tenantExists) {
      return NextResponse.json(
        { error: `El enlace "${finalSlug}" ya está en uso. Probá con otro.` },
        { status: 400 }
      )
    }

    // 3. Rate limit per email (hash to avoid PII in Redis)
    const emailHash = crypto.createHash('sha256').update(email).digest('hex')
    const limitMail = await rateLimit(`onb:reg:mail:${emailHash}`, 3, 60 * 60_000) // 3 per hour
    if (!limitMail.success) {
      return NextResponse.json({ error: 'Demasiados intentos para este email.' }, { status: 429 })
    }

    // 3b. Token de un solo uso y tope global (ataque distribuido). Al final,
    // para que solo cuenten altas que pasaron todas las validaciones.
    if (!(await consumeFormToken(formCheck.signature))) {
      return NextResponse.json({ error: 'Este formulario ya se envió. Recargá la página.', code: 'form_token' }, { status: 400 })
    }
    if (!(await takeGlobalSignupSlot())) {
      console.warn('[onboarding/register] tope global de altas alcanzado')
      return NextResponse.json({ error: 'Estamos recibiendo muchas solicitudes. Probá de nuevo en unos minutos.' }, { status: 429 })
    }

    // 4. Create token and ticket
    const rawToken = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000) // 15 min

    const rawTicket = crypto.randomBytes(32).toString('hex')
    const hashedTicket = crypto.createHash('sha256').update(rawTicket).digest('hex')
    const ticketExpiry = new Date(Date.now() + 30 * 60 * 1000) // 30 min

    // 5. Create Tenant and User
    const tenant = await Tenant.create({
      name,
      slug: finalSlug,
      plan: 'trial',
      status: 'active', // Required for location endpoints
      // WhatsApp en el seguimiento: apagado hasta que lo habilite el superadmin.
      features: { ...NEW_TENANT_WHATSAPP_ORDER_LINK },
      onboarding: {
        status: 'draft',
        step: 1,
        ticketHash: hashedTicket,
        ticketExpiry: ticketExpiry,
        // Resuelto en server: 'demo' siempre trial, plan desconocido → trial.
        // Esto NO toca tenant.plan (sigue en 'trial' hasta la aprobación).
        selectedPlan: resolveInitialPlan(selectedPlan, origen),
        origen: origen || null,
      },
    })

    await User.create({
      name,
      email,
      role: 'admin',
      tenantId: tenant._id,
      emailVerified: null,
      verifyToken: hashedToken,
      verifyTokenExpiry: tokenExpiry,
    })

    // 6. Send email
    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    const verifyUrl = `${appUrl}/empezar/verificar?token=${rawToken}`
    
    await sendOnboardingVerifyEmail(email, verifyUrl)

    return NextResponse.json({ ticket: rawTicket })
  } catch (error) {
    console.error('Error in onboarding register:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
