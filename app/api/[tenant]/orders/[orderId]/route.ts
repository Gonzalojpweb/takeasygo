import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function DELETE(
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

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.deletedAt) {
      return NextResponse.json({ error: 'La orden ya fue eliminada' }, { status: 400 })
    }

    await Order.updateOne(
      { _id: orderId, tenantId: tenant._id },
      { $set: { deletedAt: new Date() } }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'order.deleted',
      entity: 'Order',
      entityId: orderId,
      details: { orderNumber: order.orderNumber },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[orders/delete] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar la orden' }, { status: 500 })
  }
}
