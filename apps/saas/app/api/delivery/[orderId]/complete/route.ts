import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import DeliveryPerson from '@/models/DeliveryPerson'
import PushSubscription from '@/models/PushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import webpush from 'web-push'
import { triggerBackgroundAdjustment } from '@/lib/hooks/useEstimatedTimeAdjustment'
import { addPointsFromOrder } from '@/lib/loyalty'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const MAX_CODE_ATTEMPTS = 5
const CODE_LOCKOUT_MINUTES = 5

// Cache simple para rate limiting de códigos
const codeAttempts = new Map<string, { count: number; lockedUntil: number }>()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    await connectDB()

    const token = request.headers.get('x-delivery-token')
    if (!token) {
      return NextResponse.json({ error: 'Token no proporcionado' }, { status: 401 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const person = await DeliveryPerson.findOne({ tokenHash, isActive: true })
    if (!person) {
      return NextResponse.json({ error: 'Delivery no encontrado o desactivado' }, { status: 404 })
    }

    const { code } = await request.json()
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    }

    const order = await Order.findOne({
      _id: orderId,
      tenantId: person.tenantId,
      'deliveryConfirmation.deliveryPersonId': person._id,
      status: { $in: ['arrived', 'en_ruta'] },
    })

    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado o no asignado a este delivery' }, { status: 404 })
    }

    // Rate limiting
    const rateKey = `${orderId}:${person._id}`
    const now = Date.now()
    const attempts = codeAttempts.get(rateKey)
    if (attempts && attempts.lockedUntil > now) {
      const remaining = Math.ceil((attempts.lockedUntil - now) / 60000)
      return NextResponse.json({
        error: `Demasiados intentos. Esperá ${remaining} minuto(s) para intentar de nuevo.`,
      }, { status: 429 })
    }

    const customerCode = order.deliveryConfirmation?.customerCode
    if (!customerCode?.code || !customerCode?.expiresAt) {
      return NextResponse.json({ error: 'Este pedido no tiene un código de entrega activo' }, { status: 400 })
    }

    if (new Date() > new Date(customerCode.expiresAt)) {
      return NextResponse.json({ error: 'El código de entrega expiró. Contactá al administrador.' }, { status: 400 })
    }

    if (code !== customerCode.code) {
      const current = codeAttempts.get(rateKey)
      const count = (current?.count ?? 0) + 1
      if (count >= MAX_CODE_ATTEMPTS) {
        codeAttempts.set(rateKey, { count, lockedUntil: now + CODE_LOCKOUT_MINUTES * 60 * 1000 })
        return NextResponse.json({ error: `Código incorrecto. Demasiados intentos. Esperá ${CODE_LOCKOUT_MINUTES} minutos.` }, { status: 429 })
      }
      codeAttempts.set(rateKey, { count, lockedUntil: 0 })
      return NextResponse.json({ error: `Código incorrecto. Intentos restantes: ${MAX_CODE_ATTEMPTS - count}` }, { status: 400 })
    }

    // Código correcto — completar entrega
    codeAttempts.delete(rateKey)

    order.status = 'delivered'
    if (order.deliveryConfirmation) {
      order.deliveryConfirmation.status = 'completed'
      order.deliveryConfirmation.completedAt = new Date()
    }

    await order.save()

    // Push notification al cliente
    if ((order as any).clientToken) {
      try {
        const sub = await PushSubscription.findOne({ clientToken: (order as any).clientToken })
        if (sub) {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: '✅ ¡Pedido entregado!',
              body: `Pedido #${order.orderNumber} fue entregado. ¡Que lo disfrutes!`,
              icon: '/tgoicon-192.png',
              badge: '/tgoicon-192.png',
              url: '/app',
            })
          )
        }
      } catch (pushErr: any) {
        if (pushErr?.statusCode === 410) {
          await PushSubscription.deleteOne({ clientToken: (order as any).clientToken })
        }
      }
    }

    // Trigger ICO adjustment + puntos
    triggerBackgroundAdjustment(order.locationId.toString(), person.tenantId.toString())
    addPointsFromOrder(order, { _id: person.tenantId } as any).catch(err =>
      console.error('[Loyalty] Error sumando puntos en delivery:', err)
    )

    return NextResponse.json({
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
      },
      message: 'Entrega confirmada exitosamente',
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
