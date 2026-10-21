import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'

/**
 * Cash Reconciliation — finds cash orders that were confirmed but may not
 * have been collected. Runs as a periodic cron job (daily recommended).
 *
 * Pattern: same as commission reconciliation banner.
 * Returns tenants with orphaned cash orders for the admin dashboard.
 */

export interface OrphanedCashOrder {
  orderId: string
  orderNumber: string
  total: number
  createdAt: Date
  customerName: string
  locationId?: string | null
}

export interface TenantCashReconciliation {
  tenantId: string
  tenantName: string
  tenantSlug: string
  orphanedOrders: OrphanedCashOrder[]
  totalOrphaned: number
}

/**
 * Find cash orders that are confirmed but haven't been marked as adjusted.
 * These are orders where the customer may not have paid yet.
 *
 * @param daysBack - How many days back to look (default: 7)
 * @param tenantId - Optional: specific tenant to check
 */
export async function findOrphanedCashOrders(
  daysBack: number = 7,
  tenantId?: string
): Promise<TenantCashReconciliation[]> {
  await connectDB()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysBack)

  const matchQuery: any = {
    'payment.method': 'cash',
    'payment.status': 'approved',
    'payment.cashAdjustmentApplied': { $ne: true },
    status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] },
    createdAt: { $gte: cutoffDate },
    deletedAt: null,
  }

  if (tenantId) {
    matchQuery.tenantId = tenantId
  }

  const orders = await Order.find(matchQuery)
    .select('tenantId orderNumber total createdAt customer.name payment.cashAdjustmentApplied')
    .sort({ createdAt: -1 })
    .lean()

  // Group by tenant
  const byTenant = new Map<string, any[]>()
  for (const order of orders) {
    const tid = order.tenantId.toString()
    if (!byTenant.has(tid)) byTenant.set(tid, [])
    byTenant.get(tid)!.push(order)
  }

  // Resolve tenant names
  const tenantIds = [...byTenant.keys()]
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select('name slug')
    .lean()

  const tenantMap = new Map(tenants.map(t => [t._id.toString(), t]))

  const results: TenantCashReconciliation[] = []
  for (const [tid, tenantOrders] of byTenant) {
    const tenant = tenantMap.get(tid)
    if (!tenant) continue

    results.push({
      tenantId: tid,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      orphanedOrders: tenantOrders.map(o => ({
        orderId: o._id.toString(),
        orderNumber: o.orderNumber,
        total: o.total,
        createdAt: o.createdAt,
        customerName: o.customer?.name || 'Cliente',
      })),
      totalOrphaned: tenantOrders.length,
    })
  }

  return results
}

/**
 * Summary for the admin dashboard banner.
 * Returns total orphaned cash orders and total amount at risk.
 */
export async function getCashReconciliationSummary(
  tenantId: string,
  daysBack: number = 7,
  /** Alcance de sede (fragmento de filtro): sedes del usuario o la del selector. */
  locationFilter: { locationId?: unknown } = {}
): Promise<{
  count: number
  totalAmount: number
  orders: OrphanedCashOrder[]
  /** Desglose por sede: el consolidado es la suma de las sedes, no una mezcla. */
  bySede: Array<{ locationId: string | null; count: number; totalAmount: number }>
}> {
  await connectDB()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysBack)

  const orders = await Order.find({
    tenantId,
    ...locationFilter,
    'payment.method': 'cash',
    'payment.status': 'approved',
    'payment.cashAdjustmentApplied': { $ne: true },
    status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] },
    createdAt: { $gte: cutoffDate },
    deletedAt: null,
  })
    .select('orderNumber total createdAt customer.name locationId')
    .sort({ createdAt: -1 })
    .lean()

  const bySedeMap = new Map<string, { locationId: string | null; count: number; totalAmount: number }>()
  for (const o of orders) {
    const key = o.locationId ? String(o.locationId) : 'sin-sede'
    const row = bySedeMap.get(key) ?? { locationId: o.locationId ? String(o.locationId) : null, count: 0, totalAmount: 0 }
    row.count += 1
    row.totalAmount += o.total || 0
    bySedeMap.set(key, row)
  }

  return {
    count: orders.length,
    totalAmount: orders.reduce((sum, o) => sum + (o.total || 0), 0),
    bySede: [...bySedeMap.values()],
    orders: orders.map(o => ({
      orderId: o._id.toString(),
      orderNumber: o.orderNumber,
      total: o.total,
      createdAt: o.createdAt,
      customerName: o.customer?.name || 'Cliente',
      locationId: o.locationId ? String(o.locationId) : null,
    })),
  }
}
