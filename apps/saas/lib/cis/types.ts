// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/types.ts — Tipos internos del engine CIS
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Tipos específicos del motor de inteligencia.
// Separados de types/cis.ts (que tiene tipos compartidos con frontend).
// ─────────────────────────────────────────────────────────────────────────────

import type { CustomerSegment, CustomerSignal, CustomerInsightSeverity, CustomerActionType } from '@/types/cis'

// ── Configuración del engine ─────────────────────────────────────────────────
export interface CisConfig {
  minOrdersForSegmentation: number   // Mínimo de órdenes para segmentar (default: 5)
  minSampleForPercentiles: number    // Mínimo de clientes para calcular percentiles del tenant (default: 20)
  anomalyZScoreThreshold: number     // Z-score para detectar anomalías (default: 1.5)
  dormancyMultiplier: number          // Multiplicador del intervalo para detectar dormancy (default: 2)
}

export const DEFAULT_CIS_CONFIG: CisConfig = {
  minOrdersForSegmentation: 5,
  minSampleForPercentiles: 20,
  anomalyZScoreThreshold: 1.5,
  dormancyMultiplier: 2,
}

// ── Resultado del análisis de un tenant ──────────────────────────────────────
export interface CisAnalysisResult {
  profilesProcessed: number
  segmentsChanged: number
  signalsDetected: number
  healthScoresCalculated: number
  eventsCreated: number
  executionTimeMs: number
}

// ── Estadísticas del tenant (para segmentación relativa) ─────────────────────
export interface TenantCustomerStats {
  totalCustomers: number
  avgTicketPercentiles: { p25: number; p50: number; p75: number; p90: number }
  ltvPercentiles: { p25: number; p50: number; p75: number; p90: number }
  frequencyPercentiles: { p25: number; p50: number; p75: number; p90: number }
  diversityPercentiles: { p25: number; p50: number; p75: number; p90: number }
  rewardUsagePercentiles: { p25: number; p50: number; p75: number; p90: number }
  avgOrderIntervalPercentiles: { p25: number; p50: number; p75: number; p90: number }
}

// ── Datos de un cliente para cálculos ────────────────────────────────────────
export interface CustomerCalcData {
  phoneHash: string
  consumerId: string
  tenantId: string
  orderCount: number
  totalSpent: number
  avgTicket: number
  firstOrderAt: Date | null
  lastOrderAt: Date | null
  daysSinceLastOrder: number | null
  visitFrequency: number
  avgOrderInterval: number
  uniqueProducts: number
  rewardUsageRate: number
  conversionRate: number
  clubStatus: string | null
  signals: CustomerSignal[]
  segment: CustomerSegment
  healthScoreTotal: number
}

// ── Regla de segmentación ────────────────────────────────────────────────────
export interface SegmentationRule {
  segment: CustomerSegment
  evaluate: (customer: CustomerCalcData, stats: TenantCustomerStats, config: CisConfig) => boolean
  priority: number // Mayor = más prioritario (si un cliente cumple múltiples, gana el de mayor prioridad)
}

// ── Regla de señal ───────────────────────────────────────────────────────────
export interface SignalRule {
  signal: CustomerSignal
  detect: (customer: CustomerCalcData, stats: TenantCustomerStats, config: CisConfig) => boolean
}
