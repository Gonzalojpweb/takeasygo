import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
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

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id pointsConfig.welcomePoints')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const phoneHash = hashPhone(phone)

    // Verificar si ya existe
    const existing = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash
    })

    if (existing) {
      return NextResponse.json({ 
        error: 'Este número ya está registrado en el club',
        code: 'ALREADY_REGISTERED' 
      }, { status: 409 })
    }

    // Crear o encontrar User vinculado
    let user = await User.findOne({ phone })
    if (!user) {
      user = await User.create({
        name,
        phone,
        email,
        role: 'consumer',
        isActive: true,
      })
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
