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

  // FASE WALLET: Buscar si el cliente es miembro del club para mostrar el botón de Wallet
  let loyaltyData: {
    memberId: string
    publicId: string
    points: number
    name: string
    tier: string
  } | null = null
  if (tenant.loyalty?.enabled && tenant.wallet?.enabled) {
    const LoyaltyMember = (await import('@/models/LoyaltyMember')).default
    const member = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash: order.customer.phoneHash,
      status: 'active'
    }).select('wallet.publicId name phone loyalty.points').lean() as any

    if (member) {
      // RECONCILIACIÓN: Si hay puntos de esta orden que no se sumaron, lo hacemos ahora.
      // Le pasamos explicitly si MP lo aprobó por URL params para saltarnos la demora del Webhook
      const isMpApproved = searchParams.status === 'approved' || searchParams.collection_status === 'approved'
      const { reconcileMissingPoints } = await import('@/lib/loyalty')
      await reconcileMissingPoints(member, tenant, isMpApproved ? order._id : undefined)
      
      // Volvemos a buscar para tener los puntos actualizados
      const updatedMember = await LoyaltyMember.findById(member._id).select('loyalty.points wallet.publicId').lean() as any

      loyaltyData = {
        memberId: member._id.toString(),
        publicId: updatedMember.wallet?.publicId || member.wallet?.publicId,
        points: updatedMember.loyalty?.points ?? member.loyalty?.points ?? 0,
        name: member.name,
        tier: member.loyalty?.tier ?? 'none'
      }
    }
  }

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
          initialOrderTiming={order.orderTiming ?? 'immediate'}
          initialScheduledPickupAt={order.scheduledPickupAt?.toISOString() ?? null}
          initialScheduledStatus={order.scheduledStatus ?? null}
          loyaltyData={loyaltyData}
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
