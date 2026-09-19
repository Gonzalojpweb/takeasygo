// Cron job: expirar cotizaciones de Rapiboy pendientes después de 15 minutos
// Se ejecuta cada minuto via Vercel Cron Jobs
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET
const ACCEPT_WINDOW_MS = 15 * 60 * 1000 // 15 minutos

export async function GET(request: NextRequest) {
  // Verificar autorización del cron job
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await connectDB()

    // Buscar pedidos con quoteStatus: 'pending_customer_accept'
    const pendingOrders = await Order.find({
      'deliveryProvider.rapiboy.quoteStatus': 'pending_customer_accept',
      deletedAt: null,
    })
      .select('deliveryProvider orderNumber locationId customer tenantId')
      .lean()

    let expiredCount = 0

    for (const order of pendingOrders) {
      const rapiboy = order.deliveryProvider?.rapiboy
      if (!rapiboy?.pendingQuoteTimestamp) continue

      const elapsed = Date.now() - new Date(rapiboy.pendingQuoteTimestamp).getTime()
      if (elapsed <= ACCEPT_WINDOW_MS) continue

      // Expirar la cotización
      await Order.updateOne(
        { _id: order._id },
        { $set: { 'deliveryProvider.rapiboy.quoteStatus': 'expired' } }
      )

      expiredCount++
      console.log(`[expire-rapiboy-quotes] Order ${order.orderNumber}: quote expired after 15 min`)

      // Notificar al restaurante via push (DeliveryPushSubscription)
      try {
        const DeliveryPushSubscription = (await import('@/models/DeliveryPushSubscription')).default
        const webpush = (await import('web-push')).default
        const subs = await DeliveryPushSubscription.find({ tenantId: order.tenantId }).lean()
        const payload = JSON.stringify({
          title: '⚠️ Envío Rapiboy sin respuesta',
          body: `Pedido #${order.orderNumber}: el cliente no respondió al cambio de precio. Decidí: flota propia o cancelar.`,
          icon: '/tgoicon-192.png',
          badge: '/tgoicon-192.png',
          url: '/app',
          tag: `order-${order._id}`,
          orderId: order._id.toString(),
        })
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            )
          } catch {
            // Ignorar errores de push individuales
          }
        }
      } catch {
        // No fallar el cron por errores de push
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingOrders.length,
      expired: expiredCount,
    })
  } catch (error) {
    console.error('[expire-rapiboy-quotes] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
