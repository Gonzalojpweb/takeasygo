import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import DeliveryPerson from '@/models/DeliveryPerson'
import PushSubscription from '@/models/PushSubscription'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { haversineDistance } from '@/lib/geocode'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const SIMULATE_GPS = process.env.DELIVERY_SIMULATE_GPS === 'true'
const GPS_TOLERANCE_KM = 0.1 // 100m

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

    const { lat, lng } = await request.json()

    const order = await Order.findOne({
      _id: orderId,
      tenantId: person.tenantId,
      status: 'en_ruta',
      'deliveryConfirmation.deliveryPersonId': person._id,
    })

    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado o no asignado a este delivery' }, { status: 404 })
    }

    if (!order.deliveryAddress?.coordinates) {
      return NextResponse.json({ error: 'El pedido no tiene coordenadas de entrega' }, { status: 400 })
    }

    if (!SIMULATE_GPS) {
      const distance = haversineDistance(
        { lat, lng },
        { lat: order.deliveryAddress.coordinates.lat, lng: order.deliveryAddress.coordinates.lng }
      )

      if (distance > GPS_TOLERANCE_KM) {
        return NextResponse.json({
          error: `No estás en la ubicación de entrega. Distancia: ${(distance * 1000).toFixed(0)}m (máx: ${GPS_TOLERANCE_KM * 1000}m)`,
        }, { status: 400 })
      }
    }

    order.status = 'arrived'
    order.statusTimestamps.arrivedAt = new Date()
    if (order.deliveryConfirmation) {
      order.deliveryConfirmation.status = 'arrived'
      order.deliveryConfirmation.arrivalLat = lat
      order.deliveryConfirmation.arrivalLng = lng
      order.deliveryConfirmation.arrivalAt = new Date()
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
              title: '📍 Delivery llegó',
              body: `Pedido #${order.orderNumber} — el delivery está en tu domicilio. Entregale el código de 6 dígitos.`,
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
