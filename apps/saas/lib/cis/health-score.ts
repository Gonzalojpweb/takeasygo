// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/health-score.ts — Customer Health Score (P3)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Calcular un score unificado de salud del cliente (0-100).
//
// P3: "Customer Health Score debe existir desde el día 1. No como feature
// visual, como entidad del sistema. Porque después todo termina usando eso:
// segmentos, insights, campañas, experiencias, TGO."
//
// Diseño:
// - 7 componentes con pesos fijos (ajustables)
// - Cada componente normalizado a 0-100 usando percentiles del tenant
// - El score se calcula en el cron diario
// - Se guarda historial mensual (P4) para detectar tendencias
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import type { CustomerHealthScore } from '@/types/cis'
import type { CustomerCalcData, TenantCustomerStats, CisConfig } from './types'

// ── Pesos de los componentes ─────────────────────────────────────────────────
// Suma = 1.0
const COMPONENT_WEIGHTS = {
  frequency: 0.20,
  recency: 0.20,
  ltv: 0.20,
  engagement: 0.15,
  club: 0.10,
  rewards: 0.05,
  conversion: 0.10,
} as const

// ── Normalización usando percentiles ─────────────────────────────────────────

function normalizeToPercentile(value: number, p25: number, p50: number, p75: number, p90: number): number {
  if (value <= p25) return 25
  if (value <= p50) return 25 + 25 * ((value - p25) / (p50 - p25 || 1))
  if (value <= p75) return 50 + 25 * ((value - p50) / (p75 - p50 || 1))
  if (value <= p90) return 75 + 15 * ((value - p75) / (p90 - p75 || 1))
  return 90 + 10 * Math.min(1, (value - p90) / (p90 * 0.5 || 1))
}

// ── Cálculo de cada componente ───────────────────────────────────────────────

function computeFrequencyScore(customer: CustomerCalcData, stats: TenantCustomerStats): number {
  return normalizeToPercentile(
    customer.visitFrequency,
    stats.frequencyPercentiles.p25,
    stats.frequencyPercentiles.p50,
    stats.frequencyPercentiles.p75,
    stats.frequencyPercentiles.p90
  )
}

function computeRecencyScore(customer: CustomerCalcData, stats: TenantCustomerStats): number {
  // Recencia invertida: menos días = mejor score
  if (customer.daysSinceLastOrder === null) return 0
  const invertedValue = Math.max(0, 180 - customer.daysSinceLastOrder) // 180 días = score 0
  return normalizeToPercentile(
    invertedValue,
    180 - stats.avgOrderIntervalPercentiles.p90,  // invertido
    180 - stats.avgOrderIntervalPercentiles.p75,
    180 - stats.avgOrderIntervalPercentiles.p50,
    180 - stats.avgOrderIntervalPercentiles.p25,
  )
}

function computeLtvScore(customer: CustomerCalcData, stats: TenantCustomerStats): number {
  return normalizeToPercentile(
    customer.totalSpent,
    stats.ltvPercentiles.p25,
    stats.ltvPercentiles.p50,
    stats.ltvPercentiles.p75,
    stats.ltvPercentiles.p90
  )
}

function computeEngagementScore(customer: CustomerCalcData, stats: TenantCustomerStats): number {
  // Engagement = diversidad de productos (unique products)
  return normalizeToPercentile(
    customer.uniqueProducts,
    stats.diversityPercentiles.p25,
    stats.diversityPercentiles.p50,
    stats.diversityPercentiles.p75,
    stats.diversityPercentiles.p90
  )
}

function computeClubScore(customer: CustomerCalcData): number {
  if (!customer.clubStatus) return 0
  const tierScores: Record<string, number> = {
    bronze: 25, silver: 50, gold: 75, platinum: 100,
  }
  return tierScores[customer.clubStatus.toLowerCase()] ?? 30
}

function computeRewardsScore(customer: CustomerCalcData, stats: TenantCustomerStats): number {
  return normalizeToPercentile(
    customer.rewardUsageRate * 100, // convertir a porcentaje
    stats.rewardUsagePercentiles.p25,
    stats.rewardUsagePercentiles.p50,
    stats.rewardUsagePercentiles.p75,
    stats.rewardUsagePercentiles.p90
  )
}

function computeConversionScore(customer: CustomerCalcData): number {
  return Math.min(100, customer.conversionRate * 100)
}

// ── Función principal ────────────────────────────────────────────────────────

export function computeHealthScore(
  customer: CustomerCalcData,
  stats: TenantCustomerStats,
  config: CisConfig
): CustomerHealthScore {
  const components = {
    frequency: computeFrequencyScore(customer, stats),
    recency: computeRecencyScore(customer, stats),
    ltv: computeLtvScore(customer, stats),
    engagement: computeEngagementScore(customer, stats),
    club: computeClubScore(customer),
    rewards: computeRewardsScore(customer, stats),
    conversion: computeConversionScore(customer),
  }

  const total = Math.round(
    components.frequency * COMPONENT_WEIGHTS.frequency +
    components.recency * COMPONENT_WEIGHTS.recency +
    components.ltv * COMPONENT_WEIGHTS.ltv +
    components.engagement * COMPONENT_WEIGHTS.engagement +
    components.club * COMPONENT_WEIGHTS.club +
    components.rewards * COMPONENT_WEIGHTS.rewards +
    components.conversion * COMPONENT_WEIGHTS.conversion
  )

  return {
    total: Math.min(100, Math.max(0, total)),
    components,
    calculatedAt: new Date(),
  }
}
