import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rateLimit'
import { headers } from 'next/headers'
import { sendOnboardingVerifyEmail } from '@/lib/email'

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-forwarded-for') || 'unknown'
    const limitIp = await rateLimit(`onb:resend:ip:${ip}`, 5, 60 * 60_000) // 5 per hour per IP
    if (!limitIp.success) {
      return NextResponse.json({ error: 'Demasiados intentos desde esta IP.' }, { status: 429 })
    }

    const { ticket } = await req.json()
    if (!ticket) return NextResponse.json({ error: 'Ticket missing' }, { status: 400 })

    const hashedTicket = crypto.createHash('sha256').update(ticket).digest('hex')

    await connectDB()

    const tenant = await Tenant.findOne({
      'onboarding.ticketHash': hashedTicket,
      'onboarding.ticketExpiry': { $gt: new Date() }
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Ticket inválido o expirado' }, { status: 400 })
    }

    const user = await User.findOne({ tenantId: tenant._id }).select('+verifyToken +verifyTokenExpiry')
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 400 })
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: 'El email ya está verificado' }, { status: 400 })
    }

    const limitMail = await rateLimit(`onb:resend:mail:${user.email}`, 1, 5 * 60_000) // 1 per 5 min per email
    if (!limitMail.success) {
      return NextResponse.json({ error: 'Esperá 5 minutos para volver a enviar el email.' }, { status: 429 })
    }

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000)

    user.verifyToken = hashedToken
    user.verifyTokenExpiry = tokenExpiry
    await user.save()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const verifyUrl = `${appUrl}/empezar/verificar?token=${rawToken}`
    
    await sendOnboardingVerifyEmail(user.email, verifyUrl)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error resending email:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
