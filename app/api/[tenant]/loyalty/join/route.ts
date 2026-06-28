import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Necesitás iniciar sesión' }, { status: 401 })
    }

    const user = await User.findOne({ email: session.user.email }).lean()
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan loyalty').lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    if (!tenant.loyalty?.enabled) {
      return NextResponse.json({ error: 'El club de fidelización no está activo' }, { status: 400 })
    }

    // ── Deduplicación: buscar por userId o email ─────────────────────────
    const existing = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      $or: [
        { userId: user._id },
        { email: session.user.email },
      ],
    }).lean()

    if (existing) {
      // Si existe por email pero sin userId vinculado → actualizar (dedup)
      if (!existing.userId) {
        await LoyaltyMember.updateOne(
          { _id: existing._id },
          { $set: { userId: user._id, source: 'explore' } }
        )
        return NextResponse.json({
          success: true,
          linked: true,
          member: {
            _id: existing._id,
            name: existing.name,
            publicId: existing.wallet?.publicId,
          }
        })
      }
      return NextResponse.json({
        error: 'Ya sos miembro de este club',
        code: 'ALREADY_MEMBER',
      }, { status: 409 })
    }

    const body = await request.json().catch(() => ({}))

    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      userId: user._id,
      name: body.name || session.user.name || 'Consumidor',
      email: session.user.email,
      phone: null,
      phoneHash: null,
      source: 'explore',
      status: 'active',
      joinedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      member: {
        _id: member._id,
        name: member.name,
        publicId: member.wallet?.publicId,
      }
    })

  } catch (error) {
    console.error('[loyalty/join] Error:', error)
    return NextResponse.json({ error: 'Error al unirse al club' }, { status: 500 })
  }
}
