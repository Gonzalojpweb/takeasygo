// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/signals.ts — Customer Intelligence Layer (CIL)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Detectar señales de comportamiento individual del cliente.
//
// P2: "No construir reglas. Construir señales."
// Ejemplo malo: Si cliente no compra hace 30 días → Dormido
// Ejemplo bueno: Cliente compraba cada 5 días. Lleva 18 días sin comprar.
//                Anomalía detectada.
//
// P2: "Observa comportamiento individual, no comportamiento genérico."
//
// Diseño:
// - Cada señal observa el comportamiento del cliente vs su propio historial
// - No se comparan contra umbrales fijos
// - Se usan z-scores, regresiones, y comparaciones temporales
// ─────────────────────────────────────────────────────────────────────────────

import type { CustomerSignal } from '@/types/cis'
import type { CustomerCalcData, TenantCustomerStats, SignalRule, CisConfig } from './types'
import { DEFAULT_CIS_CONFIG as CONFIG } from './types'

// ── Reglas de detección de señales ───────────────────────────────────────────

const SIGNAL_RULES: SignalRule[] = [
  // Altamente frecuente: frecuencia > P75 del tenant
  {
    signal: 'highly_frequent',
    detect: (c, stats) => c.visitFrequency >= stats.frequencyPercentiles.p75,
  },

  // Desaceleración: intervalo promedio se extendió significativamente
  {
    signal: 'decelerating',
    detect: (c, stats, config) => {
      if (c.orderCount < 4) return false
      if (c.daysSinceLastOrder === null || c.avgOrderInterval === 0) return false
      // Si su intervalo actual es > 1.5× su promedio
      return c.daysSinceLastOrder > c.avgOrderInterval * 1.5
    },
  },

  // Crecimiento de gasto: LTV > P50 + buena frecuencia
  {
    signal: 'spending_growth',
    detect: (c, stats) =>
      c.totalSpent >= stats.ltvPercentiles.p50 &&
      c.visitFrequency >= stats.frequencyPercentiles.p50,
  },

  // Caída de frecuencia: frecuencia cayó vs su propio historial
  {
    signal: 'frequency_drop',
    detect: (c, stats, config) => {
      if (c.orderCount < 4) return false
      if (c.daysSinceLastOrder === null || c.avgOrderInterval === 0) return false
      return c.daysSinceLastOrder > c.avgOrderInterval * 2
    },
  },

  // Altamente leal: recurrencia + LTV > P75 del tenant
  {
    signal: 'highly_loyal',
    detect: (c, stats) =>
      c.visitFrequency >= stats.frequencyPercentiles.p75 &&
      c.totalSpent >= stats.ltvPercentiles.p75,
  },

  // Sensible a descuentos: > 70% de órdenes usan rewards
  {
    signal: 'discount_sensitive',
    detect: (c) => c.rewardUsageRate >= 0.7,
  },

  // Explorador: alta diversidad de productos
  {
    signal: 'explorer',
    detect: (c, stats) => c.uniqueProducts >= stats.diversityPercentiles.p75,
  },

  // Premium: ticket promedio > P90 del tenant
  {
    signal: 'premium',
    detect: (c, stats) =>
      c.orderCount >= CONFIG.minOrdersForSegmentation &&
      c.avgTicket >= stats.avgTicketPercentiles.p90,
  },

  // Alto potencial: crecimiento positivo en métricas
  {
    signal: 'high_potential',
    detect: (c, stats) =>
      c.orderCount >= 3 &&
      c.totalSpent >= stats.ltvPercentiles.p50 &&
      c.totalSpent < stats.ltvPercentiles.p90 &&
      c.visitFrequency >= stats.frequencyPercentiles.p50,
  },

  // Dormido: sin compra > 2× intervalo promedio
  {
    signal: 'dormant',
    detect: (c, stats, config) => {
      if (c.orderCount < 2) return false
      if (c.daysSinceLastOrder === null) return false
      return c.avgOrderInterval > 0 &&
        c.daysSinceLastOrder > c.avgOrderInterval * config.dormancyMultiplier
    },
  },

  // En riesgo: caída significativa vs su propio historial
  {
    signal: 'at_risk',
    detect: (c, stats, config) => {
      if (c.orderCount < 3) return false
      if (c.daysSinceLastOrder === null) return false
      return c.avgOrderInterval > 0 &&
        c.daysSinceLastOrder > c.avgOrderInterval * config.dormancyMultiplier * 1.5
    },
  },

  // Recuperado: volvió a comprar después de dormancia
  {
    signal: 'recovered',
    detect: (c, stats) => {
      if (c.orderCount < 3) return false
      // Proxy: tiene buenas métricas generales pero su última compra fue reciente
      return c.daysSinceLastOrder !== null &&
        c.daysSinceLastOrder <= 7 &&
        c.totalSpent >= stats.ltvPercentiles.p25
    },
  },
]

// ── Función principal ────────────────────────────────────────────────────────

export function detectSignals(
  customer: CustomerCalcData,
  stats: TenantCustomerStats,
  config: CisConfig = CONFIG
): CustomerSignal[] {
  const detected: CustomerSignal[] = []
  for (const rule of SIGNAL_RULES) {
    if (rule.detect(customer, stats, config)) {
      detected.push(rule.signal)
    }
  }
  return detected
}
