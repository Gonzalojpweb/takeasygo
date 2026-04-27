// Endpoint público — no requiere auth — solo expone datos seguros del estado del pedido
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'

// Cache simple: evita múltiples verificaciones a MP en poco tiempo
const mpStatusCache = new Map<string, { status: string; timestamp: number }>()
const MP_CHECK_CACHE_TTL = 30_000 // 30 seg caching

async function verifyPaymentStatus(order: any, tenant: any) {
  if (!order.payment.mercadopagoId) return order.status

  const cacheKey = order.payment.mercadopagoId
  const cached = mpStatusCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < MP_CHECK_CACHE_TTL) {
    return cached.status
  }

  try {
    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)
    const paymentData = await paymentClient.get({ id: order.payment.mercadopagoId })

    mpStatusCache.set(cacheKey, { status: paymentData.status || 'pending', timestamp: Date.now() })
    return paymentData.status || 'pending'
  } catch (err) {
    console.error('[track] Error verifying MP payment:', err)
    return order.payment.status
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } }).lean() as any
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('status statusTimestamps orderNumber total items customer.name notes payment.status payment.mercadopagoId')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Si el pedido está esperando pago, verificamos el estado real en MercadoPago
    let currentStatus = order.status
    if (order.status === 'awaiting_payment' && order.payment?.mercadopagoId && tenant.mercadopago?.accessToken) {
      const mpStatus = await verifyPaymentStatus(order, tenant)

      // Si MP aprobó el pago, actualizamos el pedido en DB
      if (mpStatus === 'approved') {
        const dbOrder = await Order.findById(order._id)
        if (dbOrder && dbOrder.status === 'awaiting_payment') {
          dbOrder.payment.status = 'approved'
          dbOrder.status = 'confirmed'
          await dbOrder.save()
          currentStatus = 'confirmed'
          console.log(`[track] Order ${order.orderNumber} confirmed via MP verification`)
        }
      } else if (['rejected', 'cancelled'].includes(mpStatus)) {
        const dbOrder = await Order.findById(order._id)
        if (dbOrder && dbOrder.status === 'awaiting_payment') {
          dbOrder.payment.status = mpStatus
          dbOrder.status = 'cancelled'
          await dbOrder.save()
          currentStatus = 'cancelled'
        }
      }
    }

    return NextResponse.json({
      status:           currentStatus,
      orderNumber:      order.orderNumber,
      estimatedReadyAt: order.statusTimestamps?.estimatedReadyAt ?? null,
      readyAt:          order.statusTimestamps?.readyAt ?? null,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
