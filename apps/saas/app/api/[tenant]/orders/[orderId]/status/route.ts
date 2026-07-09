import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PushSubscription from '@/models/PushSubscription'
import DeliveryPushSubscription from '@/models/DeliveryPushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { triggerBackgroundAdjustment } from '@/lib/hooks/useEstimatedTimeAdjustment'
import { addPointsFromOrder } from '@/lib/loyalty'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed:  ['preparing', 'cancelled'],
  preparing:  ['ready', 'cancelled'],
  ready:      ['en_ruta', 'delivered'],
  en_ruta:    ['arrived', 'cancelled'],
  arrived:    ['delivered', 'cancelled'],
  delivered:  [],
  cancelled:  [],
}

// Mapeo de status → campo de timestamp (para analytics de TPP)
const STATUS_TIMESTAMP: Record<string, keyof import('@/models/Order').IStatusTimestamps> = {
  confirmed: 'confirmedAt',
  preparing: 'preparingAt',
  ready:     'readyAt',
  en_ruta:   'enRutaAt',
  arrived:   'arrivedAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

      const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { status } = await request.json()

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    // ── POS integration guard ──────────────────────────────────────────────
    // Si POS está activo y la orden fue sincronizada con éxito, el estado
    // solo se actualiza via webhooks del POS para evitar conflictos.
    if (
      tenant.posIntegration?.enabled &&
      tenant.posIntegration.provider !== 'none' &&
      order.posSync?.status === 'synced'
    ) {
      return NextResponse.json(
        { error: 'La integración POS está activa. El estado de la orden se actualiza automáticamente desde el POS.' },
        { status: 409 }
      )
    }

    const allowedTransitions = VALID_TRANSITIONS[order.status]
    if (!allowedTransitions.includes(status)) {
      return NextResponse.json(
        { error: `No se puede pasar de "${order.status}" a "${status}"` },
        { status: 400 }
      )
    }

    const previousStatus = order.status
    order.status = status

    if (status === 'ready' && order.orderMode === 'delivery') {
      // Generar customer code para delivery confirmation
      const customerCode = String(Math.floor(100000 + Math.random() * 900000))
      order.deliveryConfirmation = {
        customerCode: {
          code: customerCode,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h validez
        },
        deliveryPersonId: null,
        deliveryPersonName: null,
        status: 'pending',
        arrivalLat: null,
        arrivalLng: null,
        arrivalAt: null,
        completedAt: null,
      }
    }

    if (status === 'confirmed') {
      // Calcular estimatedReadyAt = confirmedAt + estimatedPickupTime de la sede (línea base ICO)
      // customerEstimatedReadyAt suma la demora informada para el modo específico (solo UX, no afecta ICO)
      const location = await Location.findById(order.locationId)
        .select('settings.estimatedPickupTime settings.delayAnnouncement')
        .lean<{ settings: { estimatedPickupTime: number; delayAnnouncement?: Record<string, { enabled: boolean; extraMinutes: number } | undefined> } }>()
      const baseTime = location?.settings?.estimatedPickupTime ?? 20
      const modeKey = order.orderMode as string
      const modeDelay = location?.settings?.delayAnnouncement?.[modeKey]
      const delayExtra = modeDelay?.enabled ? (modeDelay.extraMinutes ?? 0) : 0
      const pickupMs = baseTime * 60_000
      const customerPickupMs = (baseTime + delayExtra) * 60_000
      const confirmedAt = new Date()
      order.statusTimestamps.confirmedAt = confirmedAt
      order.statusTimestamps.estimatedReadyAt = new Date(confirmedAt.getTime() + pickupMs)
      order.statusTimestamps.customerEstimatedReadyAt = new Date(confirmedAt.getTime() + customerPickupMs)
    } else {
      // Registrar timestamp del cambio de estado para cálculo de TPP y Score Operativo
      const tsField = STATUS_TIMESTAMP[status]
      if (tsField) {
        order.statusTimestamps[tsField] = new Date()
      }
    }

    await order.save()

    // ── Push notification al cliente cuando el pedido está listo ──────────────
    if (status === 'ready' && (order as any).clientToken) {
      try {
        const sub = await PushSubscription.findOne({ clientToken: (order as any).clientToken })
        if (sub) {
          const isDelivery = order.orderMode === 'delivery'
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: isDelivery ? '🛍️ ¡Tu pedido está listo!' : '🛍️ ¡Tu pedido está listo!',
              body: isDelivery
                ? `Pedido #${order.orderNumber} — el delivery está por pasar a buscarlo.`
                : `Pedido #${order.orderNumber} — podés pasar a retirarlo.`,
              icon: '/tgoicon-192.png',
              badge: '/tgoicon-192.png',
              url: '/app',
            })
          )
        }
      } catch (pushErr: any) {
        // Si el endpoint expiró, limpiar la suscripción
        if (pushErr?.statusCode === 410) {
          await PushSubscription.deleteOne({ clientToken: (order as any).clientToken })
        }
        // No fallar el endpoint por un error de push
        console.warn('[push] Error enviando notificación:', pushErr?.message)
      }
    }

    // ── Push notification a los deliveries cuando hay un pedido listo ──────────
    if (status === 'ready' && order.orderMode === 'delivery') {
      try {
        const subs = await DeliveryPushSubscription.find({ tenantId: tenant._id }).lean()
        const payload = JSON.stringify({
          title: '📦 Nuevo pedido listo',
          body: `Pedido #${order.orderNumber} — listo para entregar.`,
          icon: '/tgoicon-192.png',
          badge: '/tgoicon-192.png',
          url: `/app`,
        })
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            )
          } catch (pushErr: any) {
            if (pushErr?.statusCode === 410) {
              await DeliveryPushSubscription.deleteOne({ _id: sub._id })
            }
          }
        }
      } catch {
        // No fallar el endpoint por errores de push a deliveries
      }
    }

    // ── Trigger ajuste automático de tiempo estimado (anti-gaming) ───────────
    // Se ejecuta en background cuando un pedido se completa (delivered)
    // para recalcular el tiempo óptimo basado en datos reales
    if (status === 'delivered') {
      triggerBackgroundAdjustment(order.locationId.toString(), tenant._id.toString())
      // Sumar puntos al club de fidelidad (si no se sumaron antes por pago automático)
      addPointsFromOrder(order, tenant).catch(err => 
        console.error('[Loyalty] Error sumando puntos en delivered:', err)
      )
    }

    // Milestone detection: notificar al cliente cuando el pedido #30 es procesado (solo plan trial)
    let milestoneReached = false
    if (tenant.plan === 'trial' && status !== 'cancelled') {
      const activeCount = await Order.countDocuments({
        tenantId: tenant._id,
        deletedAt: null,
        status: { $nin: ['cancelled'] },
      })
      milestoneReached = activeCount === 30
    }

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'order.status_changed',
      entity: 'order',
      entityId: orderId,
      details: { orderNumber: order.orderNumber, from: previousStatus, to: status },
      request,
    })

    return NextResponse.json({ order, milestoneReached })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
