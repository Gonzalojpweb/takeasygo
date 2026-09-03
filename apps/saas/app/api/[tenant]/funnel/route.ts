import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/funnel — Behavioral funnel metrics from MongoDB
// ─────────────────────────────────────────────────────────────────────────────
// Returns funnel counts for: menu_opened → product_view → cart_add →
// checkout_started → order_completed
//
// Time range: last N days (default 30)
// Granularity: daily breakdown + totals
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const days = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '30'), 90)

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
      .select('_id')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenantId = tenant._id
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Aggregate funnel events by type
    const funnelAgg = await CustomerEvent.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          createdAt: { $gte: since },
          type: { $in: ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'] },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$phoneHash' },
        },
      },
      {
        $project: {
          type: '$_id',
          count: 1,
          uniqueUsers: { $size: { $filter: { input: '$uniqueUsers', cond: { $ne: ['$$this', ''] } } } },
        },
      },
    ])

    // Build funnel map
    const funnelMap = new Map<string, { count: number; uniqueUsers: number }>()
    for (const doc of funnelAgg) {
      funnelMap.set(doc.type, { count: doc.count, uniqueUsers: doc.uniqueUsers })
    }

    // Also get order counts from orders collection (source of truth)
    const orderCount = await Order.countDocuments({
      tenantId,
      createdAt: { $gte: since },
      status: { $nin: ['cancelled', 'open'] },
    })

    const orderRevenue = await Order.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          createdAt: { $gte: since },
          status: { $nin: ['cancelled', 'open'] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          avgTicket: { $avg: '$total' },
        },
      },
    ])

    const revenue = orderRevenue[0] || { totalRevenue: 0, avgTicket: 0 }

    // Daily breakdown
    const dailyAgg = await CustomerEvent.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          createdAt: { $gte: since },
          type: { $in: ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'] },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          events: {
            $push: { type: '$_id.type', count: '$count' },
          },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Format daily breakdown
    const daily = dailyAgg.map((day: any) => {
      const eventMap = new Map<string, number>()
      for (const ev of day.events) {
        eventMap.set(ev.type, ev.count)
      }
      return {
        date: day._id,
        menuOpened: eventMap.get('menu_opened') || 0,
        productView: eventMap.get('product_view') || 0,
        cartAdd: eventMap.get('cart_add') || 0,
        checkoutStarted: eventMap.get('checkout_started') || 0,
        orderCompleted: eventMap.get('order_completed') || 0,
      }
    })

    // Upsell metrics
    const upsellAgg = await CustomerEvent.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          createdAt: { $gte: since },
          type: { $in: ['upsell_impression', 'upsell_add'] },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ])

    const upsellMap = new Map<string, number>()
    for (const doc of upsellAgg) {
      upsellMap.set(doc.type, doc.count)
    }

    // Conversion rates
    const menuOpened = funnelMap.get('menu_opened')?.count || 0
    const productView = funnelMap.get('product_view')?.count || 0
    const cartAdd = funnelMap.get('cart_add')?.count || 0
    const checkoutStarted = funnelMap.get('checkout_started')?.count || 0
    const orderCompleted = funnelMap.get('order_completed')?.count || 0

    return NextResponse.json({
      funnel: {
        menuOpened,
        productView,
        cartAdd,
        checkoutStarted,
        orderCompleted,
        // From orders collection (source of truth)
        ordersConfirmed: orderCount,
      },
      conversionRates: {
        menuToView: menuOpened > 0 ? +(productView / menuOpened * 100).toFixed(1) : 0,
        viewToAdd: productView > 0 ? +(cartAdd / productView * 100).toFixed(1) : 0,
        addToCheckout: cartAdd > 0 ? +(checkoutStarted / cartAdd * 100).toFixed(1) : 0,
        checkoutToOrder: checkoutStarted > 0 ? +(orderCount / checkoutStarted * 100).toFixed(1) : 0,
        overallConversion: menuOpened > 0 ? +(orderCount / menuOpened * 100).toFixed(1) : 0,
      },
      revenue: {
        total: revenue.totalRevenue,
        avgTicket: Math.round(revenue.avgTicket),
        orders: orderCount,
      },
      upsell: {
        impressions: upsellMap.get('upsell_impression') || 0,
        adds: upsellMap.get('upsell_add') || 0,
        conversionRate: (upsellMap.get('upsell_impression') || 0) > 0
          ? +((upsellMap.get('upsell_add') || 0) / (upsellMap.get('upsell_impression') || 0) * 100).toFixed(1)
          : 0,
      },
      daily,
      period: { days, since: since.toISOString() },
    })
  } catch (error) {
    console.error('[funnel] error:', error)
    return NextResponse.json({ error: 'Error computing funnel' }, { status: 500 })
  }
}
