import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import OrdersManager from '@/components/admin/OrdersManager'
import type { Types } from 'mongoose'
import type { Plan } from '@/lib/plans'

export default async function OrdersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan: Plan }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const [orders, locations] = await Promise.all([
    Order.find({ tenantId }).sort({ createdAt: -1 }).limit(50).lean(),
    Location.find({ tenantId }).lean(),
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
      />
    </div>
  )
}