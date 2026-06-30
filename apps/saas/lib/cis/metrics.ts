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
import type { CustomerMetrics } from '@/types/cis'
import { fetchCustomerEngagement, fetchBatchEngagement } from './posthog-bridge'

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Agregación: métricas base desde órdenes ──────────────────────────────────

export async function computeBaseMetrics(
  consumerId: mongoose.Types.ObjectId,
  tenantId: mongoose.Types.ObjectId
): Promise<Pick<CustomerMetrics, 'orderCount' | 'totalSpent' | 'firstOrderAt' | 'lastOrderAt' | 'avgTicket' | 'daysSinceLastOrder' | 'daysSinceFirstOrder' | 'visitFrequency' | 'avgOrderInterval'>> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const cid = new mongoose.Types.ObjectId(consumerId)

  // Obtener consumer base
  const consumer = await Consumer.findById(cid).lean()
  if (!consumer) {
    return {
      orderCount: 0, totalSpent: 0, firstOrderAt: null, lastOrderAt: null,
      avgTicket: 0, daysSinceLastOrder: null, daysSinceFirstOrder: null,
      visitFrequency: 0, avgOrderInterval: 0,
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
  const ninetyDaysAgo = daysAgo(90)
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

  return {
    orderCount, totalSpent, firstOrderAt, lastOrderAt,
    avgTicket, daysSinceLastOrder, daysSinceFirstOrder,
    visitFrequency, avgOrderInterval,
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
