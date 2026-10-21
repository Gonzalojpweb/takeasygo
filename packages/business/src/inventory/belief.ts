// ============================================================================
// Belief Engine v1 — estimación μ ± σ de un insumo × depósito
// ============================================================================
// Implementación de referencia de V-C §4–§8 (DECISIONES_VIGENTES D-05, D-06):
//
//   · Entre observaciones la incertidumbre CRECE de forma aditiva:
//       var += Σ (ruido de cada movimiento)²  +  (deriva diaria)² × días
//     Un insumo que no se cuenta pierde confianza con el tiempo y con el uso.
//
//   · Un conteo NO reemplaza al estado: se combina según la incertidumbre de
//     ambos (filtro de Kalman 1-D). Un conteo malo sobre una estimación
//     confiable mueve poco; un conteo bueno sobre una estimación vieja manda.
//
//   · μ puede ser NEGATIVO (D-06): "se vendió más de lo que sabíamos que
//     había" es evidencia (FASE01 §14). Se marca, no se esconde.
//
//   · Sin conteo inicial el estado está "sin línea base" (D-11): μ solo suma
//     movimientos y no representa el stock real.
//
// Puro y determinístico: sin I/O, sin Date.now(). Lo usan el SaaS (producción)
// y el simulador V-C (experimento) — el mismo código en ambos lados.
//
// Todos los parámetros numéricos viven en BeliefParams con versión: son
// HIPÓTESIS V1 a calibrar en la Fase V, no constantes de la arquitectura.
// ============================================================================

import type { ObservationMethod, InventoryBelief, InventoryFlag, DiscrepancyRecord } from "@takeasygo/types"

const DAY_MS = 86_400_000

export interface BeliefParams {
  version: string
  /** σ relativo de un consumo calculado por receta (porcionado real ≠ receta). */
  theoreticalRelSigma: number
  /** σ relativo de un movimiento registrado (transferencia, producción). */
  recordedRelSigma: number
  /** σ relativo de una recepción (remito vs. lo que realmente entró). */
  receiptRelSigma: number
  /** σ relativo de una merma pesada / estimada. */
  wasteMeasuredRelSigma: number
  wasteEstimatedRelSigma: number
  /** Deriva diaria no registrada como fracción del consumo diario. */
  dailyDriftRelSigma: number
  /** Error relativo de cada método de observación. */
  measurementRelSigma: Record<ObservationMethod, number>
  /** Vida media (días) del promedio móvil de consumo diario. */
  usageHalfLifeDays: number
  /** |z| a partir del cual un conteo se considera discrepancia. */
  discrepancyZ: number
  /** Desfase horario de la sede para cortar días (minutos; AR = -180). */
  utcOffsetMinutes: number
}

/** Parámetros V1 — provenance: supuestos iniciales del Lead/ingeniería (no calibrados). */
export const DEFAULT_BELIEF_PARAMS: BeliefParams = {
  version: "belief-v1.0",
  theoreticalRelSigma: 0.1,
  recordedRelSigma: 0.01,
  receiptRelSigma: 0.02,
  wasteMeasuredRelSigma: 0.03,
  wasteEstimatedRelSigma: 0.25,
  dailyDriftRelSigma: 0.05,
  measurementRelSigma: {
    connected_scale: 0.005,
    manual_scale: 0.02,
    visual_count: 0.08,
    estimation: 0.25,
  },
  usageHalfLifeDays: 7,
  discrepancyZ: 2.5,
  utcOffsetMinutes: -180,
}

/** Estado interno serializable (lo que persiste el proyector). */
export interface BeliefState {
  mu: number
  variance: number
  /** Momento de ocurrencia hasta el que está proyectado (ms epoch); null = vacío. */
  asOf: number | null
  anchored: boolean
  lastObservedAt: number | null
  lastObservationMethod: ObservationMethod | null
  avgUnitCostCents: number
  // Consumo diario: EWMA con corrección de sesgo por días cerrados.
  usageRaw: number
  usageWeight: number
  dayIndex: number | null
  dayUsage: number
  lastDiscrepancy: DiscrepancyRecord | null
  timesIgnored: number
  eventsApplied: number
}

