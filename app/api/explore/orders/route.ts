import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'
import { logExploreEvent, generateSessionId } from '@/lib/explore-tracking'

/**
 * GET /api/explore/orders
 * Returns the order history for the authenticated user, identified by email or linked loyalty phoneHash.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = 10

    await connectDB()

    // Try authenticated user first
    const session = await auth()
    const email = session?.user?.email ?? searchParams.get('email')

    if (!email) {
      return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })
    }

    // F4: Buscar también por phoneHash si el usuario tiene un LoyaltyMember vinculado
    const user = await User.findOne({ email }).select('_id').lean()
    let phoneHashes: string[] = []
    if (user) {
      const members = await LoyaltyMember.find({
        userId: user._id,
        phoneHash: { $ne: '' },
      }).select('phoneHash').lean()
      phoneHashes = members.map((m: any) => m.phoneHash).filter(Boolean)
    }
    // También buscar miembros por email (para casos donde userId no está vinculado)
    const emailMembers = await LoyaltyMember.find({
      email: email.toLowerCase().trim(),
      phoneHash: { $ne: '' },
    }).select('phoneHash').lean()
    for (const m of emailMembers) {
      if (m.phoneHash && !phoneHashes.includes(m.phoneHash)) {
        phoneHashes.push(m.phoneHash)
      }
    }

    // Build filter: buscar por email O por cualquiera de los phoneHashes
    const orderFilter: any[] = [{ 'customer.email': email }]
    if (phoneHashes.length > 0) {
      orderFilter.push({ 'customer.phoneHash': { $in: phoneHashes } })
    }

    const [orders, total] = await Promise.all([
      Order.find({ deletedAt: null, $or: orderFilter })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('orderNumber status total items customer.name payment.status orderMode createdAt tenantId statusTimestamps')
        .lean(),
      Order.countDocuments({ deletedAt: null, $or: orderFilter }),
    ])

    // Enrich with tenant branding
    const tenantIds = [...new Set(orders.map((o: any) => o.tenantId?.toString()).filter(Boolean))]
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name slug branding')
      .lean()
    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t._id.toString(), t]))

    const enriched = orders.map((order: any) => {
      const tenant = tenantMap[order.tenantId?.toString()] ?? null
      return {
        id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        orderMode: order.orderMode,
        createdAt: order.createdAt,
        paymentStatus: order.payment?.status,
        itemCount: order.items?.length ?? 0,
        firstItemName: order.items?.[0]?.name ?? '',
        tenant: tenant ? {
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.branding?.logoUrl ?? '',
          primaryColor: tenant.branding?.primaryColor ?? '#f74211',
        } : null,
        trackingUrl: tenant ? `/${tenant.slug}/tracking/${order.orderNumber}` : null,
      }
    })

    logExploreEvent({
      sessionId: request.headers.get('x-session-id') || generateSessionId(),
      eventType: 'pageview',
      view: 'orders',
      request,
    })

    return NextResponse.json({
      orders: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[GET /api/explore/orders]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
