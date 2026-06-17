import { connectDB } from '@/lib/mongoose'
import ExploreEvent from '@/models/ExploreEvent'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { Types } from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    const limit = parseInt(searchParams.get('limit') || '20')

    await connectDB()

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const matchStage = { createdAt: { $gte: startDate } }

    const [
      totalVisits,
      visitsByDay,
      visitsByView,
      visitsByEventType,
      topSearches,
      topRestaurants,
      funnelData,
      tgoRevenue,
      visitsBySource,
    ] = await Promise.all([
      ExploreEvent.countDocuments(matchStage),

      ExploreEvent.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 31 },
      ]),

      ExploreEvent.aggregate([
        { $match: { ...matchStage, view: { $ne: null } } },
        { $group: { _id: '$view', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      ExploreEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      ExploreEvent.aggregate([
        { $match: { ...matchStage, searchQuery: { $nin: [null, ''] } } },
        { $group: { _id: '$searchQuery', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]),

      ExploreEvent.aggregate([
        { $match: { ...matchStage, eventType: 'restaurant_view', restaurantId: { $ne: null } } },
        { $group: { _id: '$tenantSlug', count: { $sum: 1 }, restaurantId: { $first: '$restaurantId' } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]),

      ExploreEvent.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalPageviews: { $sum: { $cond: [{ $eq: ['$eventType', 'pageview'] }, 1, 0] } },
            totalSearches: { $sum: { $cond: [{ $eq: ['$eventType', 'search'] }, 1, 0] } },
            totalRestaurantViews: { $sum: { $cond: [{ $eq: ['$eventType', 'restaurant_view'] }, 1, 0] } },
            totalMenuClicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click_menu'] }, 1, 0] } },
          },
        },
      ]),

      Order.aggregate([
        { $match: { deletedAt: null, source: /^tgo-/i, status: { $ne: 'cancelled' }, createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),

      ExploreEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ])

    const revenue = tgoRevenue[0] || { total: 0, count: 0 }
    const funnel = funnelData[0] || { totalPageviews: 0, totalSearches: 0, totalRestaurantViews: 0, totalMenuClicks: 0 }

    return NextResponse.json({
      summary: {
        totalVisits,
        timeframeDays: days,
      },
      visitsByDay,
      visitsByView,
      visitsByEventType,
      visitsBySource,
      topSearches,
      topRestaurants,
      funnel: {
        pageviews: funnel.totalPageviews,
        searches: funnel.totalSearches,
        restaurantViews: funnel.totalRestaurantViews,
        menuClicks: funnel.totalMenuClicks,
        clickRate: funnel.totalPageviews > 0
          ? Math.round((funnel.totalMenuClicks / funnel.totalPageviews) * 10) / 10
          : 0,
        viewToClickRate: funnel.totalRestaurantViews > 0
          ? Math.round((funnel.totalMenuClicks / funnel.totalRestaurantViews) * 10) / 10
          : 0,
      },
      revenue: {
        total: revenue.total,
        orderCount: revenue.count,
      },
    })
  } catch (error) {
    console.error('[GET /api/superadmin/explore-stats]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
