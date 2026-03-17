// Endpoint público — no requiere auth — solo expone datos seguros del estado del pedido
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('status statusTimestamps orderNumber total items customer.name notes')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      status:           order.status,
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
