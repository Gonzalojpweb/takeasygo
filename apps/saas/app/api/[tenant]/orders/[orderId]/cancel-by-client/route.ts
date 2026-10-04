import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { maybeNotifySyncLayerStatus } from '@/lib/order-side-effects'
import { rateLimit } from '@/lib/rateLimit'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/[tenant]/orders/[orderId]/cancel-by-client
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️  ESTE ENDPOINT NO ACEPTA MERCADOPAGO — Y NO HAY QUE AGREGARLO
 * ══════════════════════════════════════════════════════════════════════════
 * Si `payment.method === 'mercadopago'` el cobro ya puede haberse acreditado
 * (webhook `approved`). Cancelar acá SOLO cambia el estado de la orden: NO
 * devuelve la plata. Reembolsar a MP requiere llamar a la API de reembolsos
 * de MercadoPago con el `payment_id` real — es otra operación, con otros
 * permisos y otros efectos.
 *
 * Por eso este endpoint se limita a transferencia/efectivo (donde no hay
 * cobro automático que revertir).
 *
 * NO FUSIONAR con `cancel-awaiting/route.ts`: ese endpoint opera sobre
 * pedidos en `awaiting_payment` que NUNCA llegaron a cobrarse, así que ahí
 * sí es seguro cancelar sin reembolso. Si se unifican los dos se
 * reintroduce el bug de pedidos de MP cancelados sin devolver el dinero.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Para un pedido MP varado en `awaiting_payment` (nunca cobrado) la salida
 * válida es `cancel-awaiting`, no este.
 */

const CANCELLATION_WINDOW_MS = 180_000 // 3 minutos

const CANCELLABLE_BY_TRANSFER = ['pending', 'awaiting_confirmation']
const CANCELLABLE_BY_CASH = ['pending', 'awaiting_confirmation', 'confirmed']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    // Rate limit: 10 intentos por minuto por IP+orden
    const { success } = await rateLimit(`cancel-client:${tenantSlug}:${orderId}:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Validar tracking token (autenticación del cliente)
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

    // Idempotencia: si ya está cancelado, devolver éxito silencioso
    if (order.status === 'cancelled') {
      return NextResponse.json({ ok: true, message: 'Tu pedido ya fue cancelado' })
    }

    // Validar método de pago
    const paymentMethod = order.payment?.method
    if (paymentMethod !== 'transfer' && paymentMethod !== 'cash') {
      return NextResponse.json(
        { error: 'Solo podés cancelar pedidos pagados por transferencia o efectivo' },
        { status: 400 }
      )
    }

    // Validar estados permitidos según método de pago
    const allowedStatuses = paymentMethod === 'transfer' ? CANCELLABLE_BY_TRANSFER : CANCELLABLE_BY_CASH
    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: 'Tu pedido ya no puede ser cancelado desde esta pantalla' },
        { status: 400 }
      )
    }

    // Validar ventana de tiempo (3 minutos)
    const referenceTime = order.statusTimestamps?.confirmedAt || order.createdAt
    const elapsed = Date.now() - new Date(referenceTime).getTime()
    if (elapsed >= CANCELLATION_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Se acabó el tiempo para cancelar. Contactá al restaurante directamente.' },
        { status: 400 }
      )
    }

    // Cancelar
    order.status = 'cancelled'
    order.statusTimestamps.cancelledAt = new Date()
    order.cancelledBy = 'client'
    // Efectivo: el cobro nunca se concretó → cancelado, no "pendiente".
    if (order.payment?.method === 'cash' && order.payment.status === 'pending') {
      order.payment.status = 'cancelled'
    }
    // Impresión en cocina diferida (flujo cash): no imprimir, limpiar el flag.
    const { settleDeferredKitchenPrint } = await import('@/lib/printing')
    await settleDeferredKitchenPrint(order, { print: false })
    await revertRewardRedemptions(order, tenant)
    await order.save()

    // SyncLayer: el POS Online suelta el pedido cancelado por el cliente
    maybeNotifySyncLayerStatus({ order, tenant })

    // Cancelar viaje Rapiboy si existe
    if (order.deliveryProvider?.type === 'rapiboy' && order.deliveryProvider.rapiboy?.tripId) {
      try {
        const { cancelarViaje } = await import('@/lib/rapiboy/client')
        const Location = (await import('@/models/Location')).default
        const rapiboyLoc = await Location.findById(order.locationId).select('rapiboyConfig').lean()
        if (rapiboyLoc?.rapiboyConfig?.enabled) {
          await cancelarViaje(
            order.deliveryProvider.rapiboy.tripId,
            2, // Motivo: Cancelado por cliente
            {
              apiToken: rapiboyLoc.rapiboyConfig.apiToken,
              environment: rapiboyLoc.rapiboyConfig.environment as 'production' | 'uat',
              codigoPlataforma: rapiboyLoc.rapiboyConfig.codigoPlataforma,
            }
          )
          console.log(`[cancel-by-client] Rapiboy trip cancelled for order ${orderId}`)
        }
      } catch (err) {
        console.error('[cancel-by-client] Error cancelling Rapiboy trip:', err)
      }
    }

    // Notificar al admin (SystemAnnouncement in-app)
    const orderNumber = order.orderNumber || orderId
    const customerName = order.customer?.name || 'Cliente'
    const methodLabel = paymentMethod === 'transfer' ? 'transferencia' : 'efectivo'

    await SystemAnnouncement.create({
      title: `Pedido #${orderNumber} cancelado por el cliente`,
      content: `${customerName} canceló el pedido #${orderNumber} (${methodLabel}). Verificá el estado en el panel de pedidos.`,
      type: 'alert',
      status: 'published',
      publishedAt: new Date(),
      targetPlans: [],
      targetTenantIds: [tenant._id],
      readBy: [],
      acceptances: [],
      requiresConsent: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días TTL
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /cancel-by-client]', error)
    return NextResponse.json({ error: 'Error al cancelar el pedido' }, { status: 500 })
  }
}
