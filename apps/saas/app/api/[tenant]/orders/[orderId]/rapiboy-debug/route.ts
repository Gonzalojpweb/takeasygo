import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id }).lean() as any
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const location = await Location.findById(order.locationId).lean() as any

    return NextResponse.json({
      order: {
        _id: order._id,
        status: order.status,
        orderMode: order.orderMode,
        hasDeliveryAddress: !!order.deliveryAddress,
        deliveryAddressCoordinates: order.deliveryAddress?.coordinates ?? null,
        deliveryProvider: order.deliveryProvider ?? null,
      },
      location: location ? {
        _id: location._id,
        name: location.name,
        hasGeo: !!location.geo,
        geoCoordinates: location.geo?.coordinates ?? null,
        rapiboyConfig: location.rapiboyConfig ?? null,
        deliveryConfig: location.deliveryConfig ?? null,
      } : null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
