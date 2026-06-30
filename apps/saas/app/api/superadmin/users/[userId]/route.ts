import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { userId } = await params
    await connectDB()

    const user = await User.findById(userId)
      .select('-password -resetToken -resetTokenExpiry')
      .lean()
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const memberships = await LoyaltyMember.find({ userId })
      .select('tenantId loyalty.points loyalty.tier cache.totalOrders cache.totalSpent cache.lastOrderAt status joinedAt')
      .lean()

    const tenantIds = memberships.map(m => m.tenantId).filter(Boolean)
    const tenants = tenantIds.length > 0
      ? await Tenant.find({ _id: { $in: tenantIds } })
          .select('name slug')
          .lean()
      : []
    const tenantMap = new Map(tenants.map(t => [t._id.toString(), t]))

    const enrichedMemberships = memberships.map(m => {
      const tenant = tenantMap.get(m.tenantId?.toString() ?? '')
      const loyalty = m.loyalty as { points?: number; tier?: string } | undefined
      const cache = m.cache as { totalOrders?: number; totalSpent?: number; lastOrderAt?: Date | null } | undefined
      return {
        tenantName: tenant?.name ?? '(desconocido)',
        tenantSlug: tenant?.slug ?? '',
        points: loyalty?.points ?? 0,
        tier: loyalty?.tier ?? 'none',
        totalOrders: cache?.totalOrders ?? 0,
        totalSpent: cache?.totalSpent ?? 0,
        lastOrderAt: cache?.lastOrderAt ?? null,
        joinedAt: m.joinedAt,
        status: m.status,
      }
    })

    const totalOrders = enrichedMemberships.reduce((sum, m) => sum + m.totalOrders, 0)
    const totalSpent = enrichedMemberships.reduce((sum, m) => sum + m.totalSpent, 0)

    return NextResponse.json({
      user,
      memberships: enrichedMemberships,
      stats: {
        totalMemberships: enrichedMemberships.length,
        totalOrders,
        totalSpent,
      },
    })
  } catch (error) {
    console.error('[superadmin/users/[userId] GET]', error)
    return NextResponse.json({ error: 'Error al obtener el usuario' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { userId } = await params
    const body = await request.json()
    const { role, isActive } = body

    await connectDB()

    const update: Record<string, any> = {}
    if (role !== undefined) {
      const validRoles = ['admin', 'manager', 'staff', 'cashier', 'consumer', 'seller']
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
      }
      update.role = role
    }
    if (isActive !== undefined) {
      update.isActive = Boolean(isActive)
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
      .select('-password -resetToken -resetTokenExpiry')
      .lean()

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('[superadmin/users/[userId] PATCH]', error)
    return NextResponse.json({ error: 'Error al actualizar el usuario' }, { status: 500 })
  }
}
