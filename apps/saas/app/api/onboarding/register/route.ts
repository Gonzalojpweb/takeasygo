import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { onboardingRegisterSchema } from '@/lib/schemas'
import { sendOnboardingVerifyEmail } from '@/lib/email'
import { rateLimit } from '@/lib/rateLimit'
import crypto from 'crypto'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-forwarded-for') || 'unknown'
    const limitReg = await rateLimit(`onb:reg:ip:${ip}`, 3, 10 * 60_000) // 3 per 10 min
    if (!limitReg.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá más tarde.' }, { status: 429 })
    }

    const body = await req.json()
    const parsed = onboardingRegisterSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { name, slug, email } = parsed.data

    await connectDB()

    // 1. Check if email exists
    const userExists = await User.exists({ email })
    if (userExists) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 })
    }

    // 2. Check if slug exists
    const tenantExists = await Tenant.exists({ slug })
    if (tenantExists) {
      return NextResponse.json({ error: 'El enlace ya está en uso' }, { status: 400 })
    }

    // 3. Rate limit per email (hash to avoid PII in Redis)
    const emailHash = crypto.createHash('sha256').update(email).digest('hex')
    const limitMail = await rateLimit(`onb:reg:mail:${emailHash}`, 3, 60 * 60_000) // 3 per hour
    if (!limitMail.success) {
      return NextResponse.json({ error: 'Demasiados intentos para este email.' }, { status: 429 })
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
      slug,
      plan: 'trial',
      status: 'active', // Required for location endpoints
      onboarding: {
        status: 'draft',
        step: 1,
        ticketHash: hashedTicket,
        ticketExpiry: ticketExpiry,
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
