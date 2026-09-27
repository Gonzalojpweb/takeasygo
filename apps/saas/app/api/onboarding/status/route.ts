import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rateLimit'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-forwarded-for') || 'unknown'
    const limit = await rateLimit(`onb:status:ip:${ip}`, 30, 60_000) // High limit for polling
    if (!limit.success) {
      return NextResponse.json({ error: 'Rate limit' }, { status: 429 })
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

    const user = await User.findOne({ tenantId: tenant._id })
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 400 })
    }

    return NextResponse.json({
      verified: user.emailVerified !== null,
      step: tenant.onboarding.step,
      slug: tenant.slug
    })
  } catch (error) {
    console.error('Error polling status:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
