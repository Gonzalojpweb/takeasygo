import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Location from '@/models/Location'
import Rating from '@/models/Rating'
import StoreRedemption from '@/models/StoreRedemption'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import OrdersBoardWrapper from '@/components/admin/orders/OrdersBoardWrapper'
import AdminKPIBar from '@/components/admin/orders/AdminKPIBar'
import type { Types } from 'mongoose'
import { type Plan, canAccess, PLAN_LABELS } from '@/lib/plans'
import { Lock } from 'lucide-react'
import { safeDecrypt } from '@/lib/crypto'
import { resolvePrintLeadMinutes, getPrintNotBefore } from '@/lib/printing/printTiming'

export default async function OrdersPage() {
  const session = await auth()
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan: Plan }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  if (!canAccess(plan, 'orders')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Pedidos</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad no está incluida en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[plan]}</span>.
            Contactá al soporte para actualizar tu plan.
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  const tenantId = tenant._id

  // ── Aislamiento por sede ────────────────────────────────────────────────
  // Un usuario con assignedLocations (manager/cashier/staff scoped) solo ve
  // pedidos de SUS sedes. Admin/superadmin (y usuarios legacy sin scope)
  // ven todo el tenant. Mismo criterio que canAccessLocation (location-scope).
  const userRole = session?.user?.role
  const userAssignedLocations = session?.user?.assignedLocations ?? []
  const isFullScopeUser = userRole === 'admin' || userRole === 'superadmin'

  const ordersQuery: Record<string, unknown> = { tenantId, deletedAt: null }
  if (!isFullScopeUser && userAssignedLocations.length > 0) {
    ordersQuery.locationId = { $in: userAssignedLocations }
  }

  const orders = await Order.find(ordersQuery)
    .sort({ createdAt: -1 })
    .lean()

  // Estado de los canjes de premio del pedido (StoreRedemption) para que el
  // panel muestre nombre + puntos + estado de cada premio.
  const rewardOrderIds = orders
    .filter((o: any) => (o.rewardItems?.length ?? 0) > 0)
    .map((o: any) => o._id)
  const redemptionStatusByOrder = new Map<string, Map<string, string>>()
  if (rewardOrderIds.length > 0) {
    const rewardRedemptions = await StoreRedemption.find({ tenantId, orderId: { $in: rewardOrderIds } })
      .select('orderId storeItemId status')
      .lean()
    for (const r of rewardRedemptions as any[]) {
      const orderKey = r.orderId?.toString()
      const itemKey = r.storeItemId?.toString()
      if (!orderKey || !itemKey) continue
      if (!redemptionStatusByOrder.has(orderKey)) redemptionStatusByOrder.set(orderKey, new Map())
      redemptionStatusByOrder.get(orderKey)!.set(itemKey, r.status)
    }
  }

  const locations = await Location.find({ tenantId }).lean()

  const locationMap = Object.fromEntries(
    locations.map((l: any) => [l._id.toString(), {
      name: l.name,
      lat: l.geo?.coordinates?.[1],
      lng: l.geo?.coordinates?.[0],
      printLeadMinutes: resolvePrintLeadMinutes(l.scheduledOrdersConfig),
    }])
  )

  const serializedLocations = JSON.parse(JSON.stringify(locations)).map((l: any) => ({
    _id: l._id.toString(),
    name: l.name,
  }))

  const decryptedOrders = orders.map((o: any) => ({
    ...o,
    customer: {
      ...o.customer,
      name: safeDecrypt(o.customer.name),
      phone: safeDecrypt(o.customer.phone),
      email: safeDecrypt(o.customer.email),
    },
    rewardItems: (o.rewardItems ?? []).map((r: any) => ({
      ...r,
      redemptionStatus:
        redemptionStatusByOrder.get(o._id.toString())?.get(r.storeItemId?.toString() ?? '') ?? null,
    })),
    locationName: locationMap[o.locationId?.toString()]?.name || 'Sede',
    locationLat: locationMap[o.locationId?.toString()]?.lat ?? null,
    locationLng: locationMap[o.locationId?.toString()]?.lng ?? null,
    // Momento en que el pedido programado pasa a ser imprimible/accionable
    // (T-lead). Server-side para que el cliente no calcule con la config.
    printNotBefore: getPrintNotBefore(
      o,
      locationMap[o.locationId?.toString()]?.printLeadMinutes
    )?.toISOString() ?? null,
  }))

  // Recent ratings for admin toast (piggyback on board refresh)
  const recentRatingsRaw = await Rating.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('orderId stars comment createdAt')
    .lean()

  const ratingOrderIds = recentRatingsRaw.map(r => r.orderId)
  const ratingOrders = await Order.find({ _id: { $in: ratingOrderIds } })
    .select('_id orderNumber locationId')
    .lean()
  const ratingOrderMap = new Map(ratingOrders.map(o => [o._id.toString(), o]))

  const recentRatings = recentRatingsRaw
    .filter((r) => {
      // Mismo aislamiento que los pedidos: usuarios scoped no ven reseñas
      // de pedidos de otras sedes.
      if (isFullScopeUser || userAssignedLocations.length === 0) return true
      const orderLoc = ratingOrderMap.get(r.orderId.toString())?.locationId?.toString()
      return orderLoc ? userAssignedLocations.includes(orderLoc) : false
    })
    .map((r) => ({
      _id: r._id.toString(),
      stars: r.stars,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      orderNumber: ratingOrderMap.get(r.orderId.toString())?.orderNumber ?? '—',
    }))

  return (
    <div className="flex-1 min-h-0 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 is-admin-orders-page">
      <AdminKPIBar userName={session?.user?.name || 'Admin'} />
      <div className="flex-1 min-h-0">
        <OrdersBoardWrapper
          orders={JSON.parse(JSON.stringify(decryptedOrders))}
          tenantSlug={tenantSlug || ''}
          locations={serializedLocations}
          userAssignedLocations={userAssignedLocations}
          recentRatings={recentRatings}
        />
      </div>
    </div>
  )
}
