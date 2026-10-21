// ============================================================================
// Priority Engine v1 — ¿qué vale la pena verificar ahora? (D-13)
// ============================================================================
// Corrige el problema dimensional de EER-v1 (σ × costo × velocidad × impacto
// − IC): ahora todo está en DINERO, así que la resta tiene sentido y el
// ranking es comparable entre insumos de unidades distintas.
//
//   valor en riesgo  = σ × costo unitario × impacto × (1 + 2·P(faltante))
//                    + inconsistencias (μ negativo, discrepancia sin resolver)
//   costo de pedirlo = minutos que lleva × costo del minuto a esa hora
//   prioridad        = valor en riesgo − costo de pedirlo
//
// Se pide verificar solo si la prioridad es positiva: un viernes 21:45 el
// minuto cuesta 4 veces más y solo entran los insumos que lo justifican.
//
// Todo número es HIPÓTESIS V1 parametrizada (Fase V la calibra), con versión.
// ============================================================================

import type { InventoryBelief, BusinessImpact } from "@takeasygo/types"

export interface PriorityParams {
  version: string
  /** Horizonte (días) para evaluar riesgo de faltante. */
  horizonDays: number
  /** Costo de un minuto de personal en hora normal. @storedAs cents */
  minuteCostCents: number
  /** Multiplicador del costo del minuto por hora local (0–23). */
  hourMultiplier: number[]
  /** Minutos estimados de una verificación puntual. */
  verificationMinutes: number
  impactWeight: Record<BusinessImpact, number>
  /** Máximo de verificaciones por lista diaria. */
  maxItems: number
  /** Probabilidad (z) para el límite inferior de cobertura. */
  lowerBoundZ: number
}

/** Provenance: supuestos iniciales (sueldo ~ $6.000/h → $100/min = 10.000 ¢; picos ×4). */
export const DEFAULT_PRIORITY_PARAMS: PriorityParams = {
  version: "priority-v1.0",
  horizonDays: 2,
  minuteCostCents: 10_000,
  hourMultiplier: [
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, // 00–05 cerrado
    0.7, 0.8, 0.8, 1, 1, 2, // 06–11
    4, 4, 2, 1, 1, 1, // 12–17 (almuerzo 12–14)
    1.5, 2, 4, 4, 4, 2, // 18–23 (cena 20–23)
  ],
  verificationMinutes: 1.5,
  impactWeight: { critical: 3, high: 2, medium: 1, low: 0.5 },
  maxItems: 6,
  lowerBoundZ: 1.2816, // 90 %
}

export interface PriorityInput {
  skuId: string
  storageLocationId: string
  name: string
  unit: string
  businessImpact: BusinessImpact
  parLevel: number | null
  /** Precio de referencia si todavía no hay costo promedio. @storedAs cents */
  referenceUnitCostCents: number
  belief: InventoryBelief
}

export type StockAlert = "out" | "low" | null

export interface PriorityItem {
  skuId: string
  storageLocationId: string
  name: string
  unit: string
  valueAtRiskCents: number
  interruptionCostCents: number
  scoreCents: number
  stockoutProbability: number
  coverageDays: number | null
  stockAlert: StockAlert
  reasons: string[]
}

/** Φ(x): CDF normal estándar (Abramowitz–Stegun 7.1.26). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2)
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

const pesos = (cents: number) => `$${Math.round(cents / 100).toLocaleString("es-AR")}`

export function unitCostOf(input: Pick<PriorityInput, "belief" | "referenceUnitCostCents">): number {
  return input.belief.avgUnitCostCents > 0 ? input.belief.avgUnitCostCents : Math.max(input.referenceUnitCostCents, 0)
}

/** Alerta de reposición según el límite inferior (90 %) de la estimación. */
export function stockAlertOf(belief: InventoryBelief, parLevel: number | null, params: PriorityParams = DEFAULT_PRIORITY_PARAMS): StockAlert {
  if (!belief.anchored) return null
  const lower = belief.mu - params.lowerBoundZ * belief.sigma
  if (belief.mu <= 0) return "out"
  const need = Math.max(parLevel ?? 0, belief.dailyUsage * params.horizonDays)
  return need > 0 && lower < need ? "low" : null
}

