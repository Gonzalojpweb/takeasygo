import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import OrdersBoardWrapper from '@/components/admin/orders/OrdersBoardWrapper'
import type { Types } from 'mongoose'
import { type Plan, canAccess, PLAN_LABELS } from '@/lib/plans'
import { Lock } from 'lucide-react'
import { safeDecrypt } from '@/lib/crypto'

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

  const orders = await Order.find({ tenantId, deletedAt: null, status: { $ne: 'awaiting_payment' } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()

  const locations = await Location.find({ tenantId }).lean()

  const locationMap = Object.fromEntries(
    locations.map((l: any) => [l._id.toString(), l.name])
  )

  const serializedLocations = JSON.parse(JSON.stringify(locations)).map((l: any) => ({
    _id: l._id.toString(),
    name: l.name,
  }))

  const userAssignedLocations = session?.user?.assignedLocations ?? []

  const decryptedOrders = orders.map((o: any) => ({
    ...o,
    customer: {
      ...o.customer,
      name: safeDecrypt(o.customer.name),
      phone: safeDecrypt(o.customer.phone),
      email: safeDecrypt(o.customer.email),
    },
    locationName: locationMap[o.locationId?.toString()] || 'Sede',
  }))

  return (
    <div className="flex-1 min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <OrdersBoardWrapper
        orders={JSON.parse(JSON.stringify(decryptedOrders))}
        tenantSlug={tenantSlug || ''}
        locations={serializedLocations}
        userAssignedLocations={userAssignedLocations}
      />
    </div>
  )
}
