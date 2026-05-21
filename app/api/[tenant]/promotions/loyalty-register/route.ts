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
    const { name, phone, promotionId } = body

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nombre y teléfono son obligatorios' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const phoneHash = hashPhone(phone)

    // Buscar si ya existe un User con este teléfono
    let user = await User.findOne({ phone })

    if (!user) {
      // Crear nuevo usuario de TakeasyGo
      const email = `u_${phoneHash.slice(0, 12)}@takeasygo.app`
      user = await User.create({
        name,
        phone,
        email,
        role: 'consumer',
        isActive: true,
      })
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

    // Crear nuevo miembro vinculado al User de TakeasyGo
    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      userId: user._id,
      name,
      phone,
      phoneHash,
      email: user.email,
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(),
      promotionId: promotionId || null,
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
    })

  } catch (error) {
    console.error('Promotion loyalty register error:', error)
    return NextResponse.json({ error: 'Error al registrarse' }, { status: 500 })
  }
}
