import mongoose from 'mongoose'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'

export interface DailySummaryData {
  todayOrders: number
  todayRevenue: number
  todayNewMembers: number
  todayRewardsRedeemed: number
  pendingOrders: number
  avgOrderValue: number
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
}

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  return { start, end }
}

function daysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgoRange(days: number) {
  const start = daysAgo(days)
  const end = new Date()
  return { start, end }
}

export async function fetchDashboardMetrics(tenantId: string): Promise<TiaMetricsData> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const { start: todayStart, end: todayEnd } = todayRange()
  const sevenDaysAgo = daysAgo(7)
  const thirtyDaysAgo = daysAgo(30)
  const fourteenDaysAgo = daysAgo(14)

  const [
    todayOrders,
    todayRevenue,
    todayMembers,
    todayRewards,
    pendingOrders,
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
    Order.countDocuments({ tenantId: tid, createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Today's revenue
    Order.aggregate([
      { $match: { tenantId: tid, createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Today's new loyalty members
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: todayStart, $lte: todayEnd } }),

    // Today's reward redemptions
    Order.countDocuments({ tenantId: tid, createdAt: { $gte: todayStart, $lte: todayEnd }, rewardItems: { $exists: true, $not: { $size: 0 } } }),

    // Pending orders (not delivered/cancelled)
    Order.countDocuments({ tenantId: tid, status: { $in: ['confirmed', 'preparing', 'pending'] } }),

    // Orders last 7 days
    Order.countDocuments({ tenantId: tid, createdAt: { $gte: sevenDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Orders last 30 days
    Order.countDocuments({ tenantId: tid, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Orders previous 7 days (14-7 days ago)
    Order.countDocuments({ tenantId: tid, createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } }),

    // Revenue last 7 days
    Order.aggregate([
      { $match: { tenantId: tid, createdAt: { $gte: sevenDaysAgo }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Revenue last 30 days
    Order.aggregate([
      { $match: { tenantId: tid, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).then(r => r[0]?.total ?? 0),

    // Revenue previous 7 days
    Order.aggregate([
      { $match: { tenantId: tid, createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }, status: { $nin: ['cancelled'] } } },
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
    LoyaltyMember.countDocuments({ tenantId: tid, joinedAt: { $gte: daysAgo(60), $lt: thirtyDaysAgo } }),
  ])

  // Top products (most sold)
  const topSold = await Order.aggregate([
    { $match: { tenantId: tid, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    { $project: { name: '$_id', count: 1, revenue: 1, _id: 0 } },
  ])

  // Category breakdown
  const categoryBreakdown = await Order.aggregate([
    { $match: { tenantId: tid, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ])

  const soldNames = new Set(topSold.map((i: any) => i.name))

  // Daily historical (last 30 days)
  const dailyOrders = await Order.aggregate([
    { $match: { tenantId: tid, createdAt: { $gte: thirtyDaysAgo }, status: { $nin: ['cancelled', 'open', 'awaiting_payment'] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
    { $sort: { _id: 1 } },
  ])

  const dailyMembers = await LoyaltyMember.aggregate([
    { $match: { tenantId: tid, joinedAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$joinedAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])

  const ordersMap = new Map(dailyOrders.map((d: any) => [d._id, d]))
  const membersMap = new Map(dailyMembers.map((d: any) => [d._id, d]))

  const historical: HistoricalData = { orders: [], revenue: [], members: [] }
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i)
    const label = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    const key = d.toISOString().split('T')[0]
    const dayData = ordersMap.get(key)
    const memberData = membersMap.get(key)
    historical.orders.push({ label, value: dayData?.count ?? 0 })
    historical.revenue.push({ label, value: dayData?.revenue ?? 0 })
    historical.members.push({ label, value: memberData?.count ?? 0 })
  }

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
    },
    conversionFunnel: {
      menuOpened: 0,
      dishViewed: 0,
      dishAdded: 0,
      checkoutStarted: 0,
      orderCompleted: todayOrders,
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
  }
}
