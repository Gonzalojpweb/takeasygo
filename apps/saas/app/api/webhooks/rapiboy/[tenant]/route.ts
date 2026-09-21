import { NextResponse, type NextRequest } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PushSubscription from '@/models/PushSubscription'
import { decrypt } from '@/lib/crypto'
import { mapRapiboyStatus, isRapiboyStatusValid, isRapiboyTerminalStatus } from '@/lib/rapiboy/estados'
import { sendPushToSubscription } from '@/lib/push'
import crypto from 'crypto'

// ─── Rapiboy Webhook ────────────────────────────────────────────────────────
//
// POST /api/webhooks/rapiboy/[tenant]
//
// Recibe notificaciones de Rapiboy sobre cambios de estado de viajes.
// Valida el header X-Rapiboy-Secret contra el webhookSecret de la sede.
// Busca el pedido por deliveryProvider.rapiboy.tripId o por ReferenciaExterna.
// Actualiza el estado del pedido y notifica al cliente.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await params

    await connectDB()

    // ── 1. Parse body ──
    const body = await request.json()

    console.log('[rapiboy-webhook] Body recibido:', JSON.stringify(body, null, 2))
    console.log('[rapiboy-webhook] Headers:', JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2))

    // ── Normalize field names (Rapiboy may send PascalCase or camelCase) ──
    const CodigoPlataforma = body.CodigoPlataforma ?? body.codigoPlataforma ?? null
    const IdPedido = body.IdPedido ?? body.idPedido ?? body.IdPedido ?? null
    const ReferenciaExterna = body.ReferenciaExterna ?? body.referenciaExterna ?? null
    const Estado = body.Estado ?? body.estado ?? null
    const TrackingId = body.TrackingId ?? body.trackingId ?? null
    const NombreChofer = body.NombreChofer ?? body.nombreChofer ?? body.Nombre ?? body.nombre ?? null

    // Rapiboy only requires Estado (or a known order identifier)
    if (Estado === null || Estado === undefined) {
      console.warn('[rapiboy-webhook] Missing Estado field. Body:', JSON.stringify(body))
      return NextResponse.json({ error: 'Missing required fields: Estado' }, { status: 400 })
    }

    // ── 2. Find tenant ──
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // ── 3. Validate webhook secret ──
    const rapiboySecret = request.headers.get('x-rapiboy-secret')
    if (!rapiboySecret) {
      console.warn('[rapiboy-webhook] Missing X-Rapiboy-Secret header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    // Find location: first by CodigoPlataforma, then fallback to any with webhookSecret
    let location = null as any
    if (CodigoPlataforma) {
      location = await Location.findOne({
        tenantId: tenant._id,
        'rapiboyConfig.codigoPlataforma': String(CodigoPlataforma),
      }).lean() as any
    }

    if (!location?.rapiboyConfig?.webhookSecret) {
      location = await Location.findOne({
        tenantId: tenant._id,
        'rapiboyConfig.webhookSecret': { $exists: true, $ne: '' },
      }).lean() as any
    }

    if (!location?.rapiboyConfig?.webhookSecret) {
      console.warn(`[rapiboy-webhook] No webhookSecret configured for tenant ${tenantSlug}`)
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 404 })
    }

    const expectedSecret = decrypt(location.rapiboyConfig.webhookSecret)

    // Safe comparison — handle different lengths without throwing
    const secretMatch = rapiboySecret.length === expectedSecret.length &&
      crypto.timingSafeEqual(Buffer.from(rapiboySecret), Buffer.from(expectedSecret))

    if (!secretMatch) {
      console.warn(`[rapiboy-webhook] Invalid signature for location ${location.name} (${location._id})`)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    console.log(`[rapiboy-webhook] ✓ Secret validated for location ${location.name} (${location._id}), CodigoPlataforma=${CodigoPlataforma}`)

    // ── 4. Validate estado ──
    if (!isRapiboyStatusValid(Estado)) {
      console.warn(`[rapiboy-webhook] Unknown estado: ${Estado}. Acknowledging.`)
      return NextResponse.json({ received: true })
    }

    const takeasygoStatus = mapRapiboyStatus(Estado)
    if (!takeasygoStatus) {
      console.warn(`[rapiboy-webhook] No mapping for estado ${Estado}. Acknowledging.`)
      return NextResponse.json({ received: true })
    }

    // ── 5. Find order ──
    let order = null as any

    // Try by tripId first
    if (IdPedido) {
      order = await Order.findOne({
        tenantId: tenant._id,
        'deliveryProvider.type': 'rapiboy',
        'deliveryProvider.rapiboy.tripId': String(IdPedido),
      })
    }

    // Fallback to orderNumber (ReferenciaExterna)
    if (!order && ReferenciaExterna) {
      order = await Order.findOne({
        tenantId: tenant._id,
        orderNumber: String(ReferenciaExterna),
      })
    }

    if (!order) {
      console.warn(`[rapiboy-webhook] Order not found: tripId=${IdPedido}, orderNumber=${ReferenciaExterna}. Acknowledging.`)
      return NextResponse.json({ received: true, note: 'Order not found but acknowledged' })
    }

    // ── 6. Update order status ──
    const previousStatus = order.status
    order.status = takeasygoStatus as any

    // Update delivery provider info
    if (order.deliveryProvider?.rapiboy) {
      if (TrackingId) {
        order.deliveryProvider.rapiboy.trackingId = TrackingId
      }
      if (NombreChofer) {
        order.deliveryProvider.rapiboy.driverName = NombreChofer
      }
    }

    // Update delivery confirmation status
    if (order.deliveryConfirmation) {
      if (takeasygoStatus === 'en_ruta') {
        order.deliveryConfirmation.status = 'assigned'
      } else if (takeasygoStatus === 'arrived') {
        order.deliveryConfirmation.status = 'arrived'
        order.deliveryConfirmation.arrivalAt = new Date()
      } else if (takeasygoStatus === 'delivered') {
        order.deliveryConfirmation.status = 'completed'
        order.deliveryConfirmation.completedAt = new Date()
      } else if (takeasygoStatus === 'cancelled') {
        order.deliveryConfirmation.status = 'disputed'
      }
    }

    // Record timestamp
    const STATUS_TIMESTAMP: Record<string, string> = {
      confirmed: 'confirmedAt',
      preparing: 'preparingAt',
      ready: 'readyAt',
      en_ruta: 'enRutaAt',
      arrived: 'arrivedAt',
      delivered: 'deliveredAt',
      cancelled: 'cancelledAt',
    }
    const tsField = STATUS_TIMESTAMP[takeasygoStatus]
    if (tsField) {
      order.statusTimestamps[tsField] = new Date()
    }

    await order.save()

    console.log(`[rapiboy-webhook] ✓ Order ${order.orderNumber} updated: ${previousStatus} → ${takeasygoStatus}`)

    // ── 7. Notify customer (fire-and-forget) ──
    if (isRapiboyTerminalStatus(Estado) || takeasygoStatus === 'en_ruta' || takeasygoStatus === 'arrived') {
      try {
        const sub = await PushSubscription.findOne({ clientToken: (order as any).clientToken }).lean()
        if (sub) {
          const messages: Record<string, { title: string; body: string }> = {
            en_ruta: {
              title: '🚀 ¡Tu delivery va en camino!',
              body: `Pedido #${order.orderNumber} — ${NombreChofer || 'El repartidor'} está yendo a tu domicilio.`,
            },
            arrived: {
              title: '📍 ¡Tu delivery llegó!',
              body: `Pedido #${order.orderNumber} — ${NombreChofer || 'El repartidor'} está en tu domicilio.`,
            },
            delivered: {
              title: '✅ ¡Pedido entregado!',
              body: `Pedido #${order.orderNumber} fue entregado exitosamente.`,
            },
            cancelled: {
              title: '❌ Pedido cancelado',
              body: `Pedido #${order.orderNumber} fue cancelado. Contactá al restaurante para más info.`,
            },
          }

          const msg = messages[takeasygoStatus]
          if (msg) {
            await sendPushToSubscription(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, clientToken: (order as any).clientToken },
              msg.title,
              msg.body,
              '/app',
            )
          }
        }
      } catch (pushErr: any) {
        console.warn('[rapiboy-webhook] Push notification error:', pushErr?.message)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[rapiboy-webhook] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
