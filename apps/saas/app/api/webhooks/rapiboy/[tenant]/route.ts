import { NextResponse, type NextRequest } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PushSubscription from '@/models/PushSubscription'
import { decrypt } from '@/lib/crypto'
import { mapRapiboyStatus, isRapiboyStatusValid, isRapiboyTerminalStatus } from '@/lib/rapiboy/estados'
import { webpush } from '@/lib/webpush'
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

    const {
      CodigoPlataforma,
      IdPedido,           // tripId en Rapiboy
      ReferenciaExterna,  // orderNumber en TakeasyGO
      Estado,             // Código numérico de Rapiboy
      TrackingId,
      NombreChofer,
    } = body

    if (!CodigoPlataforma || !Estado) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Find the location matching this CodigoPlataforma
    let location = await Location.findOne({
      tenantId: tenant._id,
      'rapiboyConfig.codigoPlataforma': String(CodigoPlataforma),
    }).lean() as any

    // Fallback: if no match by codigoPlataforma, find any location with a webhookSecret
    if (!location?.rapiboyConfig?.webhookSecret) {
      location = await Location.findOne({
        tenantId: tenant._id,
        'rapiboyConfig.webhookSecret': { $exists: true, $ne: '' },
      }).lean() as any
    }

    if (!location?.rapiboyConfig?.webhookSecret) {
      console.warn(`[rapiboy-webhook] No webhookSecret configured for tenant ${tenantSlug} (CodigoPlataforma=${CodigoPlataforma})`)
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 404 })
    }

    const expectedSecret = decrypt(location.rapiboyConfig.webhookSecret)
    if (!crypto.timingSafeEqual(Buffer.from(rapiboySecret), Buffer.from(expectedSecret))) {
      console.warn(`[rapiboy-webhook] Invalid signature for location ${location.name} (${location._id})`)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    console.log(`[rapiboy-webhook] Validated secret for location ${location.name} (${location._id}), CodigoPlataforma=${CodigoPlataforma}`)

    // ── 4. Validate estado ──
    if (!isRapiboyStatusValid(Estado)) {
      console.warn(`[rapiboy-webhook] Unknown estado: ${Estado}`)
      return NextResponse.json({ received: true }) // Acknowledge unknown states
    }

    const takeasygoStatus = mapRapiboyStatus(Estado)
    if (!takeasygoStatus) {
      console.warn(`[rapiboy-webhook] No mapping for estado ${Estado}`)
      return NextResponse.json({ received: true })
    }

    // ── 5. Find order ──
    let order = null as any

    // Try by tripId first
    if (IdPedido) {
      order = await Order.findOne({
        tenantId: tenant._id,
        'deliveryProvider.type': 'rapiboy',
        'deliveryProvider.rapiboy.tripId': IdPedido,
      })
    }

    // Fallback to orderNumber (ReferenciaExterna)
    if (!order && ReferenciaExterna) {
      order = await Order.findOne({
        tenantId: tenant._id,
        orderNumber: ReferenciaExterna,
      })
    }

    if (!order) {
      console.warn(`[rapiboy-webhook] Order not found: tripId=${IdPedido}, orderNumber=${ReferenciaExterna}`)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
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

    console.log(`[rapiboy-webhook] Order ${order.orderNumber} updated: ${previousStatus} → ${takeasygoStatus}`)

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
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({
                ...msg,
                icon: '/tgoicon-192.png',
                badge: '/tgoicon-192.png',
                url: '/app',
                tag: `order-${order._id}`,
                orderId: order._id.toString(),
              }),
            )
          }
        }
      } catch (pushErr: any) {
        if (pushErr?.statusCode === 410) {
          await PushSubscription.deleteOne({ clientToken: (order as any).clientToken })
        }
        console.warn('[rapiboy-webhook] Push notification error:', pushErr?.message)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[rapiboy-webhook] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
