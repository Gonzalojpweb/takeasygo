// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/segmentation.ts — Customer Segmentation Layer (CSL)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Clasificar automáticamente clientes en segmentos.
//
// P1: "Los segmentos NO deben ser estáticos. Siempre relativos.
// Basados en percentiles, desviación estándar, distribución histórica,
// comparación contra sí mismo. Nunca números mágicos."
//
// Diseño:
// - Cada regla evalúa contra estadísticas del tenant (no fijas)
// - Si el tenant tiene pocos clientes, se usa configuración por defecto
// - Los segmentos se recalculan en el cron diario
// - Un cliente puede cumplir múltiples reglas; gana la de mayor prioridad
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import CustomerProfile from '@/models/CustomerProfile'
import type { CustomerSegment } from '@/types/cis'
import type { CustomerCalcData, TenantCustomerStats, SegmentationRule, CisConfig, DEFAULT_CIS_CONFIG } from './types'
import { DEFAULT_CIS_CONFIG as CONFIG } from './types'

// ── Reglas de segmentación ───────────────────────────────────────────────────
// Orden de prioridad: de mayor a menor
// Si un cliente cumple múltiples, gana el de mayor prioridad

const SEGMENTATION_RULES: SegmentationRule[] = [
  // VIP: Top 10% por LTV del tenant (prioridad 100)
  {
    segment: 'VIP',
    priority: 100,
    evaluate: (c, stats) => c.orderCount >= CONFIG.minOrdersForSegmentation &&
      c.totalSpent >= stats.ltvPercentiles.p90,
  },

  // PREMIUM: Top 10% por ticket promedio del tenant (prioridad 90)
  {
    segment: 'PREMIUM',
    priority: 90,
    evaluate: (c, stats) => c.orderCount >= CONFIG.minOrdersForSegmentation &&
      c.avgTicket >= stats.avgTicketPercentiles.p90,
  },

  // AT_RISK: Caída significativa vs comportamiento propio (prioridad 85)
  // P2: Observa comportamiento individual, no genérico
  {
    segment: 'AT_RISK',
    priority: 85,
    evaluate: (c, stats, config) => {
      if (c.orderCount < 3) return false
      if (c.daysSinceLastOrder === null) return false
      // Si lleva más del doble de su intervalo promedio sin comprar
      return c.avgOrderInterval > 0 &&
        c.daysSinceLastOrder > c.avgOrderInterval * config.dormancyMultiplier
    },
  },

  // DORMANT: Sin compra > 2× su intervalo promedio (prioridad 80)
  // P2: NO usa 30 días fijos, usa el comportamiento del cliente
  {
    segment: 'DORMANT',
    priority: 80,
    evaluate: (c, stats, config) => {
      if (c.orderCount < 2) return false
      if (c.daysSinceLastOrder === null) return false
      return c.avgOrderInterval > 0 &&
        c.daysSinceLastOrder > c.avgOrderInterval * config.dormancyMultiplier * 1.5
    },
  },

  // HIGH_POTENTIAL: Crecimiento acelerado (prioridad 70)
  // P2: Detecta tendencia positiva en spending
  {
    segment: 'HIGH_POTENTIAL',
    priority: 70,
    evaluate: (c, stats) => {
      if (c.orderCount < 3) return false
      // Proxy: tiene buen gasto pero no es aún VIP
      return c.totalSpent >= stats.ltvPercentiles.p50 &&
        c.totalSpent < stats.ltvPercentiles.p90 &&
        c.visitFrequency >= stats.frequencyPercentiles.p50
    },
  },

  // FREQUENT: Frecuencia > percentil 50 del tenant (prioridad 60)
  {
    segment: 'FREQUENT',
    priority: 60,
    evaluate: (c, stats) => c.orderCount >= CONFIG.minOrdersForSegmentation &&
      c.visitFrequency >= stats.frequencyPercentiles.p50,
  },

  // LOYAL: Recencia + Frecuencia combinados (prioridad 50)
  {
    segment: 'LOYAL',
    priority: 50,
    evaluate: (c, stats) => {
      if (c.orderCount < CONFIG.minOrdersForSegmentation) return false
      const recencyOk = c.daysSinceLastOrder !== null && c.daysSinceLastOrder <= stats.avgOrderIntervalPercentiles.p50
      const frequencyOk = c.visitFrequency >= stats.frequencyPercentiles.p50
      return recencyOk && frequencyOk
    },
  },

  // EXPLORER: Alta diversidad de productos (prioridad 40)
  {
    segment: 'EXPLORER',
    priority: 40,
    evaluate: (c, stats) => c.orderCount >= CONFIG.minOrdersForSegmentation &&
      c.uniqueProducts >= stats.diversityPercentiles.p75,
  },

  // PROMOTION_HUNTER: Alta dependencia de rewards (prioridad 30)
  {
    segment: 'PROMOTION_HUNTER',
    priority: 30,
    evaluate: (c, stats) => c.orderCount >= CONFIG.minOrdersForSegmentation &&
      c.rewardUsageRate >= 0.7 && // 70% o más de sus órdenes usan rewards
      c.rewardUsageRate * 100 >= stats.rewardUsagePercentiles.p75,
  },

  // NEW: 0-3 pedidos (prioridad 10 — el más bajo, solo si no cumple otro)
  {
    segment: 'NEW',
    priority: 10,
    evaluate: (c) => c.orderCount < CONFIG.minOrdersForSegmentation,
  },
]

// ── Función principal ────────────────────────────────────────────────────────

