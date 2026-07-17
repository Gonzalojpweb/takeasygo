import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { safeDecrypt } from '@/lib/crypto'
import { type Plan, canAccess } from '@/lib/plans'

/**
 * GET /api/[tenant]/orders/customer-history?phoneHash=xxx
 * Returns all orders from a specific customer in the last 3 months.
 * Requires auth + CRM plan access (buy / full).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
      .select('plan name')
      .lean<{ _id: any; plan: Plan; name: string }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'Requiere plan Crecimiento o Premium' }, { status: 403 })
    }

    const sp = request.nextUrl.searchParams
    const phoneHash = sp.get('phoneHash') ?? ''

    if (!phoneHash) {
      return NextResponse.json({ error: 'phoneHash requerido' }, { status: 400 })
    }

    // Restrict by assignedLocations for non-admin users
    const sessionUser = await getSessionUser(request)
    const locationFilter: Record<string, any> = {}
    if (sessionUser && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
      const locs = sessionUser.assignedLocations ?? []
      if (locs.length > 0) {
        locationFilter.locationId = { $in: locs }
      } else {
        return NextResponse.json({ orders: [], totalOrders: 0, totalSpent: 0, avgTicket: 0, tenantName: tenant.name })
      }
    }

    // Last 3 months
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const filter: Record<string, any> = {
      tenantId: tenant._id,
      'customer.phoneHash': phoneHash,
      deletedAt: null,
      createdAt: { $gte: threeMonthsAgo },
      status: { $ne: 'awaiting_payment' },
      ...locationFilter,
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .select('orderNumber status total orderMode createdAt items customer.name')
      .lean()

    // Decrypt customer names and extract item summaries
    const decryptedOrders = (orders as any[]).map(o => {
      const itemSummary = (o.items || []).map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        subtotal: item.subtotal,
      }))
      return {
        _id: o._id.toString(),
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        orderMode: o.orderMode,
        createdAt: o.createdAt,
        items: itemSummary,
        customerName: safeDecrypt(o.customer?.name ?? ''),
      }
    })

    // Summary stats
    const totalOrders = decryptedOrders.length
    const totalSpent = decryptedOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0)
    const avgTicket = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0

    return NextResponse.json({
      orders: decryptedOrders,
      totalOrders,
      totalSpent,
      avgTicket,
      tenantName: tenant.name,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener historial del cliente' }, { status: 500 })
  }
}
