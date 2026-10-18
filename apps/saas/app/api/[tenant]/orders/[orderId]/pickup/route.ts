import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { claimCheckoutRedemptionsForOrder } from '@/lib/store-redemptions'

// Endpoint público (tracking sin sesión). El `x-tracking-token` es
// obligatorio: sin él, conocer el orderId bastaba para marcar el retiro
// y concretar el cobro en efectivo.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const { success } = await rateLimit(`pickup:${tenantSlug}:${orderId}:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

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

    if (order.status !== 'ready') {
      return NextResponse.json(
        { error: 'Solo se puede confirmar el retiro de un pedido en estado "listo"' },
        { status: 400 }
      )
    }

    order.status = 'delivered'
    order.statusTimestamps.deliveredAt = new Date()
    let cashSaleToRegister = false
    if (order.payment?.method === 'cash' && order.payment.status === 'pending') {
      order.payment.status = 'approved'
      cashSaleToRegister = true
    }
    await order.save()

    // Cobro en efectivo concretado al retirar: registrar venta en caja + CIS.
    if (cashSaleToRegister) {
      const { registerCashSaleOnDelivery } = await import('@/lib/order-side-effects')
      registerCashSaleOnDelivery({ order, tenant })
    }

    // Canjes de checkout del pedido: al retirar se reclaman solos.
    await claimCheckoutRedemptionsForOrder(order._id, order.locationId)

    return NextResponse.json({ order })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
