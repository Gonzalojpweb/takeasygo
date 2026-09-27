import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { onboardingVerifySchema } from '@/lib/schemas'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rateLimit'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-forwarded-for') || 'unknown'
    const limit = await rateLimit(`onb:verify:ip:${ip}`, 5, 60_000) // 5 per min
    if (!limit.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá más tarde.' }, { status: 429 })
    }

    const body = await req.json()
    const parsed = onboardingVerifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    const hashedToken = crypto.createHash('sha256').update(parsed.data.token).digest('hex')

    await connectDB()

    const user = await User.findOne({
      verifyToken: hashedToken,
      verifyTokenExpiry: { $gt: new Date() },
    }).select('+verifyToken +verifyTokenExpiry')

    if (!user) {
      return NextResponse.json({ error: 'El enlace expiró o es inválido' }, { status: 400 })
    }

    // Update user
    user.emailVerified = new Date()
    user.verifyToken = null
    user.verifyTokenExpiry = null
    await user.save()

    // Advance tenant step from 1 to 2
    if (user.tenantId) {
      const tenant = await Tenant.findById(user.tenantId)
      if (tenant && tenant.onboarding.step === 1) {
        tenant.onboarding.step = 2
        await tenant.save()
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in onboarding verify:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
