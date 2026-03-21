import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { safeDecrypt } from '@/lib/crypto'

const PAGE_SIZE = 25

/**
 * GET /api/[tenant]/orders/history
 * Accessible to admin, manager, cashier.
 * Query params: page, locationId, status, from (ISO date), to (ISO date), q (orderNumber/customer)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page') ?? 1))
    const locationId = sp.get('locationId') ?? ''
    const status = sp.get('status') ?? ''
    const from = sp.get('from') ?? ''
    const to = sp.get('to') ?? ''
    const q = sp.get('q') ?? ''

    const filter: Record<string, any> = { tenantId: tenant._id }

    if (locationId) filter.locationId = locationId
    if (status) filter.status = status

    if (from || to) {
      filter.createdAt = {}
      if (from) filter.createdAt.$gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = toDate
      }
    }

    if (q) {
      // Solo busca por orderNumber — customer.name está cifrado en DB
      filter.orderNumber = { $regex: q, $options: 'i' }
    }

    const [orders, total, locations] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select('orderNumber status total customer notes payment printed createdAt locationId')
        .lean(),
      Order.countDocuments(filter),
      Location.find({ tenantId: tenant._id }).select('_id name').lean(),
    ])

    const locationMap = Object.fromEntries(locations.map(l => [l._id.toString(), l.name]))

    const ordersWithLocation = (orders as any[]).map(o => ({
      ...o,
      customer: o.customer ? {
        ...o.customer,
        name:  safeDecrypt(o.customer.name ?? ''),
        phone: safeDecrypt(o.customer.phone ?? ''),
        email: safeDecrypt(o.customer.email ?? ''),
      } : o.customer,
      locationName: locationMap[o.locationId?.toString()] ?? '—',
    }))

    return NextResponse.json({
      orders: ordersWithLocation,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      locations,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}
