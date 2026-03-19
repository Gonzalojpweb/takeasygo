import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import OrdersManager from '@/components/admin/OrdersManager'
import type { Types } from 'mongoose'
import { type Plan, canAccess, PLAN_LABELS } from '@/lib/plans'
import { Lock } from 'lucide-react'

export default async function OrdersPage() {
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

  const now = new Date()
  const [orders, locations, load30m, load60m] = await Promise.all([
    Order.find({ tenantId }).sort({ createdAt: -1 }).limit(50).lean(),
    Location.find({ tenantId }).lean(),
    Order.countDocuments({ tenantId, status: { $nin: ['cancelled'] }, createdAt: { $gte: new Date(now.getTime() - 30 * 60 * 1000) } }),
    Order.countDocuments({ tenantId, status: { $nin: ['cancelled'] }, createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } }),
  ])

  const locationMap = Object.fromEntries(
    locations.map((l: any) => [l._id.toString(), l.name])
  )

  // Para plan trial: contar pedidos activos para mostrar banner de milestone
  const trialOrderCount = tenant.plan === 'trial'
    ? await Order.countDocuments({ tenantId, status: { $nin: ['cancelled'] } })
    : undefined

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Pedidos</h1>
        <p className="text-muted-foreground mt-2 font-medium">Gestiona y haz seguimiento de todas las órdenes en tiempo real.</p>
      </div>

      <OrdersManager
        orders={JSON.parse(JSON.stringify(orders))}
        locationMap={locationMap}
        tenantSlug={tenantSlug || ''}
        trialOrderCount={trialOrderCount}
        load30m={load30m}
        load60m={load60m}
      />
    </div>
  )
}