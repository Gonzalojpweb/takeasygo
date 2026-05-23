import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CancelAwaitingPaymentButton from '@/components/orders/CancelAwaitingPaymentButton'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
}

export default async function OrderFailurePage({ params }: Props) {
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
        <div className="text-7xl mb-6">❌</div>
        <h1 className="text-2xl font-black mb-2">Pago rechazado</h1>
        <p className="opacity-60 text-sm mb-8">Hubo un problema con tu pago. Podés intentarlo de nuevo.</p>
        <Link href={`/${tenantSlug}/tracking/${orderNumber}`}>
          <button className="w-full py-4 rounded-2xl font-bold mb-3"
            style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
            Ver mi pedido
          </button>
        </Link>
        {order && order.status === 'awaiting_payment' && (
          <CancelAwaitingPaymentButton
            tenantSlug={tenantSlug}
            orderId={order._id.toString()}
            label="Cancelar pedido"
            className="w-full py-4 rounded-2xl font-bold border-2 mt-2 opacity-70 hover:opacity-100 transition-opacity"
            style={{ borderColor: branding.textColor + '40', color: branding.textColor }}
          />
        )}
      </div>
    </div>
  )
}