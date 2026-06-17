import mongoose from 'mongoose'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import type { BenchmarkItem, BenchmarkMetric, BenchmarkStatus, BenchmarkData } from './types'

function daysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

type PeerMetrics = Record<BenchmarkMetric, number>

interface LabelConfig {
  label: string
  tooltip: string
}

const METRIC_LABELS: Record<BenchmarkMetric, LabelConfig> = {
  orders7d: {
    label: 'Pedidos semanales',
    tooltip: 'Cantidad de pedidos completados en los últimos 7 días',
  },
  revenue7d: {
    label: 'Facturación semanal',
    tooltip: 'Ingresos totales de los últimos 7 días',
  },
  avgOrderValue: {
    label: 'Ticket promedio',
    tooltip: 'Valor promedio por pedido en los últimos 7 días',
  },
  newMembers7d: {
    label: 'Nuevos miembros club',
    tooltip: 'Miembros nuevos del club de fidelización en los últimos 7 días',
  },
  activeMembers: {
    label: 'Miembros activos',
    tooltip: 'Total de miembros activos del club de fidelización',
  },
  conversionRate: {
    label: 'Tasa de conversión',
    tooltip: 'Porcentaje de pedidos completados vs. aperturas del menú',
  },
}

function computePercentile(sortedValues: number[], value: number): number {
  if (sortedValues.length === 0) return 50
  if (value <= sortedValues[0]) return 1
  if (value >= sortedValues[sortedValues.length - 1]) return 99
  let low = 0
  let high = sortedValues.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (sortedValues[mid] < value) low = mid + 1
    else high = mid
  }
  return Math.round((low / sortedValues.length) * 100)
}

function getStatus(percentile: number): BenchmarkStatus {
  if (percentile >= 90) return 'top'
  if (percentile >= 65) return 'above_average'
  if (percentile >= 35) return 'average'
  if (percentile >= 10) return 'below_average'
  return 'bottom'
}

function getBadge(status: BenchmarkStatus, metric: BenchmarkMetric, percentile: number): string {
  switch (status) {
    case 'top': return 'Top rendimiento'
    case 'above_average': return 'Sobre el promedio'
    case 'average': return 'En el promedio'
    case 'below_average': return 'Bajo el promedio'
    case 'bottom': return 'A mejorar'
  }
}

function percentileAt(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const index = Math.ceil((p / 100) * arr.length) - 1
  return arr[Math.max(0, Math.min(index, arr.length - 1))]
}

export async function computeBenchmarks(tenantId: string): Promise<BenchmarkData> {
  const tid = new mongoose.Types.ObjectId(tenantId)

  const Tenant = (await import('@/models/Tenant')).default
  const peers = await Tenant.find({
    isActive: true,
    plan: { $in: ['buy', 'full'] },
  }).select('_id').lean() as any[]

  const peerIds = peers.map(p => p._id)
  const peerCount = peerIds.length

  if (peerCount === 0) {
    return { benchmarks: [], generatedAt: new Date().toISOString() }
  }

  const sevenDaysAgo = daysAgo(7)

  // Aggregate orders per tenant (last 7 days)
  const ordersAgg = await Order.aggregate([
    {
      $match: {
        tenantId: { $in: peerIds },
        createdAt: { $gte: sevenDaysAgo },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
      },
    },
    {
      $group: {
        _id: '$tenantId',
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
      },
    },
  ])

  // Aggregate new loyalty members per tenant (last 7 days)
  const membersAgg = await LoyaltyMember.aggregate([
    {
      $match: {
        tenantId: { $in: peerIds },
        joinedAt: { $gte: sevenDaysAgo },
      },
    },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
  ])

  // Aggregate active loyalty members per tenant
  const activeMembersAgg = await LoyaltyMember.aggregate([
    {
      $match: {
        tenantId: { $in: peerIds },
        status: 'active',
      },
    },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
  ])

  // Build maps
  const ordersMap = new Map<string, { orders: number; revenue: number }>()
  for (const row of ordersAgg) {
    ordersMap.set(row._id.toString(), { orders: row.orders, revenue: row.revenue })
  }
  const membersMap = new Map<string, number>()
  for (const row of membersAgg) {
    membersMap.set(row._id.toString(), row.count)
  }
  const activeMap = new Map<string, number>()
  for (const row of activeMembersAgg) {
    activeMap.set(row._id.toString(), row.count)
  }

  // Build peer metrics
  const allMetrics: PeerMetrics[] = []
  const tenantStr = tenantId.toString()

  for (const pid of peerIds) {
    const key = pid.toString()
    const o = ordersMap.get(key)
    const orders = o?.orders ?? 0
    const revenue = o?.revenue ?? 0

    allMetrics.push({
      orders7d: orders,
      revenue7d: revenue,
      avgOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
      newMembers7d: membersMap.get(key) ?? 0,
      activeMembers: activeMap.get(key) ?? 0,
      conversionRate: 0, // PostHog data not available per-tenant in batch
    })
  }

  // Tenant's own values
  const myOrders = ordersMap.get(tenantStr)?.orders ?? 0
  const myRevenue = ordersMap.get(tenantStr)?.revenue ?? 0
  const myAvgOrderValue = myOrders > 0 ? Math.round(myRevenue / myOrders) : 0
  const myNewMembers = membersMap.get(tenantStr) ?? 0
  const myActiveMembers = activeMap.get(tenantStr) ?? 0

  const myValues: PeerMetrics = {
    orders7d: myOrders,
    revenue7d: myRevenue,
    avgOrderValue: myAvgOrderValue,
    newMembers7d: myNewMembers,
    activeMembers: myActiveMembers,
    conversionRate: 0,
  }

  const metrics: BenchmarkMetric[] = ['orders7d', 'revenue7d', 'avgOrderValue', 'newMembers7d', 'activeMembers']

  const benchmarks: BenchmarkItem[] = metrics.map(metric => {
    const sorted = allMetrics.map(m => m[metric]).sort((a, b) => a - b)
    const value = myValues[metric]
    const percentile = computePercentile(sorted, value)
    const status = getStatus(percentile)

    return {
      metric,
      label: METRIC_LABELS[metric].label,
      value,
      peerCount,
      percentile,
      p25: percentileAt(sorted, 25),
      p50: percentileAt(sorted, 50),
      p75: percentileAt(sorted, 75),
      p90: percentileAt(sorted, 90),
      status,
      badge: getBadge(status, metric, percentile),
      tooltip: METRIC_LABELS[metric].tooltip,
    }
  })

  return {
    benchmarks,
    generatedAt: new Date().toISOString(),
  }
}
