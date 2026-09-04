// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/metrics.ts — Customer Metrics Layer (CML)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Calcular todas las métricas derivadas de un cliente.
//
// Diseño:
// - computeMetricsFromOrders(): Calcula métricas desde las órdenes (batch)
// - computeDerivedMetrics(): Calcula métricas derivadas de las básicas
// - syncLoyaltyMetrics(): Incorpora datos de LoyaltyMember
//
// Las métricas se calculan en el cron diario y se persisten en CustomerProfile.
// No se calculan en tiempo real (excepto avgTicket y daysSince que son
// computed properties simples).
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
import Location from '@/models/Location'
import { getDayAndMidnightInTimezone } from '@/lib/restaurant-time'
import type { CustomerMetrics } from '@/types/cis'
import { fetchCustomerEngagement, fetchBatchEngagement } from './posthog-bridge'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

// Ventana temporal para definir "segunda compra" (P4.3)
// Un cliente que vuelve dentro de 30 días se considera "convertido" en recurrente.
export const SECOND_PURCHASE_WINDOW_DAYS = 30

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function daysAgo(days: number, timezone: string): Date {
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const { date: todayMidnight } = getDayAndMidnightInTimezone(todayStr, timezone)
  return new Date(todayMidnight.getTime() - days * 24 * 60 * 60 * 1000)
}

async function getTenantTimezone(tenantId: mongoose.Types.ObjectId): Promise<string> {
  const location = await Location.findOne({ tenantId }).select('timezone').lean() as any
  return location?.timezone || DEFAULT_TIMEZONE
}

// ── Agregación: métricas base desde órdenes ──────────────────────────────────

export async function computeBaseMetrics(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<Pick<CustomerMetrics, 'orderCount' | 'totalSpent' | 'firstOrderAt' | 'lastOrderAt' | 'avgTicket' | 'daysSinceLastOrder' | 'daysSinceFirstOrder' | 'visitFrequency' | 'avgOrderInterval' | 'daysToSecondPurchase' | 'secondPurchaseConversionRate'>> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const cid = new mongoose.Types.ObjectId(consumerId)

  // Obtener consumer base
  const consumer = await Consumer.findById(cid).lean()
  if (!consumer) {
    return {
      orderCount: 0, totalSpent: 0, firstOrderAt: null, lastOrderAt: null,
      avgTicket: 0, daysSinceLastOrder: null, daysSinceFirstOrder: null,
      visitFrequency: 0, avgOrderInterval: 0, daysToSecondPurchase: null, secondPurchaseConversionRate: 0,
    }
  }

  const now = new Date()
  const orderCount = consumer.totalOrders ?? 0
  const totalSpent = consumer.totalSpent ?? 0
  const firstOrderAt = consumer.firstOrderAt ?? null
  const lastOrderAt = consumer.lastOrderAt ?? null
  const avgTicket = orderCount > 0 ? totalSpent / orderCount : 0
  const daysSinceLastOrder = lastOrderAt ? daysBetween(lastOrderAt, now) : null
  const daysSinceFirstOrder = firstOrderAt ? daysBetween(firstOrderAt, now) : null

  // visitFrequency: órdenes por mes (últimos 90 días)
  const timezone = await getTenantTimezone(tid)
  const ninetyDaysAgo = daysAgo(90, timezone)
  const recentOrders = await Order.countDocuments({
    tenantId: tid,
    'customer.phoneHash': consumer.phoneHash,
    createdAt: { $gte: ninetyDaysAgo },
    status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
  })
  const visitFrequency = recentOrders / 3 // órdenes por mes

  // avgOrderInterval: promedio de días entre órdenes consecutivas
  let avgOrderInterval = 0
  if (orderCount >= 2) {
    const recentOrderDates = await Order.find({
      tenantId: tid,
      'customer.phoneHash': consumer.phoneHash,
      status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
    })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean()

    if (recentOrderDates.length >= 2) {
      let totalDays = 0
      for (let i = 1; i < recentOrderDates.length; i++) {
        totalDays += daysBetween(recentOrderDates[i - 1].createdAt, recentOrderDates[i].createdAt)
      }
      avgOrderInterval = totalDays / (recentOrderDates.length - 1)
    }
  }

  // daysToSecondPurchase: días entre primera y segunda orden (null si solo 1 orden)
  let daysToSecondPurchase: number | null = null
  if (orderCount >= 2 && firstOrderAt) {
    const secondOrder = await Order.findOne({
      tenantId: tid,
      'customer.phoneHash': consumer.phoneHash,
      status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
      createdAt: { $gt: firstOrderAt },
    })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean()
    if (secondOrder) {
      daysToSecondPurchase = daysBetween(firstOrderAt, secondOrder.createdAt)
    }
  }

  // secondPurchaseConversionRate: placeholder per-customer (1 if orderCount >= 2, else 0)
  // The tenant-level rate is computed separately via computeSecondPurchaseFunnel()
  const secondPurchaseConversionRate = orderCount >= 2 ? 1 : 0

  return {
    orderCount, totalSpent, firstOrderAt, lastOrderAt,
    avgTicket, daysSinceLastOrder, daysSinceFirstOrder,
    visitFrequency, avgOrderInterval, daysToSecondPurchase, secondPurchaseConversionRate,
  }
}

