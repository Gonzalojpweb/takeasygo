import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { notFound } from 'next/navigation'
import OrderTracker from '@/components/tracking/OrderTracker'
import { generateRatingToken } from '@/lib/rating-token'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
}

export default async function TrackingPage({ params }: Props) {
  const { tenant: tenantSlug, orderNumber } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const order = await Order.findOne({ orderNumber, tenantId: tenant._id }).lean() as any
  if (!order) notFound()

  const branding = tenant.branding

  // NEXTAUTH_SECRET requerido para el token — si falta en env el token es null en lugar de crashear
  const ratingToken = process.env.NEXTAUTH_SECRET
    ? generateRatingToken(order._id.toString())
    : null

  return (
    <div className="min-h-screen" style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>

      {/* Header */}
      <header className="border-b px-4 py-4" style={{ borderColor: branding.primaryColor + '20' }}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt={tenant.name} className="h-8 object-contain" />
            : <span className="font-bold" style={{ color: branding.primaryColor }}>{tenant.name}</span>
          }
          <span className="text-xs opacity-40">#{order.orderNumber}</span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">

        {/* Status + progreso + CTA — todo reactivo con polling */}
        <OrderTracker
          orderId={order._id.toString()}
          tenantSlug={tenantSlug}
          locationId={order.locationId?.toString() ?? ''}
          initialStatus={order.status}
          initialEstimatedReadyAt={order.statusTimestamps?.estimatedReadyAt?.toISOString() ?? null}
          primaryColor={branding.primaryColor}
          backgroundColor={branding.backgroundColor}
          textColor={branding.textColor}
          orderNumber={order.orderNumber}
          ratingToken={ratingToken}
        />

        {/* Resumen del pedido */}
        <div className="rounded-2xl p-4 mb-6"
          style={{ backgroundColor: branding.primaryColor + '08', border: `1px solid ${branding.primaryColor}20` }}>
          <h2 className="font-semibold text-sm opacity-50 uppercase tracking-wide mb-3">Tu pedido</h2>
          <div className="space-y-2">
            {order.items.map((item: any) => (
              <div key={item._id} className="flex justify-between text-sm">
                <span className="opacity-80">{item.quantity}x {item.name}</span>
                <span className="font-medium">${item.subtotal.toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 flex justify-between font-bold"
            style={{ borderColor: branding.primaryColor + '20' }}>
            <span>Total</span>
            <span style={{ color: branding.primaryColor }}>${order.total.toLocaleString('es-AR')}</span>
          </div>
        </div>

        <p className="text-center text-sm opacity-40">Pedido para {order.customer.name}</p>

      </main>
    </div>
  )
}
