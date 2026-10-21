// ============================================================================
// V-C — adaptador de creencia: usa el MISMO núcleo que producción
// ============================================================================
// DECISIONES_VIGENTES D-16: el simulador no "porta" el proyector, importa
// @takeasygo/business/inventory. Lo que se valida en la Fase V es exactamente
// el código que corre en los restaurantes.
// ============================================================================

import {
  DEFAULT_BELIEF_PARAMS,
  applyDelta,
  beliefAt,
  emptyBelief,
  type BeliefDelta,
  type BeliefParams,
  type BeliefState,
} from '@takeasygo/business/inventory'
import type { ObservableEvent } from '../contracts/observable'

export function deltasForSku(ev: ObservableEvent, skuId: string, params: BeliefParams): BeliefDelta[] {
  switch (ev.kind) {
    case 'receipt':
      return ev.skuId === skuId
        ? [{ kind: 'inflow', at: ev.occurredAt, quantity: ev.quantity, relSigma: params.receiptRelSigma, unitCostCents: ev.unitCostCents }]
        : []
    case 'waste':
      return ev.skuId === skuId
        ? [{
            kind: 'outflow',
            at: ev.occurredAt,
            quantity: ev.quantity,
            relSigma: ev.measured ? params.wasteMeasuredRelSigma : params.wasteEstimatedRelSigma,
            usage: true,
          }]
        : []
    case 'count':
      return ev.skuId === skuId ? [{ kind: 'count', at: ev.occurredAt, observed: ev.observed, method: ev.method }] : []
    case 'sale':
      return ev.consumption
        .filter((c) => c.skuId === skuId && c.quantity !== 0)
        .map((c) => ({ kind: 'outflow' as const, at: ev.occurredAt, quantity: c.quantity, relSigma: params.theoreticalRelSigma, usage: true }))
  }
}

/** Creencia de TGO sobre un insumo, alimentada SOLO con eventos observables. */
export class SkuBelief {
  private readonly state: BeliefState = emptyBelief()

  constructor(
    readonly skuId: string,
    private readonly params: BeliefParams = DEFAULT_BELIEF_PARAMS,
  ) {}

  /** Los eventos deben llegar en orden de ocurrencia (lo garantiza el runner). */
  observe(ev: ObservableEvent): void {
    for (const d of deltasForSku(ev, this.skuId, this.params)) applyDelta(this.state, d, this.params)
  }

  at(now: number) {
    return beliefAt(this.state, now, this.params)
  }
}