export function computePriority(input: PriorityInput, localHour: number, params: PriorityParams = DEFAULT_PRIORITY_PARAMS): PriorityItem {
  const b = input.belief
  const cost = unitCostOf(input)
  const impact = params.impactWeight[input.businessImpact] ?? 1
  const reasons: string[] = []

  const need = b.dailyUsage * params.horizonDays
  let stockoutProbability = 0
  let value = 0

  if (!b.anchored) {
    // Sin línea base el stock real es desconocido: el riesgo es todo lo que
    // se mueve en una semana (o el stock mínimo, si es mayor).
    const scale = Math.max(b.dailyUsage * 7, Math.abs(b.mu), input.parLevel ?? 0)
    value = scale * cost * impact
    reasons.push("Nunca se contó: falta el conteo inicial")
  } else {
    stockoutProbability = b.sigma > 0 ? 1 - normalCdf((b.mu - need) / b.sigma) : b.mu < need ? 1 : 0
    if (need === 0) stockoutProbability = b.mu < 0 ? 1 : 0
    value = b.sigma * cost * impact * (1 + 2 * stockoutProbability)
    if (b.sigma * cost >= 100_000) reasons.push(`La incertidumbre equivale a ${pesos(b.sigma * cost)}`)
    if (stockoutProbability >= 0.2) reasons.push(`${Math.round(stockoutProbability * 100)} % de probabilidad de faltante en ${params.horizonDays} días`)
  }

  if (b.flags.includes("negative_estimate")) {
    value += Math.abs(b.mu) * cost
    reasons.push("Se vendió más de lo registrado: falta una recepción o hay un error de receta")
  }
  if (b.lastDiscrepancy) {
    value += Math.abs(b.lastDiscrepancy.valueCents) * 0.5
    reasons.push(`El último conteo difirió ${pesos(Math.abs(b.lastDiscrepancy.valueCents))} de lo esperado`)
  }
  if (b.anchored && b.lastObservedAt === null) reasons.push("Sin verificaciones registradas")

  const multiplier = params.hourMultiplier[((localHour % 24) + 24) % 24] ?? 1
  const interruption = params.verificationMinutes * params.minuteCostCents * multiplier
  const valueAtRisk = Math.round(value)

  return {
    skuId: input.skuId,
    storageLocationId: input.storageLocationId,
    name: input.name,
    unit: input.unit,
    valueAtRiskCents: valueAtRisk,
    interruptionCostCents: Math.round(interruption),
    scoreCents: Math.round(valueAtRisk - interruption),
    stockoutProbability: Math.round(stockoutProbability * 1000) / 1000,
    coverageDays: b.anchored && b.dailyUsage > 0 ? Math.round((b.mu / b.dailyUsage) * 10) / 10 : null,
    stockAlert: stockAlertOf(b, input.parLevel, params),
    reasons,
  }
}

/** Lista "Verificá estos N": solo lo que vale más que interrumpir. */
export function selectVerifications(
  inputs: readonly PriorityInput[],
  localHour: number,
  params: PriorityParams = DEFAULT_PRIORITY_PARAMS,
): PriorityItem[] {
  return inputs
    .map((i) => computePriority(i, localHour, params))
    .filter((p) => p.scoreCents > 0)
    .sort((a, b) => b.scoreCents - a.scoreCents)
    .slice(0, params.maxItems)
}

/** Nivel de confianza para la UI (lenguaje operacional, no estadístico). */
export function confidenceLevelOf(belief: InventoryBelief): "high" | "medium" | "low" | "critical" | "unknown" {
  if (!belief.anchored) return "unknown"
  const scale = Math.max(Math.abs(belief.mu), belief.dailyUsage, 1e-6)
  const r = belief.sigma / scale
  if (r < 0.1) return "high"
  if (r < 0.25) return "medium"
  if (r < 0.5) return "low"
  return "critical"
}

export const CONFIDENCE_LABELS: Record<ReturnType<typeof confidenceLevelOf>, string> = {
  high: "Confiable",
  medium: "Atención",
  low: "Requiere verificación",
  critical: "Alta incertidumbre",
  unknown: "Sin conteo inicial",
}
