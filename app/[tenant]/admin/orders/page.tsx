import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import OrdersManager from '@/components/admin/OrdersManager'
import type { Types } from 'mongoose'

export default async function OrdersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const orders = await Order.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  const locations = await Location.find({ tenantId }).lean()
  const locationMap = Object.fromEntries(
    locations.map((l: any) => [l._id.toString(), l.name])
  )

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
      />
    </div>
  )
}