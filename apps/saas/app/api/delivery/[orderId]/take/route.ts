import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import DeliveryPerson from '@/models/DeliveryPerson'
import PushSubscription from '@/models/PushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

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

    const order = await Order.findOne({
      _id: orderId,
      tenantId: person.tenantId,
      status: 'ready',
      'deliveryConfirmation.status': 'pending',
    })

    if (!order) {
      return NextResponse.json({ error: 'Pedido no disponible para tomar' }, { status: 404 })
    }

    order.status = 'en_ruta'
    order.statusTimestamps.enRutaAt = new Date()
    if (order.deliveryConfirmation) {
      order.deliveryConfirmation.status = 'assigned'
      order.deliveryConfirmation.deliveryPersonId = person._id
      order.deliveryConfirmation.deliveryPersonName = person.name
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
              title: '🚗 Delivery en camino',
              body: `Pedido #${order.orderNumber} — ${person.name} está yendo a tu domicilio.`,
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

    return NextResponse.json({
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
