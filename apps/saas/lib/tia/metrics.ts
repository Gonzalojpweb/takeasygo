import mongoose from 'mongoose'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import Location from '@/models/Location'
import { getDayAndMidnightInTimezone } from '@/lib/restaurant-time'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

const POSTHOG_HOST = 'https://us.i.posthog.com'

function getPostHogConfig() {
  const key = process.env.POSTHOG_SERVER_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  if (!key || !projectId) return null
  return { key, projectId }
}

function addTenantFilter(query: any, tenantId: string): any {
  if (!tenantId) return query
  const tenantFilter = { key: 'tenantId', value: [tenantId], operator: 'exact', type: 'event' as const }
  return {
    ...query,
    properties: [
      ...(query.properties || []),
      tenantFilter,
    ],
  }
}

async function queryPostHog(query: any, tenantId?: string): Promise<any> {
  const config = getPostHogConfig()
  if (!config) return null

  const queryWithFilter = tenantId ? addTenantFilter(query, tenantId) : query

  try {
    const res = await fetch(`${POSTHOG_HOST}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({ query: queryWithFilter }),
    })
    if (!res.ok) {
      console.warn('[PostHog Query]', res.status, await res.text())
      return null
    }
    return res.json()
  } catch (err) {
    console.warn('[PostHog Query] fetch failed', err)
    return null
  }
}

async function fetchFunnel(tenantId: string): Promise<ConversionFunnelData | null> {
  const result = await queryPostHog({
    kind: 'FunnelsQuery',
    dateRange: { date_from: '-30d' },
    series: [
      { kind: 'EventsNode', event: 'menu.opened', name: 'menu.opened' },
      { kind: 'EventsNode', event: 'dish.viewed', name: 'dish.viewed' },
      { kind: 'EventsNode', event: 'dish.added', name: 'dish.added' },
      { kind: 'EventsNode', event: 'checkout.started', name: 'checkout.started' },
      { kind: 'EventsNode', event: 'order.completed', name: 'order.completed' },
    ],
  }, tenantId)

  if (!result?.results?.length) return null

  const steps = result.results[0]
  return {
    menuOpened: steps[0]?.count ?? 0,
    dishViewed: steps[1]?.count ?? 0,
    dishAdded: steps[2]?.count ?? 0,
    checkoutStarted: steps[3]?.count ?? 0,
    orderCompleted: steps[4]?.count ?? 0,
  }
}

async function fetchTrend(event: string, days = 30, tenantId?: string): Promise<number> {
  const result = await queryPostHog({
    kind: 'TrendsQuery',
    dateRange: { date_from: `-${days}d` },
    series: [{ kind: 'EventsNode', event, name: event }],
    interval: 'day',
  }, tenantId)

  if (!result?.results?.length) return 0
  const data = result.results[0].data as number[]
  return data.reduce((sum: number, v: number) => sum + v, 0)
}

async function fetchMenuOpened(tenantId: string): Promise<number> {
  return fetchTrend('menu.opened', 30, tenantId)
}

export interface DailySummaryData {
  todayOrders: number
  todayRevenue: number
  todayNewMembers: number
  todayRewardsRedeemed: number
  pendingOrders: number
  avgOrderValue: number
  todayTakeawayOrders: number
  todayDeliveryOrders: number
}

export interface ConversionFunnelData {
  menuOpened: number
  dishViewed: number
  dishAdded: number
  checkoutStarted: number
  orderCompleted: number
}

export interface TopProductsData {
  mostSold: { name: string; count: number; revenue: number }[]
  mostViewed: { name: string; count: number }[]
}

export interface ClubGrowthData {
  totalMembers: number
  activeMembers: number
  newMembers7d: number
  newMembers30d: number
  totalPointsIssued: number
  totalPointsRedeemed: number
  redemptions7d: number
}

export interface TrendsData {
  orders7d: number
  orders30d: number
  ordersPrev7d: number
  revenue7d: number
  revenue30d: number
  revenuePrev7d: number
  conversion7d: number
  conversionPrev7d: number
}

export interface HistoricalData {
  orders: { label: string; value: number }[]
  revenue: { label: string; value: number }[]
  members: { label: string; value: number }[]
}

export interface CategoryData {
  category: string
  itemsCount: number
  totalSold: number
  revenue: number
  conversion: number
}

export interface AnomalyData {
  type: 'positive' | 'negative'
  metric: string
  itemName: string
  currentValue: number
  expectedValue: number
  deviation: number
}

export interface RecommendationData {
  title: string
  description: string
  action: string
  priority: 'high' | 'medium' | 'low'
  category: 'menu' | 'club' | 'operations' | 'promotions'
}

export interface SilData {
  insights: RecommendationData[]
  anomalies: AnomalyData[]
  categories: CategoryData[]
}

export interface TiaMetricsData {
  dailySummary: DailySummaryData
  conversionFunnel: ConversionFunnelData
  topProducts: TopProductsData
  clubGrowth: ClubGrowthData
  trends: TrendsData
  historical: HistoricalData
  sil: SilData
  _timing?: {
    parallelMs: number
    sequentialMs: number
    posthogMs: number
    totalMs: number
  }
}

function todayRange(timezone: string) {
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const { date: start } = getDayAndMidnightInTimezone(todayStr, timezone)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1000)
  return { start, end }
}

function daysAgo(days: number, timezone: string) {
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const { date: todayMidnight } = getDayAndMidnightInTimezone(todayStr, timezone)
  return new Date(todayMidnight.getTime() - days * 24 * 60 * 60 * 1000)
}

function daysAgoRange(days: number, timezone: string) {
  const start = daysAgo(days, timezone)
  const end = new Date()
  return { start, end }
}

async function getTenantTimezone(tenantId: mongoose.Types.ObjectId): Promise<string> {
  const location = await Location.findOne({ tenantId }).select('timezone').lean() as any
  return location?.timezone || DEFAULT_TIMEZONE
}

export async function fetchDashboardMetrics(tenantId: string): Promise<TiaMetricsData> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const timezone = await getTenantTimezone(tid)
  const { start: todayStart, end: todayEnd } = todayRange(timezone)
  const sevenDaysAgo = daysAgo(7, timezone)
  const thirtyDaysAgo = daysAgo(30, timezone)
  const fourteenDaysAgo = daysAgo(14, timezone)

  const t0 = Date.now()
  const [
    todayOrders,
    todayRevenue,
    todayMembers,
    todayRewards,
    pendingOrders,
    todayTakeawayOrders,
    todayDeliveryOrders,
    orders7d,
    orders30d,
    ordersPrev7d,
    revenue7d,
    revenue30d,
    revenuePrev7d,
    totalMembers,
    totalActive,
    newMembers7d,
    newMembers30d,
    totalPointsIssued,
    totalPointsRedeemed,
    redemptions7d,
    members30d,
    membersPrev30d,
  ] = await Promise.all([
    // Today's completed orders count
    Order.countDocuments({ tenantId: tid, deletedAt: null, createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Today's revenue
    Order.aggregate([
      { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Today's new loyalty members
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: todayStart, $lte: todayEnd } }),

    // Today's reward redemptions
    Order.countDocuments({ tenantId: tid, deletedAt: null, createdAt: { $gte: todayStart, $lte: todayEnd }, rewardItems: { $exists: true, $not: { $size: 0 } } }),

    // Pending orders (not delivered/cancelled)
    Order.countDocuments({ tenantId: tid, deletedAt: null, status: { $in: ['confirmed', 'preparing', 'pending'] } }),

    // Today's takeaway orders
    Order.countDocuments({ tenantId: tid, deletedAt: null, orderMode: 'takeaway', createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Today's delivery orders
    Order.countDocuments({ tenantId: tid, deletedAt: null, orderMode: 'delivery', createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Orders last 7 days
    Order.countDocuments({ tenantId: tid, deletedAt: null, createdAt: { $gte: sevenDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Orders last 30 days
    Order.countDocuments({ tenantId: tid, deletedAt: null, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Orders previous 7 days (14-7 days ago)
    Order.countDocuments({ tenantId: tid, deletedAt: null, createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Revenue last 7 days
    Order.aggregate([
      { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: sevenDaysAgo }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Revenue last 30 days
    Order.aggregate([
      { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Revenue previous 7 days
    Order.aggregate([
      { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Total loyalty members
    LoyaltyMember.countDocuments({ tenantId: tid }),

    // Active loyalty members
    LoyaltyMember.countDocuments({ tenantId: tid, status: 'active' }),

    // New members last 7 days
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: sevenDaysAgo } }),

    // New members last 30 days
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: thirtyDaysAgo } }),

    // Total points issued (sum of all members' points)
    LoyaltyMember.aggregate([
      { $match: { tenantId: tid, status: 'active' } },
      { $group: { _id: null, total: { $sum: '$loyalty.points' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Total points spent on redemptions
    LoyaltyMember.aggregate([
      { $match: { tenantId: tid, status: 'active' } },
      { $group: { _id: null, total: { $sum: '$store.totalPointsSpent' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Redemptions last 7 days
    LoyaltyMember.countDocuments({ tenantId: tid, 'store.lastRedemptionAt': { $gte: sevenDaysAgo } }),

    // Members created in last 30 days for historical
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: thirtyDaysAgo } }),

    // Members created in previous 30 days
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: daysAgo(60, timezone), $lt: thirtyDaysAgo } }),
  ])

  const t1 = Date.now()

  // Top products (most sold)
  const topSold = await Order.aggregate([
    { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    { $project: { name: '$_id', count: 1, revenue: 1, _id: 0 } },
  ])

  // Category breakdown
  const categoryBreakdown = await Order.aggregate([
    { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ])

  const soldNames = new Set(topSold.map((i: any) => i.name))

  // Daily historical (last 30 days)
  const dailyOrders = await Order.aggregate([
    { $match: { tenantId: tid, deletedAt: null, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
    { $sort: { _id: 1 } },
  ])

  const dailyMembers = await LoyaltyMember.aggregate([
    { $match: { tenantId: tid, joinedAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$joinedAt', timezone } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])

  const ordersMap = new Map(dailyOrders.map((d: any) => [d._id, d]))
  const membersMap = new Map(dailyMembers.map((d: any) => [d._id, d]))

  const t2 = Date.now()

  const historical: HistoricalData = { orders: [], revenue: [], members: [] }
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i, timezone)
    const label = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: timezone })
    const key = d.toLocaleDateString('en-CA', { timeZone: timezone })
    const dayData = ordersMap.get(key)
    const memberData = membersMap.get(key)
    historical.orders.push({ label, value: dayData?.count ?? 0 })
    historical.revenue.push({ label, value: dayData?.revenue ?? 0 })
    historical.members.push({ label, value: memberData?.count ?? 0 })
  }

  // PostHog: funnel + visits (filtered by tenant)
  const [funnel, menuOpenedCount] = await Promise.all([
    fetchFunnel(tenantId),
    fetchMenuOpened(tenantId),
  ])

  const t3 = Date.now()

  const totalOrders7d = orders7d || 1
  const totalOrdersPrev7d = ordersPrev7d || 1

  const avgOrderValue = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0

  return {
    dailySummary: {
      todayOrders,
      todayRevenue,
      todayNewMembers: todayMembers,
      todayRewardsRedeemed: todayRewards,
      pendingOrders,
      avgOrderValue,
      todayTakeawayOrders,
      todayDeliveryOrders,
    },
    conversionFunnel: {
      menuOpened: funnel?.menuOpened ?? menuOpenedCount,
      dishViewed: funnel?.dishViewed ?? 0,
      dishAdded: funnel?.dishAdded ?? 0,
      checkoutStarted: funnel?.checkoutStarted ?? 0,
      orderCompleted: funnel?.orderCompleted ?? todayOrders,
    },
    topProducts: {
      mostSold: topSold,
      mostViewed: [],
    },
    clubGrowth: {
      totalMembers,
      activeMembers: totalActive,
      newMembers7d,
      newMembers30d,
      totalPointsIssued,
      totalPointsRedeemed,
      redemptions7d,
    },
    trends: {
      orders7d,
      orders30d,
      ordersPrev7d,
      revenue7d,
      revenue30d,
      revenuePrev7d,
      conversion7d: orders7d > 0 ? Math.round((todayOrders / orders7d) * 100) : 0,
      conversionPrev7d: ordersPrev7d > 0 ? Math.round(((orders7d - ordersPrev7d) / ordersPrev7d) * 100) : 0,
    },
    historical,
    sil: {
      insights: [],
      anomalies: [],
      categories: categoryBreakdown.map((c: any) => ({
        category: c._id,
        itemsCount: c.count,
        totalSold: c.count,
        revenue: c.revenue,
        conversion: 0,
      })),
    },
    _timing: {
      parallelMs: t1 - t0,
      sequentialMs: t2 - t1,
      posthogMs: t3 - t2,
      totalMs: t3 - t0,
    },
  }
}
