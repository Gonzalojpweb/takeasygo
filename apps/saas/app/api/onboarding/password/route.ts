import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { onboardingPasswordSchema } from '@/lib/schemas'
import { sanitizePassword, passwordError } from '@/lib/password'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { rateLimit } from '@/lib/rateLimit'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-forwarded-for') || 'unknown'
    const limit = await rateLimit(`onb:pwd:ip:${ip}`, 5, 10 * 60_000) // 5 per 10 min
    if (!limit.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá más tarde.' }, { status: 429 })
    }

    const body = await req.json()
    // El saneado (NFC + sin caracteres de control) y las reglas de fortaleza
    // viven en lib/password.ts: el cliente muestra exactamente esta checklist.
    if (body && typeof body.password === 'string') body.password = sanitizePassword(body.password)
    const parsed = onboardingPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const ruleError = passwordError(parsed.data.password)
    if (ruleError) {
      return NextResponse.json({ error: ruleError }, { status: 400 })
    }

    const { ticket, password } = parsed.data
    const hashedTicket = crypto.createHash('sha256').update(ticket).digest('hex')

    await connectDB()

    const tenant = await Tenant.findOne({
      'onboarding.ticketHash': hashedTicket,
      'onboarding.ticketExpiry': { $gt: new Date() }
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Ticket inválido o expirado' }, { status: 400 })
    }

    const user = await User.findOne({ tenantId: tenant._id })
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 400 })
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Tenés que verificar tu email primero' }, { status: 400 })
    }

    // Hash password and consume ticket
    user.password = await bcrypt.hash(password, 12)
    await user.save()

    tenant.onboarding.ticketHash = null
    tenant.onboarding.ticketExpiry = null
    if (tenant.onboarding.step === 2) {
      tenant.onboarding.step = 3
    }
    await tenant.save()

    return NextResponse.json({ slug: tenant.slug })
  } catch (error) {
    console.error('Error setting password:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