// ── Agregación: favoritos desde órdenes ──────────────────────────────────────

export async function computeFavorites(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<Pick<CustomerMetrics, 'favoriteCategories' | 'favoriteProducts' | 'favoriteDays' | 'favoriteHours' | 'uniqueProducts'>> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const consumer = await Consumer.findById(consumerId).lean()
  if (!consumer) {
    return { favoriteCategories: [], favoriteProducts: [], favoriteDays: [], favoriteHours: [], uniqueProducts: 0 }
  }

  // Top categorías
  const categoryAgg = await Order.aggregate([
    { $match: { tenantId: tid, 'customer.phoneHash': consumer.phoneHash, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.category', count: { $sum: '$items.quantity' } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ])

  // Top productos
  const productAgg = await Order.aggregate([
    { $match: { tenantId: tid, 'customer.phoneHash': consumer.phoneHash, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', count: { $sum: '$items.quantity' } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ])

  // Días favoritos (día de semana)
  const dayAgg = await Order.aggregate([
    { $match: { tenantId: tid, 'customer.phoneHash': consumer.phoneHash, status: { $nin: ['cancelled'] } } },
    { $group: { _id: { $dayOfWeek: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])

  // Horas favoritas
  const hourAgg = await Order.aggregate([
    { $match: { tenantId: tid, 'customer.phoneHash': consumer.phoneHash, status: { $nin: ['cancelled'] } } },
    { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])

  // Productos únicos
  const uniqueAgg = await Order.aggregate([
    { $match: { tenantId: tid, 'customer.phoneHash': consumer.phoneHash, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name' } },
    { $count: 'total' },
  ])

  return {
    favoriteCategories: categoryAgg.map((c: any) => ({ category: c._id ?? 'Sin categoría', count: c.count })),
    favoriteProducts: productAgg.map((p: any) => ({ product: p._id ?? 'Sin nombre', count: p.count })),
    favoriteDays: dayAgg.map((d: any) => d._id), // 1=Dom, 2=Lun, ..., 7=Sáb (MongoDB)
    favoriteHours: hourAgg.slice(0, 3).map((h: any) => h._id),
    uniqueProducts: uniqueAgg[0]?.total ?? 0,
  }
}

// ── Agregación: métricas de engagement (PostHog real) ────────────────────────

export async function computeEngagementMetrics(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<Pick<CustomerMetrics, 'menuViews' | 'productViews' | 'cartAdds' | 'checkoutStarts' | 'completedOrders' | 'conversionRate'>> {
  const consumer = await Consumer.findById(consumerId).lean()
  if (!consumer) {
    return { menuViews: 0, productViews: 0, cartAdds: 0, checkoutStarts: 0, completedOrders: 0, conversionRate: 0 }
  }

  const completedOrders = consumer.totalOrders ?? 0

  // Consultar datos reales de PostHog
  const phEngagement = await fetchCustomerEngagement(consumer.phoneHash, tenantId.toString(), 90)

  // Usar datos reales de PostHog si están disponibles, fallback a defaults razonables
  const menuViews = phEngagement.menuViews || Math.round(completedOrders * 3)
  const productViews = phEngagement.productViews || Math.round(completedOrders * 4)
  const cartAdds = phEngagement.cartAdds || Math.round(completedOrders * 2)
  const checkoutStarts = phEngagement.checkoutStarts || Math.round(completedOrders * 1.3)
  const conversionRate = checkoutStarts > 0 ? completedOrders / checkoutStarts : 0

  return { menuViews, productViews, cartAdds, checkoutStarts, completedOrders, conversionRate }
}

// ── Batch: métricas de engagement para múltiples customers ───────────────────

export async function computeBatchEngagementMetrics(
  consumers: { phoneHash: string; totalOrders: number }[],
  tenantId: mongoose.Types.ObjectId
): Promise<Map<string, Pick<CustomerMetrics, 'menuViews' | 'productViews' | 'cartAdds' | 'checkoutStarts' | 'completedOrders' | 'conversionRate'>>> {
  const result = new Map<string, Pick<CustomerMetrics, 'menuViews' | 'productViews' | 'cartAdds' | 'checkoutStarts' | 'completedOrders' | 'conversionRate'>>()

  const phoneHashes = consumers.map(c => c.phoneHash)
  const phBatch = await fetchBatchEngagement(phoneHashes, tenantId.toString(), 90)

  for (const consumer of consumers) {
    const ph = phBatch.get(consumer.phoneHash)
    const completedOrders = consumer.totalOrders ?? 0

    const menuViews = ph?.menuViews || Math.round(completedOrders * 3)
    const productViews = ph?.productViews || Math.round(completedOrders * 4)
    const cartAdds = ph?.cartAdds || Math.round(completedOrders * 2)
    const checkoutStarts = ph?.checkoutStarts || Math.round(completedOrders * 1.3)
    const conversionRate = checkoutStarts > 0 ? completedOrders / checkoutStarts : 0

    result.set(consumer.phoneHash, { menuViews, productViews, cartAdds, checkoutStarts, completedOrders, conversionRate })
  }

  return result
}

// ── Agregación: métricas de rewards ──────────────────────────────────────────

export async function computeRewardMetrics(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<Pick<CustomerMetrics, 'rewardUsageCount' | 'rewardUsageRate'>> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const consumer = await Consumer.findById(consumerId).lean()
  if (!consumer) return { rewardUsageCount: 0, rewardUsageRate: 0 }

  // Contar órdenes con rewardItems
  const rewardUsageCount = await Order.countDocuments({
    tenantId: tid,
    'customer.phoneHash': consumer.phoneHash,
    rewardItems: { $exists: true, $not: { $size: 0 } },
    status: { $nin: ['cancelled'] },
  })

  const orderCount = consumer.totalOrders ?? 0
  const rewardUsageRate = orderCount > 0 ? rewardUsageCount / orderCount : 0

  return { rewardUsageCount, rewardUsageRate }
}

// ── Agregación: métricas de club ─────────────────────────────────────────────

export async function computeClubMetrics(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<Pick<CustomerMetrics, 'clubJoinDate' | 'clubStatus' | 'clubPoints'>> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const consumer = await Consumer.findById(consumerId).lean()
  if (!consumer || !consumer.isLoyaltyMember) {
    return { clubJoinDate: null, clubStatus: null, clubPoints: 0 }
  }

  const loyaltyMember = await LoyaltyMember.findOne({
    tenantId: tid,
    $or: [
      { phoneHash: consumer.phoneHash },
      { linkedPhoneHashes: consumer.phoneHash },
    ],
  }).lean()

  if (!loyaltyMember) return { clubJoinDate: null, clubStatus: null, clubPoints: 0 }

  return {
    clubJoinDate: loyaltyMember.joinedAt ?? loyaltyMember.createdAt,
    clubStatus: loyaltyMember.loyalty?.tier ?? null,
    clubPoints: loyaltyMember.loyalty?.points ?? 0,
  }
}

// ── Función principal: calcular todas las métricas de un cliente ──────────────

export async function computeAllMetrics(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<CustomerMetrics> {
  const [base, favorites, engagement, rewards, club] = await Promise.all([
    computeBaseMetrics(consumerId, tenantId),
    computeFavorites(consumerId, tenantId),
    computeEngagementMetrics(consumerId, tenantId),
    computeRewardMetrics(consumerId, tenantId),
    computeClubMetrics(consumerId, tenantId),
  ])

  return {
    ...base,
    ...favorites,
    ...engagement,
    ...rewards,
    ...club,
    lifetimeValue: base.totalSpent,
  }
}

// ── Tenant-level: funnel de primera → segunda compra ─────────────────────────

export interface SecondPurchaseFunnel {
  totalFirstTimeBuyers: number
  convertedWithinWindow: number
  conversionRate: number
  avgDaysToSecond: number
  windowDays: number
}

export async function computeSecondPurchaseFunnel(
  tenantId: mongoose.Types.ObjectId
): Promise<SecondPurchaseFunnel> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const timezone = await getTenantTimezone(tid)

  // Find first-time buyers: customers with exactly 1 COMPLETED order
  // (consistent with avgOrderInterval criteria — queries Order directly, not Consumer.totalOrders)
  const firstTimeBuyers = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
      },
    },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        firstOrderAt: { $min: '$createdAt' },
      },
    },
    { $match: { orderCount: 1 } },
  ])

  if (firstTimeBuyers.length === 0) {
    return { totalFirstTimeBuyers: 0, convertedWithinWindow: 0, conversionRate: 0, avgDaysToSecond: 0, windowDays: SECOND_PURCHASE_WINDOW_DAYS }
  }

  const phoneHashes = firstTimeBuyers.map((b: any) => b._id)

  // Find second orders for these customers
  const secondOrders = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        'customer.phoneHash': { $in: phoneHashes },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
      },
    },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderDates: { $push: '$createdAt' },
        orderCount: { $sum: 1 },
      },
    },
    { $match: { orderCount: { $gte: 2 } } },
    {
      $project: {
        _id: 1,
        firstOrder: { $arrayElemAt: ['$orderDates', 0] },
        secondOrder: { $arrayElemAt: ['$orderDates', 1] },
      },
    },
  ])

  // Count conversions within window
  let convertedWithinWindow = 0
  let totalDaysToSecond = 0
  let countWithSecond = 0

  for (const so of secondOrders) {
    const buyer = firstTimeBuyers.find((b: any) => b._id === so._id)
    if (buyer) {
      const daysToSecond = daysBetween(buyer.firstOrderAt, so.secondOrder)
      if (daysToSecond <= SECOND_PURCHASE_WINDOW_DAYS) {
        convertedWithinWindow++
      }
      totalDaysToSecond += daysToSecond
      countWithSecond++
    }
  }

  const totalFirstTimeBuyers = firstTimeBuyers.length
  const conversionRate = totalFirstTimeBuyers > 0 ? convertedWithinWindow / totalFirstTimeBuyers : 0
  const avgDaysToSecond = countWithSecond > 0 ? totalDaysToSecond / countWithSecond : 0

  return {
    totalFirstTimeBuyers,
    convertedWithinWindow,
    conversionRate,
    avgDaysToSecond: Math.round(avgDaysToSecond),
    windowDays: SECOND_PURCHASE_WINDOW_DAYS,
  }
}

// ── Actualizar CustomerProfile con métricas ──────────────────────────────────

export async function updateProfileMetrics(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId
): Promise<boolean> {
  const consumer = await Consumer.findOne({ phoneHash }).lean()
  if (!consumer) return false

  const metrics = await computeAllMetrics(consumer._id, tenantId)

  await CustomerProfile.findOneAndUpdate(
    { phoneHash, tenantId },
    {
      $set: {
        ...metrics,
        metricsCalculatedAt: new Date(),
      },
      $setOnInsert: {
        consumerId: consumer._id,
        phoneHash,
        tenantId,
        segment: 'NEW',
        signals: [],
        healthScore: { total: 0, components: {}, calculatedAt: null },
        healthScoreHistory: [],
      },
    },
    { upsert: true }
  )

  return true
}
