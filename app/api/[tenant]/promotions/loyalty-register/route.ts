import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { name, email, phone, promotionId } = body

    if (!name || !email || !phone) {
      return NextResponse.json({ error: 'Nombre, correo y teléfono son obligatorios' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id pointsConfig.welcomePoints')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const phoneHash = hashPhone(phone)

    // Buscar si ya existe un User con este teléfono o email
    let user = await User.findOne({ $or: [{ phone }, { email }] })

    if (!user) {
      user = await User.create({
        name,
        phone,
        email,
        role: 'consumer',
        isActive: true,
      })
    } else {
      if (user.phone !== phone) {
        await User.updateOne({ _id: user._id }, { $set: { phone } })
        user.phone = phone
      }
      if (user.email !== email) {
        await User.updateOne({ _id: user._id }, { $set: { email } })
        user.email = email
      }
    }

    // Verificar si ya es miembro del club
    const existing = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash,
    })

    if (existing) {
      return NextResponse.json({
        error: 'Este número ya está registrado en el club',
        code: 'ALREADY_REGISTERED',
      }, { status: 409 })
    }

    const welcomePoints = (tenant as any).pointsConfig?.welcomePoints ?? 0

    // Crear nuevo miembro vinculado al User de TakeasyGo
    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      userId: user._id,
      name,
      phone,
      phoneHash,
      email,
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(),
      promotionId: promotionId || null,
      'loyalty.points': welcomePoints,
    })

    return NextResponse.json({
      success: true,
      member: {
        _id: member._id,
        name: member.name,
        publicId: member.wallet?.publicId,
      },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      welcomePoints,
    })

  } catch (error) {
    console.error('Promotion loyalty register error:', error)
    return NextResponse.json({ error: 'Error al registrarse' }, { status: 500 })
  }
}
