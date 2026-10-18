import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, requireAuth } from '@/lib/apiAuth'
import { enforcePermissionOrAdmin } from '@/lib/rbac'

const MAX_AGE_HOURS = 24

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const authError = await requireAuth(request, tenant._id.toString())
  if (authError) return authError

  // Flag off: admin-only (como siempre). Flag on: matriz v3 → admin+manager.
  const guardError = await enforcePermissionOrAdmin(request, {
    tenant,
    tenantId: tenant._id.toString(),
    permission: 'orders.cancel',
  })
  if (guardError) return guardError

  // Aislamiento por sede: usuarios con sedes asignadas solo limpian las suyas.
  // Admin/superadmin (y sesiones sin usuario) limpian todo el tenant.
  const sessionUser = await getSessionUser(request)
  const assignedLocations = sessionUser?.assignedLocations ?? []
  const isScoped =
    sessionUser != null &&
    sessionUser.role !== 'admin' &&
    sessionUser.role !== 'superadmin' &&
    assignedLocations.length > 0
  const scopeFilter = isScoped ? { locationId: { $in: assignedLocations } } : {}

  const cutoffDate = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000)

  // Revert reward redemptions before deleting
  const orphanedOrders = await Order.find({
    tenantId: tenant._id,
    status: 'cancelled',
    updatedAt: { $lt: cutoffDate },
    rewardItems: { $exists: true, $ne: [] },
    ...scopeFilter,
  }).lean()

  for (const orphanedOrder of orphanedOrders) {
    try {
      await revertRewardRedemptions(orphanedOrder, tenant)
    } catch (e) {
      console.error(`[cleanup] Failed to revert rewards for order ${orphanedOrder.orderNumber}:`, e)
    }
  }

  const result = await Order.deleteMany({
    tenantId: tenant._id,
    status: 'cancelled',
    updatedAt: { $lt: cutoffDate },
    ...scopeFilter,
  })

  return NextResponse.json({
    deleted: result.deletedCount,
    cutoffDate: cutoffDate.toISOString(),
    message: `${result.deletedCount} pedidos cancelados eliminados (mayores de ${MAX_AGE_HOURS}h)`,
  })
}
