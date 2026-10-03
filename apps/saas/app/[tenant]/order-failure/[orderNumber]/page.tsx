import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CancelAwaitingPaymentButton from '@/components/orders/CancelAwaitingPaymentButton'
import PaymentMethodRetry from '@/components/orders/PaymentMethodRetry'
import { parseMpReturnOutcome, parseMpStatusDetail, mpStatusDetailMessage } from '@/lib/mp-return'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function OrderFailurePage({ params, searchParams }: Props) {
  const { tenant: tenantSlug, orderNumber } = await params
  const sp = await searchParams
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
  if (!tenant) notFound()

  const order = await Order.findOne({ orderNumber, tenantId: tenant._id })
    .select('_id status payment.method trackingToken')
    .lean() as any

  const branding = tenant.branding

  // MercadoPago informa el motivo del rechazo en la query string de la back_url.
  // Es la ÚNICA señal que tenemos cuando MP falló en su propio checkout (no hay
  // webhook porque nunca se creó el payment). On-read, no cron.
  const outcome = parseMpReturnOutcome(sp)
  const detail = parseMpStatusDetail(sp)
  const detailMessage = mpStatusDetailMessage(detail)
  // MP a veces manda status=pending a la URL de failure (y viceversa); si nos
  // dice que quedó pendiente, no le mintamos diciendo "rechazado".
  const rejected = outcome !== 'pending'

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
            : 'Tu pago está siendo procesado por MercadoPago.'}
        </p>

        {/* Motivo específico que devolvió MP, si lo hay */}
        {rejected && (detailMessage || detail) && (
          <div className="mb-5 rounded-2xl px-4 py-3 text-sm"
            style={{ backgroundColor: branding.primaryColor + '15' }}>
            <span className="font-semibold">{detailMessage ?? `Motivo: ${detail}`}</span>
          </div>
        )}

        {canExit && (
          <p className="text-xs opacity-70 mb-5">
            Tu pedido <strong>#{orderNumber}</strong> no fue cobrado. Podés pagarlo con
            otro método o cancelarlo y volver a empezar cuando quieras.
          </p>
        )}

        <Link href={`/${tenantSlug}/tracking/${orderNumber}`}>
          <button className="w-full py-4 rounded-2xl font-bold mb-3"
            style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
            Ver mi pedido
          </button>
        </Link>
        {canExit && (
          <>
            {/* Reintentar/cambiar el método conserva el pedido; cancelar es la
                última instancia porque obliga a rearmar el carrito. */}
            <div className="mb-3">
              <PaymentMethodRetry
                tenantSlug={tenantSlug}
                orderId={order._id.toString()}
                orderNumber={orderNumber}
                trackingToken={order.trackingToken ?? null}
                primaryColor={branding.primaryColor}
                textColor={branding.textColor}
              />
            </div>
            <CancelAwaitingPaymentButton
              tenantSlug={tenantSlug}
              orderId={order._id.toString()}
              trackingToken={order.trackingToken ?? null}
              label="Cancelar pedido"
              className="w-full py-4 rounded-2xl font-bold border-2 mt-2 opacity-70 hover:opacity-100 transition-opacity"
              style={{ borderColor: branding.textColor + '40', color: branding.textColor }}
            />
          </>
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
