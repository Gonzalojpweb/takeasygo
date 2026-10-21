// ============================================================================
// Contrato de observabilidad (V-E §14): lo ÚNICO que ven TGO y el baseline
// ============================================================================
// El Ground Truth (V-B) nunca cruza esta frontera: la capa observable lo
// transforma en eventos con omisiones, ruido, demoras y duplicados.
// Regla anti-leak: ningún tipo de este archivo referencia al Ground Truth.
// ============================================================================

import type { ObservationMethod } from '@takeasygo/types'

export type ObservableEvent =
  | { kind: 'receipt'; eventId: string; occurredAt: number; recordedAt: number; skuId: string; quantity: number; unitCostCents: number | null }
  | { kind: 'sale'; eventId: string; occurredAt: number; recordedAt: number; productId: string; portions: number; consumption: Array<{ skuId: string; quantity: number }> }
  | { kind: 'waste'; eventId: string; occurredAt: number; recordedAt: number; skuId: string; quantity: number; measured: boolean }
  | { kind: 'count'; eventId: string; occurredAt: number; recordedAt: number; skuId: string; observed: number; method: ObservationMethod }

export type DecisionAction =
  | { type: 'BUY'; skuId: string; quantity: number }
  | { type: 'COUNT'; skuId: string; method: ObservationMethod; estimatedMinutes: number }
  | { type: 'WAIT' }

export interface DecisionRecord {
  at: number
  actor: 'tgo' | 'baseline_t1' | 'baseline_t2' | 'baseline_t3'
  action: DecisionAction
  /** Por qué: estado creído y regla aplicada (auditoría, V-D §39). */
  rationale: { beliefMu?: number; beliefSigma?: number; scoreCents?: number; attentionBudgetLeft: number; rule: string }
}