/** Movimiento normalizado sobre UN agregado (lo arma aggregate-deltas.ts). */
export type BeliefDelta =
  | { kind: "inflow"; at: number; quantity: number; relSigma: number; unitCostCents: number | null }
  /** usage=false para movimientos que no son consumo (transferencias). */
  | { kind: "outflow"; at: number; quantity: number; relSigma: number; usage: boolean }
  | { kind: "count"; at: number; observed: number; method: ObservationMethod }
  | { kind: "adjust"; at: number; delta: number }
  | { kind: "ignored"; at: number }

export function emptyBelief(): BeliefState {
  return {
    mu: 0,
    variance: 0,
    asOf: null,
    anchored: false,
    lastObservedAt: null,
    lastObservationMethod: null,
    avgUnitCostCents: 0,
    usageRaw: 0,
    usageWeight: 0,
    dayIndex: null,
    dayUsage: 0,
    lastDiscrepancy: null,
    timesIgnored: 0,
    eventsApplied: 0,
  }
}

function dayIndexOf(ms: number, params: BeliefParams): number {
  return Math.floor((ms + params.utcOffsetMinutes * 60_000) / DAY_MS)
}

/** Inicio (ms epoch, UTC) del día local con índice `index`. */
export function dayStartMs(index: number, params: BeliefParams): number {
  return index * DAY_MS - params.utcOffsetMinutes * 60_000
}

function ewmaAlpha(params: BeliefParams): number {
  return 1 - Math.pow(0.5, 1 / params.usageHalfLifeDays)
}

/** Consumo diario estimado (unidad canónica / día). */
export function dailyUsageOf(state: BeliefState): number {
  return state.usageWeight > 0 ? Math.max(state.usageRaw / state.usageWeight, 0) : 0
}

export type DayStartHook = (dayIndex: number, stateAtDayStart: BeliefState) => void

/** Suma la deriva (merma no registrada, porcionado) desde asOf hasta `to`. */
function addDrift(state: BeliefState, to: number, params: BeliefParams): void {
  if (state.asOf === null || to <= state.asOf) return
  const days = (to - state.asOf) / DAY_MS
  const driftSigma = params.dailyDriftRelSigma * dailyUsageOf(state)
  state.variance += driftSigma * driftSigma * days
  state.asOf = to
}

/** Cierra el día en curso: actualiza el promedio de consumo y pasa al siguiente. */
function rollDay(state: BeliefState, alpha: number): void {
  const used = Math.max(state.dayUsage, 0)
  state.usageRaw = alpha * used + (1 - alpha) * state.usageRaw
  state.usageWeight = alpha + (1 - alpha) * state.usageWeight
  state.dayUsage = 0
  state.dayIndex = (state.dayIndex ?? 0) + 1
}

/**
 * Avanza el reloj hasta `at`, día por día: la incertidumbre crece con el
 * tiempo sin observar y el consumo diario se recalcula en cada corte. El hook
 * recibe el estado EXACTO al inicio de cada día (asOf = inicio del día), que
 * es lo que el proyector guarda como snapshot para re-proyectar eventos tardíos.
 */
export function advanceTo(state: BeliefState, at: number, params: BeliefParams, onDayStart?: DayStartHook): void {
  if (state.asOf === null || state.dayIndex === null) {
    state.asOf = at
    state.dayIndex = dayIndexOf(at, params)
    return
  }
  if (at <= state.asOf) return
  const target = dayIndexOf(at, params)
  const alpha = ewmaAlpha(params)
  let guard = 0
  while (state.dayIndex < target && guard++ < 5000) {
    addDrift(state, dayStartMs(state.dayIndex + 1, params), params)
    rollDay(state, alpha)
    if (onDayStart) onDayStart(state.dayIndex, cloneBelief(state))
  }
  addDrift(state, at, params)
}

function measurementVariance(observed: number, method: ObservationMethod, state: BeliefState, params: BeliefParams): number {
  // Con conteo 0 el error no puede ser 0: se usa medio día de consumo como escala.
  const scale = Math.max(Math.abs(observed), dailyUsageOf(state) * 0.5, 1e-3)
  const s = params.measurementRelSigma[method] * scale
  return s * s
}

