import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CancelAwaitingPaymentButton from '@/components/orders/CancelAwaitingPaymentButton'
import { parseMpReturnOutcome, parseMpStatusDetail, mpStatusDetailMessage } from '@/lib/mp-return'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function OrderPendingPage({ params, searchParams }: Props) {
  const { tenant: tenantSlug, orderNumber } = await params
  const sp = await searchParams
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
  if (!tenant) notFound()

  const order = await Order.findOne({ orderNumber, tenantId: tenant._id })
    .select('_id status payment.method trackingToken')
    .lean() as any

  const branding = tenant.branding

  // MP manda ?status=... en la back_url. Si llegamos acá con un rechazo
  // explícito, mostremos el motivo real en vez de "pago pendiente".
  const outcome = parseMpReturnOutcome(sp)
  const detail = parseMpStatusDetail(sp)
  const detailMessage = mpStatusDetailMessage(detail)
  const rejected = outcome === 'rejected'

  const canExit = order?.status === 'awaiting_payment'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>
      <div className="text-center max-w-sm">
        <div className="text-7xl mb-6">{rejected ? '❌' : '⏳'}</div>
        <h1 className="text-2xl font-black mb-2">
          {rejected ? 'Pago rechazado' : 'Pago pendiente'}
        </h1>
        <p className="opacity-60 text-sm mb-4">
          {rejected
            ? 'MercadoPago no pudo procesar tu pago. Tu pedido sigue sin confirmar.'
            : 'Tu pago está siendo procesado. Te avisaremos cuando se confirme.'}
        </p>

        {rejected && (detailMessage || detail) && (
          <div className="mb-5 rounded-2xl px-4 py-3 text-sm"
            style={{ backgroundColor: branding.primaryColor + '15' }}>
            <span className="font-semibold">{detailMessage ?? `Motivo: ${detail}`}</span>
          </div>
        )}

        {canExit && (
          <p className="text-xs opacity-70 mb-5">
            Tu pedido <strong>#{orderNumber}</strong> no fue cobrado. Podés cancelarlo
            y volver a empezar cuando quieras.
          </p>
        )}

        <Link href={`/${tenantSlug}/tracking/${orderNumber}`}>
          <button className="w-full py-4 rounded-2xl font-bold"
            style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
            Ver estado del pedido
          </button>
        </Link>
        {canExit && (
          <CancelAwaitingPaymentButton
            tenantSlug={tenantSlug}
            orderId={order._id.toString()}
            trackingToken={order.trackingToken ?? null}
            label="Cancelar pedido"
            className="w-full py-4 rounded-2xl font-bold border-2 mt-3 opacity-70 hover:opacity-100 transition-opacity"
            style={{ borderColor: branding.textColor + '40', color: branding.textColor }}
          />
        )}
        <Link href={`/${tenantSlug}`}>
          <button className="w-full py-3 rounded-2xl font-bold text-sm mt-3 opacity-50 hover:opacity-80 transition-opacity">
            Volver al menú
          </button>
        </Link>
      </div>
    </div>
  )
}
