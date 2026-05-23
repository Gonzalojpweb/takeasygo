import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CancelAwaitingPaymentButton from '@/components/orders/CancelAwaitingPaymentButton'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
}

export default async function OrderPendingPage({ params }: Props) {
  const { tenant: tenantSlug, orderNumber } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
  if (!tenant) notFound()

  const order = await Order.findOne({ orderNumber, tenantId: tenant._id }).select('_id status').lean() as any

  const branding = tenant.branding

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>
      <div className="text-center max-w-sm">
        <div className="text-7xl mb-6">⏳</div>
        <h1 className="text-2xl font-black mb-2">Pago pendiente</h1>
        <p className="opacity-60 text-sm mb-8">Tu pago está siendo procesado. Te avisaremos cuando se confirme.</p>
        <Link href={`/${tenantSlug}/tracking/${orderNumber}`}>
          <button className="w-full py-4 rounded-2xl font-bold"
            style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
            Ver estado del pedido
          </button>
        </Link>
        {order && order.status === 'awaiting_payment' && (
          <CancelAwaitingPaymentButton
            tenantSlug={tenantSlug}
            orderId={order._id.toString()}
            label="Cancelar pedido"
            className="w-full py-4 rounded-2xl font-bold border-2 mt-3 opacity-70 hover:opacity-100 transition-opacity"
            style={{ borderColor: branding.textColor + '40', color: branding.textColor }}
          />
        )}
      </div>
    </div>
  )
}