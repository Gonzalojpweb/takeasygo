import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'
import { auth } from '@/lib/auth'
import { requireLocationId } from '@/lib/loyalty-location'
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

    const body = await request.json().catch(() => ({}))
    const { locationId: rawLocationId } = body

    let locationId: import('mongoose').Types.ObjectId | null = null
    try {
      locationId = await requireLocationId(tenant._id, rawLocationId, 'loyalty join')
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }

    // ── Deduplicación: buscar por userId o email ─────────────────────────
    const memberQuery: Record<string, unknown> = {
      tenantId: tenant._id,
      $or: [
        { userId: user._id },
        { email: session.user.email },
      ],
    }
    if (locationId) {
      memberQuery.locationId = locationId
    }

    const existing = await LoyaltyMember.findOne(memberQuery).lean()

    if (existing) {
      // Si existe por email pero sin userId vinculado → actualizar (dedup)
      if (!existing.userId) {
        const linkUpdate: Record<string, unknown> = { userId: user._id, source: 'explore' }
        if (locationId) {
          linkUpdate.locationId = locationId
        }
        await LoyaltyMember.updateOne(
          { _id: existing._id },
          { $set: linkUpdate }
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

    const memberData: Record<string, unknown> = {
      tenantId: tenant._id,
      userId: user._id,
      name: body.name || session.user.name || 'Consumidor',
      email: session.user.email,
      phone: null,
      phoneHash: null,
      source: 'explore',
      status: 'active',
      joinedAt: new Date(),
    }
    if (locationId) {
      memberData.locationId = locationId
    }

    const member = await LoyaltyMember.create(memberData)

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
