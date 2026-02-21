import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { generateOrderNumber } from '@/lib/orderNumber'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const locationId = request.nextUrl.searchParams.get('locationId')

const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const filter: Record<string, any> = { tenantId: tenant._id }
    if (locationId) filter.locationId = locationId

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50)
    return NextResponse.json({ orders })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = await request.json()

    const location = await Location.findOne({
      _id: body.locationId,
      tenantId: tenant._id,
      isActive: true,
    })
    if (!location) {
      return NextResponse.json({ error: 'Location no encontrada' }, { status: 404 })
    }

    // Calcular subtotales y total
    const items = body.items.map((item: any) => ({
      ...item,
      subtotal: item.price * item.quantity,
    }))

    const total = items.reduce((sum: number, item: any) => sum + item.subtotal, 0)

    const order = await Order.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      orderNumber: generateOrderNumber(tenantSlug),
      items,
      total,
      customer: body.customer,
      notes: body.notes || '',
    })

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
