import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Rating from '@/models/Rating'
import { verifyRatingToken } from '@/lib/rating-token'
import { notFound } from 'next/navigation'
import RatingForm from '@/components/tracking/RatingForm'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function RatePage({ params, searchParams }: Props) {
  const { tenant: tenantSlug, orderNumber } = await params
  const { token = '' } = await searchParams

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const order = await Order.findOne({ orderNumber, tenantId: tenant._id }).lean() as any
  if (!order) notFound()

  const orderId = order._id.toString()
  const branding = tenant.branding

  // Determinar estado de la calificación
  const tokenValid = verifyRatingToken(orderId, token)
  const isDelivered = order.status === 'delivered'
  const alreadyRated = await Rating.exists({ orderId: order._id })

  const canRate = tokenValid && isDelivered && !alreadyRated

  return (
    <div className="min-h-screen" style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>
      {/* Header */}
      <header className="border-b px-4 py-4" style={{ borderColor: branding.primaryColor + '20' }}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt={tenant.name} className="h-8 object-contain" />
            : <span className="font-bold" style={{ color: branding.primaryColor }}>{tenant.name}</span>
          }
          <span className="text-xs opacity-40">#{orderNumber}</span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black mb-2" style={{ color: branding.textColor }}>
            Calificá tu pedido
          </h1>
          <p className="text-sm opacity-50">Tu opinión es solo para el restaurante</p>
        </div>

        {!isDelivered && (
          <div className="text-center py-12 opacity-60">
            <div className="text-5xl mb-4">⏳</div>
            <p className="font-semibold">El pedido aún no fue retirado</p>
            <p className="text-xs mt-1">Podés calificarlo después de retirarlo</p>
          </div>
        )}

        {isDelivered && !tokenValid && (
          <div className="text-center py-12 opacity-60">
            <div className="text-5xl mb-4">🔒</div>
            <p className="font-semibold">Link inválido</p>
            <p className="text-xs mt-1">Este enlace no es válido</p>
          </div>
        )}

        {isDelivered && tokenValid && alreadyRated && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">✅</div>
            <p className="font-semibold">Ya calificaste este pedido</p>
            <p className="text-xs mt-2 opacity-50">¡Gracias por tu opinión!</p>
          </div>
        )}

        {canRate && (
          <RatingForm
            orderId={orderId}
            orderNumber={orderNumber}
            tenantSlug={tenantSlug}
            token={token}
            primaryColor={branding.primaryColor}
            backgroundColor={branding.backgroundColor}
            textColor={branding.textColor}
          />
        )}
      </main>
    </div>
  )
}
