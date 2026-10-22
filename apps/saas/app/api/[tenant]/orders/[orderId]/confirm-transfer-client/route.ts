import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsApp } from '@/lib/whatsapp'
import { safeDecrypt } from '@/lib/crypto'
import { toPesos } from '@takeasygo/business'
import { sendAdminPushNotification } from '@/lib/push'
import { rateLimit } from '@/lib/rateLimit'
import { resolveAdminWhatsApp } from '@/lib/location-resolvers'
import { getBaseUrl } from '@/lib/site-url'
import { runAfterResponse } from '@/lib/after-response'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const { success } = await rateLimit(
      `transfer-client:${tenantSlug}:${orderId}:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Endpoint público (tracking sin sesión): x-tracking-token obligatorio.
    const trackingToken = request.headers.get('x-tracking-token')
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (!order.trackingToken || order.trackingToken !== trackingToken) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    if (order.payment.method !== 'transfer') {
      return NextResponse.json({ error: 'Esta orden no es de tipo transferencia' }, { status: 400 })
    }

    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'El pedido no está esperando pago' }, { status: 400 })
    }

    order.status = 'awaiting_confirmation'
    await order.save()

    // ── Imprimir comanda al confirmar transferencia ──────────────────
    const { onOrderConfirmed } = await import('@/lib/printing')
    runAfterResponse('onOrderConfirmed', () => onOrderConfirmed(order))

    // ── Notificar al restaurante via WhatsApp ───────────────────────
    // Destino y flags con override por sede de ESTA orden.
    const waTarget = await resolveAdminWhatsApp(tenant, order.locationId?.toString())
    if (waTarget.phone && waTarget.notifyOnOrder) {
      const baseUrl = getBaseUrl(request)
      const customerName = safeDecrypt(order.customer?.name) || 'Cliente'
      const amount = order.total || 0
      const waMessage =
`🔔 *${customerName}* reportó una transferencia de *$${toPesos(amount).toLocaleString('es-AR')}* (pedido #${order.orderNumber}).

Ingresá al panel para confirmar el pago:
${baseUrl}/${tenantSlug}/admin/orders`

      sendWhatsApp(waTarget.phone, waMessage)
        .catch(e => console.error('[whapi] transfer notification error:', e))
    }

    // ── Push a admins (fire-and-forget) ───────────────────────────
    // El pedido pasa a ser visible en el workspace (awaiting_confirmation) y
    // el admin debe ser notificado una sola vez, en este momento accionable.
    const customerName = safeDecrypt(order.customer?.name) || 'Cliente'
    setImmediate(async () => {
      try {
        await sendAdminPushNotification(
          tenant._id.toString(),
          tenant.plan ?? 'trial',
          tenant.name,
          tenant.slug,
          order.orderNumber,
          order.total || 0,
          customerName,
          order.locationId?.toString()
        )
      } catch (err) {
        console.error('[transfer-client] Admin push error:', (err as Error)?.message)
      }
    })

    return NextResponse.json({ status: order.status })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
