import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

// Endpoint público — el cliente confirma que retiró su pedido
// No requiere autenticación; el orderId está en la URL y solo funciona si el pedido está en estado 'ready'
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.status !== 'ready') {
      return NextResponse.json(
        { error: 'Solo se puede confirmar el retiro de un pedido en estado "listo"' },
        { status: 400 }
      )
    }

    order.status = 'delivered'
    order.statusTimestamps.deliveredAt = new Date()
    await order.save()

    return NextResponse.json({ order })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
