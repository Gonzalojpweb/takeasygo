import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.payment.method !== 'transfer') {
      return NextResponse.json({ error: 'Esta orden no es de tipo transferencia' }, { status: 400 })
    }

    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'El pedido no está esperando pago' }, { status: 400 })
    }

    order.status = 'awaiting_confirmation'
    await order.save()

    return NextResponse.json({ status: order.status })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
