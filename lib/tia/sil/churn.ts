import mongoose from 'mongoose'
import Order from '@/models/Order'
import type { Insight, SilConfig } from '../types'

export async function analyzeChurn(
  tenantId: string,
  config: SilConfig
): Promise<Insight | null> {
  const tid = new mongoose.Types.ObjectId(tenantId)

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  // Get all customers with their order history (last 90 days)
  const customers = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        createdAt: { $gte: ninetyDaysAgo },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
        'customer.phoneHash': { $exists: true, $ne: '' },
      },
    },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        firstOrder: { $min: '$createdAt' },
        lastOrder: { $max: '$createdAt' },
        totalSpent: { $sum: '$total' },
      },
    },
  ])

  if (customers.length < config.minSampleSize) return null

  // Customers who ordered in period A (60-30 days ago)
  const periodA = customers.filter(c =>
    c.lastOrder >= sixtyDaysAgo && c.lastOrder < thirtyDaysAgo
  )

  // Customers who were active in period A AND also ordered in period B (last 30 days)
  const periodACustomers = new Set(
    customers
      .filter(c => c.lastOrder >= sixtyDaysAgo)
      .map(c => c._id)
  )

  const periodBCustomers = new Set(
    customers
      .filter(c => c.lastOrder >= thirtyDaysAgo)
      .map(c => c._id)
  )

  // Churned: were active in period A but not in period B
  const churned = [...periodACustomers].filter(id => !periodBCustomers.has(id))

  const totalPeriodA = periodACustomers.size
  if (totalPeriodA < config.minSampleSize) return null

  const churnRate = (churned.length / totalPeriodA) * 100

  // Churn risk: customers whose last order was 30-45 days ago (about to churn)
  const riskThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const riskCustomers = customers.filter(c =>
    c.lastOrder < riskThreshold &&
    c.lastOrder >= new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000) &&
    c.orderCount >= 2
  )

  // New customers who haven't returned (single order, >30 days ago)
  const lostNewCustomers = customers.filter(c =>
    c.orderCount === 1 &&
    c.lastOrder < thirtyDaysAgo
  )

  if (churnRate < 5 && riskCustomers.length === 0) return null

  const severity = churnRate > 30 ? 'critical' : churnRate > 15 ? 'warning' : 'info'

  const parts: string[] = []
  if (churnRate > 5) {
    parts.push(`Tasa de abandono: ${churnRate.toFixed(0)}% (${churned.length} de ${totalPeriodA} clientes activos no regresaron en los últimos 30 días)`)
  }
  if (riskCustomers.length > 0) {
    parts.push(`${riskCustomers.length} clientes recurrentes están en riesgo de abandono (sin pedidos en >30 días)`)
  }
  if (lostNewCustomers.length > 0) {
    parts.push(`${lostNewCustomers.length} clientes nuevos hicieron un solo pedido y no regresaron`)
  }

  return {
    type: 'historical',
    severity,
    category: 'operations',
    title: churnRate > 15
      ? 'Abandono de clientes por encima de lo esperado'
      : 'Detección temprana de abandono',
    description: parts.join('. '),
    metric: 'churn.rate',
    currentValue: Math.round(churnRate * 10) / 10,
    sampleSize: totalPeriodA,
    changePercent: Math.round(churnRate),
    recommendation: churnRate > 15
      ? 'Implementar campaña de reenganche para clientes inactivos: reward de bienvenida, descuento por tiempo limitado o notificación push.'
      : riskCustomers.length > 0
        ? 'Enviar recordatorio personalizado a clientes en riesgo con una oferta exclusiva.'
        : 'Mantener programa de fidelización activo para preservar la recurrencia.',
  }
}

export async function analyzeRecurrence(
  tenantId: string,
  config: SilConfig
): Promise<Insight | null> {
  const tid = new mongoose.Types.ObjectId(tenantId)

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Get customers with at least 2 orders
  const repeatCustomers = await Order.aggregate([
    {
      $match: {
        tenantId: tid,
        createdAt: { $gte: ninetyDaysAgo },
        status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
        'customer.phoneHash': { $exists: true, $ne: '' },
      },
    },
    {
      $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: '$total' },
      },
    },
    {
      $sort: { orderCount: -1 },
    },
  ])

  if (repeatCustomers.length < config.minSampleSize) return null

  const totalCustomers = repeatCustomers.length
  const repeatBuyers = repeatCustomers.filter(c => c.orderCount >= 2)
  const repeatRate = (repeatBuyers.length / totalCustomers) * 100

  const singleBuyers = totalCustomers - repeatBuyers.length

  if (singleBuyers < config.minSampleSize * 0.5) return null

  const severity = repeatRate < 20 ? 'critical' : repeatRate < 35 ? 'warning' : 'info'

  return {
    type: 'central_tendency',
    severity,
    category: 'conversion',
    title: severity === 'critical'
      ? 'Muy baja tasa de recompra'
      : severity === 'warning'
        ? 'Tasa de recompra por debajo de lo esperado'
        : 'Tasa de recompra saludable',
    description: `Solo ${repeatBuyers.length} de ${totalCustomers} clientes (${repeatRate.toFixed(0)}%) realizaron más de un pedido en los últimos 90 días. ${singleBuyers} clientes compraron una sola vez y no regresaron.`,
    metric: 'recurrence.repeatRate',
    currentValue: Math.round(repeatRate * 10) / 10,
    sampleSize: totalCustomers,
    changePercent: Math.round(repeatRate - 35),
    recommendation: repeatRate < 30
      ? 'Implementar programa de fidelización con rewards por segunda compra. Considerar descuento de bienvenida post-primera compra.'
      : 'Reforzar el club de fidelización para convertir compradores únicos en recurrentes.',
  }
}
