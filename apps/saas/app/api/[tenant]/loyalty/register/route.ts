import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { requireLocationId } from '@/lib/loyalty-location'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { name, email, phone, source = 'qr_scan' } = body

    if (!name || !email || !phone) {
      return NextResponse.json({ error: 'Nombre, correo y teléfono son obligatorios' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id pointsConfig.welcomePoints loyalty.perLocation')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    let locationId: import('mongoose').Types.ObjectId | null = null
    try {
      locationId = await requireLocationId(tenant._id, body.locationId, 'loyalty register')
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }

    const phoneHash = hashPhone(phone)

    // Verificar si ya existe
    const existing = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash,
      ...(locationId ? { locationId } : {})
    })

    if (existing) {
      return NextResponse.json({ 
        error: 'Este número ya está registrado en el club',
        code: 'ALREADY_REGISTERED' 
      }, { status: 409 })
    }

    // Crear o encontrar User vinculado (por phone o email)
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

    const welcomePoints = (tenant as any).pointsConfig?.welcomePoints ?? 0

    // Crear nuevo miembro
    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      userId: user._id,
      name,
      phone,
      phoneHash,
      email,
      source,
      status: 'active',
      joinedAt: new Date(),
      'loyalty.points': welcomePoints,
      ...(locationId ? { locationId } : {})
    })

    return NextResponse.json({ 
      success: true, 
      member: {
        _id: member._id,
        name: member.name,
        publicId: member.wallet?.publicId
      },
      welcomePoints
    })

  } catch (error) {
    console.error('Loyalty register error:', error)
    return NextResponse.json({ error: 'Error al registrarse' }, { status: 500 })
  }
}