export function classifySegment(
  customer: CustomerCalcData,
  stats: TenantCustomerStats,
  config: CisConfig = CONFIG
): CustomerSegment {
  // Evaluar reglas en orden de prioridad
  const sorted = [...SEGMENTATION_RULES].sort((a, b) => b.priority - a.priority)
  for (const rule of sorted) {
    if (rule.evaluate(customer, stats, config)) {
      return rule.segment
    }
  }
  return 'NEW' // Default
}

// ── Calcular estadísticas del tenant ─────────────────────────────────────────

export async function computeTenantStats(
  tenantId: mongoose.Types.ObjectId
): Promise<TenantCustomerStats> {
  const profiles = await CustomerProfile.find({ tenantId })
    .select('avgTicket lifetimeValue visitFrequency uniqueProducts rewardUsageRate avgOrderInterval')
    .lean()

  if (profiles.length < 20) {
    // Pocos datos: usar estadísticas por defecto razonables
    return {
      totalCustomers: profiles.length,
      avgTicketPercentiles: { p25: 3000, p50: 5000, p75: 8000, p90: 12000 },
      ltvPercentiles: { p25: 10000, p50: 25000, p75: 50000, p90: 100000 },
      frequencyPercentiles: { p25: 0.3, p50: 0.8, p75: 1.5, p90: 3 },
      diversityPercentiles: { p25: 3, p50: 6, p75: 12, p90: 20 },
      rewardUsagePercentiles: { p25: 0.1, p50: 0.3, p75: 0.5, p90: 0.7 },
      avgOrderIntervalPercentiles: { p25: 7, p50: 14, p75: 30, p90: 60 },
    }
  }

  // Calcular percentiles reales
  const sorted = {
    avgTicket: profiles.map(p => p.avgTicket).sort((a, b) => a - b),
    ltv: profiles.map(p => p.lifetimeValue).sort((a, b) => a - b),
    frequency: profiles.map(p => p.visitFrequency).sort((a, b) => a - b),
    diversity: profiles.map(p => p.uniqueProducts).sort((a, b) => a - b),
    rewardUsage: profiles.map(p => p.rewardUsageRate).sort((a, b) => a - b),
    avgOrderInterval: profiles.map(p => p.avgOrderInterval).sort((a, b) => a - b),
  }

  function percentile(arr: number[], p: number): number {
    const idx = Math.ceil((p / 100) * arr.length) - 1
    return arr[Math.max(0, idx)]
  }

  return {
    totalCustomers: profiles.length,
    avgTicketPercentiles: {
      p25: percentile(sorted.avgTicket, 25),
      p50: percentile(sorted.avgTicket, 50),
      p75: percentile(sorted.avgTicket, 75),
      p90: percentile(sorted.avgTicket, 90),
    },
    ltvPercentiles: {
      p25: percentile(sorted.ltv, 25),
      p50: percentile(sorted.ltv, 50),
      p75: percentile(sorted.ltv, 75),
      p90: percentile(sorted.ltv, 90),
    },
    frequencyPercentiles: {
      p25: percentile(sorted.frequency, 25),
      p50: percentile(sorted.frequency, 50),
      p75: percentile(sorted.frequency, 75),
      p90: percentile(sorted.frequency, 90),
    },
    diversityPercentiles: {
      p25: percentile(sorted.diversity, 25),
      p50: percentile(sorted.diversity, 50),
      p75: percentile(sorted.diversity, 75),
      p90: percentile(sorted.diversity, 90),
    },
    rewardUsagePercentiles: {
      p25: percentile(sorted.rewardUsage, 25),
      p50: percentile(sorted.rewardUsage, 50),
      p75: percentile(sorted.rewardUsage, 75),
      p90: percentile(sorted.rewardUsage, 90),
    },
    avgOrderIntervalPercentiles: {
      p25: percentile(sorted.avgOrderInterval, 25),
      p50: percentile(sorted.avgOrderInterval, 50),
      p75: percentile(sorted.avgOrderInterval, 75),
      p90: percentile(sorted.avgOrderInterval, 90),
    },
  }
}

// ── Re-segmentar todos los clientes de un tenant ─────────────────────────────

export async function resegmentateAll(
  tenantId: mongoose.Types.ObjectId,
  config: CisConfig = CONFIG
): Promise<{ total: number; changed: number }> {
  const stats = await computeTenantStats(tenantId)
  const profiles = await CustomerProfile.find({ tenantId }).lean()

  let changed = 0
  for (const profile of profiles) {
    const customerData: CustomerCalcData = {
      phoneHash: profile.phoneHash,
      consumerId: profile.consumerId.toString(),
      tenantId: profile.tenantId.toString(),
      orderCount: profile.orderCount,
      totalSpent: profile.totalSpent,
      avgTicket: profile.avgTicket,
      firstOrderAt: profile.firstOrderAt,
      lastOrderAt: profile.lastOrderAt,
      daysSinceLastOrder: profile.daysSinceLastOrder,
      visitFrequency: profile.visitFrequency,
      avgOrderInterval: profile.avgOrderInterval,
      uniqueProducts: profile.uniqueProducts,
      rewardUsageRate: profile.rewardUsageRate,
      conversionRate: profile.conversionRate,
      clubStatus: profile.clubStatus,
      signals: profile.signals,
      segment: profile.segment,
      healthScoreTotal: profile.healthScore.total,
    }

    const newSegment = classifySegment(customerData, stats, config)
    if (newSegment !== profile.segment) {
      await CustomerProfile.updateOne(
        { _id: profile._id },
        { $set: { segment: newSegment, lastSegmentAt: new Date() } }
      )
      changed++
    }
  }

  return { total: profiles.length, changed }
}
