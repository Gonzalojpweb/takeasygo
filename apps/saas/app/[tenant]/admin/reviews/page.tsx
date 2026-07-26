import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Rating from '@/models/Rating'
import Order from '@/models/Order'
import { Star, MessageSquare } from 'lucide-react'
import ReviewsClient from '@/components/admin/ReviewsClient'

export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await auth()

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name slug')
    .lean() as any

  if (!tenant) redirect('/login')

  const isOwner = session.user.tenantSlug === tenantSlug
  const isSuperadmin = session.user.role === 'superadmin'

  if (!isOwner && !isSuperadmin) redirect('/login')

  const ratings = await Rating.find({ tenantId: tenant._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()

  const orderIds = ratings.map(r => r.orderId)
  const orders = await Order.find({ _id: { $in: orderIds } })
    .select('_id orderNumber customer.name')
    .lean()

  const orderMap = new Map(orders.map(o => [o._id.toString(), o]))

  const enrichedRatings = ratings.map(r => {
    const order = orderMap.get(r.orderId.toString())
    return {
      _id: r._id.toString(),
      stars: r.stars,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      orderNumber: order?.orderNumber ?? '—',
      customerName: order?.customer?.name ?? 'Anónimo',
    }
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Star size={24} className="text-primary" />
          Reseñas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Opiniones de tus clientes sobre sus pedidos
        </p>
      </div>

      {/* Reviews list */}
      <ReviewsClient initialRatings={enrichedRatings} />
    </div>
  )
}
