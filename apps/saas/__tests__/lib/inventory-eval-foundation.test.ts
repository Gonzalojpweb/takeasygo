// ============================================================================
// Fase V — cimientos de la suite experimental (packages/inventory-eval)
// ============================================================================
// Garantías metodológicas que tienen que valer ANTES de construir V-A:
//   · reproducibilidad por semilla y forks independientes (CRN);
//   · procedencia de parámetros congelable;
//   · el simulador usa el MISMO núcleo que producción.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { createRng, ProvenanceRegistry, SkuBelief } from '../../../../packages/inventory-eval/src'
import { emptyBelief, foldDeltas, beliefAt, DEFAULT_BELIEF_PARAMS } from '@takeasygo/business/inventory'

describe('RNG determinístico', () => {
  it('misma semilla → misma secuencia; forks independientes del consumo de otros', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])

    const world1 = createRng(7)
    const world2 = createRng(7)
    world1.fork('demanda').next() // consumir en un componente…
    // …no altera otro componente del mismo mundo.
    expect(world1.fork('yield').next()).toBe(world2.fork('yield').next())
  })
})

describe('Procedencia de parámetros', () => {
  it('un parámetro congelado no se puede cambiar mirando resultados', () => {
    const reg = new ProvenanceRegistry()
    reg.register({ name: 'omissionRate', value: 0.2, kind: 'justified_range', source: 'V-A §21 S1' })
    reg.freeze('2026-10-21')
    expect(() => reg.register({ name: 'omissionRate', value: 0.05, kind: 'justified_range', source: 'ajuste' })).toThrow(/congelado/)
  })
})

describe('V-C usa el núcleo de producción', () => {
  it('SkuBelief da el mismo resultado que el proyector del SaaS para los mismos hechos', () => {
    const T0 = Date.UTC(2026, 9, 1, 15)
    const sim = new SkuBelief('carne')
    sim.observe({ kind: 'count', eventId: 'c', occurredAt: T0, recordedAt: T0, skuId: 'carne', observed: 10, method: 'manual_scale' })
    sim.observe({ kind: 'sale', eventId: 's', occurredAt: T0 + 3600_000, recordedAt: T0 + 3600_000, productId: 'p', portions: 2, consumption: [{ skuId: 'carne', quantity: 0.3 }] })

    const prod = beliefAt(
      foldDeltas(emptyBelief(), [
        { kind: 'count', at: T0, observed: 10, method: 'manual_scale' },
        { kind: 'outflow', at: T0 + 3600_000, quantity: 0.3, relSigma: DEFAULT_BELIEF_PARAMS.theoreticalRelSigma, usage: true },
      ]),
      T0 + 7200_000,
    )
    expect(sim.at(T0 + 7200_000)).toEqual(prod)
  })
})