/** Aplica UN movimiento (los deltas deben llegar ordenados por `at`). */
export function applyDelta(state: BeliefState, delta: BeliefDelta, params: BeliefParams, onDayStart?: DayStartHook): void {
  advanceTo(state, delta.at, params, onDayStart)
  switch (delta.kind) {
    case "inflow": {
      if (delta.unitCostCents !== null && delta.unitCostCents >= 0 && delta.quantity > 0) {
        const base = Math.max(state.mu, 0)
        state.avgUnitCostCents =
          base + delta.quantity > 0
            ? Math.round((base * state.avgUnitCostCents + delta.quantity * delta.unitCostCents) / (base + delta.quantity))
            : delta.unitCostCents
      }
      state.mu += delta.quantity
      state.variance += (delta.relSigma * delta.quantity) ** 2
      break
    }
    case "outflow": {
      state.mu -= delta.quantity
      state.variance += (delta.relSigma * delta.quantity) ** 2
      if (delta.usage) state.dayUsage += delta.quantity
      break
    }
    case "adjust": {
      state.mu += delta.delta
      break
    }
    case "count": {
      const R = measurementVariance(delta.observed, delta.method, state, params)
      if (!state.anchored) {
        state.mu = delta.observed
        state.variance = R
        state.anchored = true
        state.lastDiscrepancy = null
      } else {
        const P = state.variance
        const S = P + R
        const residual = delta.observed - state.mu
        const z = S > 0 ? residual / Math.sqrt(S) : 0
        const gain = S > 0 ? P / S : 1
        state.lastDiscrepancy =
          Math.abs(z) >= params.discrepancyZ
            ? {
                at: new Date(delta.at).toISOString(),
                expected: round6(state.mu),
                observed: delta.observed,
                difference: round6(residual),
                zScore: Math.round(z * 100) / 100,
                valueCents: Math.round(residual * state.avgUnitCostCents),
              }
            : null
        state.mu += gain * residual
        state.variance = (1 - gain) * P
      }
      state.lastObservedAt = delta.at
      state.lastObservationMethod = delta.method
      state.timesIgnored = 0
      break
    }
    case "ignored": {
      state.timesIgnored += 1
      break
    }
  }
  state.mu = round6(state.mu)
  state.variance = Math.max(state.variance, 0)
  state.eventsApplied += 1
}

export function foldDeltas(
  initial: BeliefState,
  deltas: readonly BeliefDelta[],
  params: BeliefParams = DEFAULT_BELIEF_PARAMS,
  onDayStart?: DayStartHook,
): BeliefState {
  const state = cloneBelief(initial)
  for (const d of deltas) applyDelta(state, d, params, onDayStart)
  return state
}

export function cloneBelief(state: BeliefState): BeliefState {
  return { ...state, lastDiscrepancy: state.lastDiscrepancy ? { ...state.lastDiscrepancy } : null }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Tolerancia para considerar μ negativo (ruido de redondeo). */
const NEGATIVE_EPSILON = 1e-6

/** Vista pública de la creencia al instante `now` (proyecta la deriva hasta ahora). */
export function beliefAt(state: BeliefState, now: number, params: BeliefParams = DEFAULT_BELIEF_PARAMS): InventoryBelief {
  const s = cloneBelief(state)
  if (s.asOf !== null && now > s.asOf) advanceTo(s, now, params)
  const flags: InventoryFlag[] = []
  if (!s.anchored) flags.push("never_observed")
  if (s.mu < -NEGATIVE_EPSILON) flags.push("negative_estimate")
  if (s.lastDiscrepancy) flags.push("discrepancy")
  return {
    mu: s.mu,
    sigma: round6(Math.sqrt(s.variance)),
    asOf: s.asOf !== null ? new Date(s.asOf).toISOString() : null,
    anchored: s.anchored,
    lastObservedAt: s.lastObservedAt !== null ? new Date(s.lastObservedAt).toISOString() : null,
    lastObservationMethod: s.lastObservationMethod,
    dailyUsage: round6(dailyUsageOf(s)),
    avgUnitCostCents: s.avgUnitCostCents,
    flags,
    lastDiscrepancy: s.lastDiscrepancy,
    eventsApplied: s.eventsApplied,
  }
}
