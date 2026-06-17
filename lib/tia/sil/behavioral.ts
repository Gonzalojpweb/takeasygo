import mongoose from 'mongoose'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import type { Insight, SilConfig } from '../types'

interface BehavioralResult {
  clubImpact: Insight | null
  rewardAdvanceImpact: Insight | null
}

export async function analyzeBehavioral(
  tenantId: string,
  config: SilConfig
): Promise<BehavioralResult> {
  const tid = new mongoose.Types.ObjectId(tenantId)

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [
    clubImpact,
    rewardAdvanceImpact,
  ] = await Promise.all([
    analyzeClubImpact(tid, ninetyDaysAgo, config),
    analyzeRewardAdvanceImpact(tid, ninetyDaysAgo, config),
  ])

  return { clubImpact, rewardAdvanceImpact }
}

async function analyzeClubImpact(
  tid: mongoose.Types.ObjectId,
  since: Date,
  config: SilConfig
): Promise<Insight | null> {
  // Get all orders with phoneHash in last 90 days
  const orders = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        deletedAt: null,
        createdAt: { $gte: since },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
        'customer.phoneHash': { $exists: true, $ne: '' },
      },
    },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        lastOrder: { $max: '$createdAt' },
      },
    },
  ])

  if (orders.length < config.minSampleSize) return null

  const phoneHashes = orders.map(o => o._id)

  // Find which phoneHashes belong to loyalty members
  const members = await LoyaltyMember.find({
    tenantId: tid,
    phoneHash: { $in: phoneHashes },
    status: 'active',
  }).select('phoneHash cache.totalOrders cache.totalSpent').lean() as any[]

  const memberHashSet = new Set(members.map((m: any) => m.phoneHash))

  let memberOrders = 0
  let memberSpent = 0
  let nonMemberOrders = 0
  let nonMemberSpent = 0
  let memberCustomers = 0
  let nonMemberCustomers = 0

  for (const c of orders) {
    if (memberHashSet.has(c._id)) {
      memberOrders += c.orderCount
      memberSpent += c.totalSpent
      memberCustomers++
    } else {
      nonMemberOrders += c.orderCount
      nonMemberSpent += c.totalSpent
      nonMemberCustomers++
    }
  }

  if (memberCustomers < 5 || nonMemberCustomers < 5) return null

  const memberAvgOrderValue = memberOrders > 0 ? memberSpent / memberOrders : 0
  const nonMemberAvgOrderValue = nonMemberOrders > 0 ? nonMemberSpent / nonMemberOrders : 0
  const memberAvgOrdersPerCustomer = memberCustomers > 0 ? memberOrders / memberCustomers : 0
  const nonMemberAvgOrdersPerCustomer = nonMemberCustomers > 0 ? nonMemberOrders / nonMemberCustomers : 0

  // Calculate the combined delta (spend per customer)
  const memberSpendPerCustomer = memberCustomers > 0 ? memberSpent / memberCustomers : 0
  const nonMemberSpendPerCustomer = nonMemberCustomers > 0 ? nonMemberSpent / nonMemberCustomers : 0

  const delta = nonMemberSpendPerCustomer > 0
    ? Math.round(((memberSpendPerCustomer - nonMemberSpendPerCustomer) / nonMemberSpendPerCustomer) * 100)
    : 0

  if (Math.abs(delta) < 15) return null

  const isPositive = delta > 0
  const sampleSize = memberCustomers + nonMemberCustomers

  return {
    type: 'central_tendency',
    severity: isPositive ? 'info' : 'warning',
    category: 'club',
    title: isPositive
      ? 'Miembros del club gastan más que no miembros'
      : 'Clientes sin membresía gastan más que miembros del club',
    description: isPositive
      ? `Los miembros del club gastan ${delta}% más por cliente que los no miembros ($${Math.round(memberSpendPerCustomer).toLocaleString('es-AR')} vs $${Math.round(nonMemberSpendPerCustomer).toLocaleString('es-AR')} en 90 días).`
      : `Los miembros del club gastan ${Math.abs(delta)}% menos por cliente que los no miembros. Revisar beneficios y comunicación del club.`,
    metric: 'club.spendPerCustomer',
    currentValue: Math.round(memberSpendPerCustomer),
    previousValue: Math.round(nonMemberSpendPerCustomer),
    changePercent: delta,
    sampleSize,
    recommendation: isPositive
      ? 'Fortalecer adquisición de membresías — los miembros generan mayor valor.'
      : 'Revisar beneficios del club y comunicación con miembros.',
  }
}

async function analyzeRewardAdvanceImpact(
  tid: mongoose.Types.ObjectId,
  since: Date,
  config: SilConfig
): Promise<Insight | null> {
  // Customers who used Reward Advance
  const raOrders = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        deletedAt: null,
        createdAt: { $gte: since },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
        rewardAdvanceApplied: true,
        'customer.phoneHash': { $exists: true, $ne: '' },
      },
    },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        firstOrder: { $min: '$createdAt' },
        lastOrder: { $max: '$createdAt' },
      },
    },
  ])

  // Customers who never used Reward Advance
  const nonRAOrders = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        deletedAt: null,
        createdAt: { $gte: since },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
        rewardAdvanceApplied: { $ne: true },
        'customer.phoneHash': { $exists: true, $ne: '' },
      },
    },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        firstOrder: { $min: '$createdAt' },
        lastOrder: { $max: '$createdAt' },
      },
    },
  ])

  if (raOrders.length < 5 || nonRAOrders.length < config.minSampleSize) return null

  // For RA users: calculate avg days to return (between first and second order)
  // We only have aggregated data, so we approximate using the recency
  const raAvgOrders = raOrders.reduce((s, c) => s + c.orderCount, 0) / raOrders.length
  const nonRaAvgOrders = nonRAOrders.reduce((s, c) => s + c.orderCount, 0) / nonRAOrders.length

  const delta = nonRaAvgOrders > 0
    ? Math.round(((raAvgOrders - nonRaAvgOrders) / nonRaAvgOrders) * 100)
    : 0

  if (Math.abs(delta) < 10) return null

  const isPositive = delta > 0
  const sampleSize = raOrders.length + nonRAOrders.length

  return {
    type: 'central_tendency',
    severity: isPositive ? 'info' : 'warning',
    category: 'conversion',
    title: isPositive
      ? 'Reward Advance impulsa recurrencia de clientes'
      : 'Usuarios de Reward Advance tienen menor recurrencia',
    description: isPositive
      ? `Los clientes que usan Reward Advance promedian ${raAvgOrders.toFixed(1)} pedidos vs ${nonRaAvgOrders.toFixed(1)} de quienes no lo usan (${delta}% más frecuencia en 90 días).`
      : `Los clientes que usan Reward Advance tienen ${Math.abs(delta)}% menos recurrencia que el promedio. Evaluar si la deuda de puntos desincentiva nuevas compras.`,
    metric: 'rewardAdvance.avgOrdersPerCustomer',
    currentValue: Math.round(raAvgOrders * 10) / 10,
    previousValue: Math.round(nonRaAvgOrders * 10) / 10,
    changePercent: delta,
    sampleSize,
    recommendation: isPositive
      ? 'Promover Reward Advance en checkout para aumentar recurrencia.'
      : 'Revisar condiciones de Reward Advance para evitar desincentivar compras futuras.',
  }
}
