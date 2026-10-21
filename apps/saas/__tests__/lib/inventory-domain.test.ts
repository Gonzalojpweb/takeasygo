// ============================================================================
// Núcleo de dominio de inventario (@takeasygo/business/inventory)
// ============================================================================
// Cada caso de la auditoría 2026-10-21 (§5, A–G) con el resultado ESPERADO,
// más reconciliación de ventas y prioridades.
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  emptyBelief,
  foldDeltas,
  beliefAt,
  deltasForAggregate,
  explodeSaleLine,
  flattenModifiers,
  planSaleCorrections,
  summarizeRecorded,
  saleEventId,
  computePriority,
  selectVerifications,
  confidenceLevelOf,
  stockAlertOf,
  convertQuantity,
  suggestIngredientsForDish,
  DEFAULT_BELIEF_PARAMS,
  type BeliefDelta,
  type SkuUnitInfo,
} from '@takeasygo/business/inventory'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 1, 15, 0, 0) // 12:00 AR
const P = DEFAULT_BELIEF_PARAMS

const receive = (at: number, quantity: number, unitCostCents: number | null = 900_000): BeliefDelta =>
  ({ kind: 'inflow', at, quantity, relSigma: P.receiptRelSigma, unitCostCents })
const sell = (at: number, quantity: number): BeliefDelta =>
  ({ kind: 'outflow', at, quantity, relSigma: P.theoreticalRelSigma, usage: true })
const count = (at: number, observed: number, method: 'manual_scale' | 'visual_count' = 'manual_scale'): BeliefDelta =>
  ({ kind: 'count', at, observed, method })

describe('Belief engine — casos de la auditoría', () => {
  it('A/E. sin conteo: el estado queda "sin línea base" y la incertidumbre crece con uso y tiempo', () => {
    const deltas: BeliefDelta[] = [receive(T0, 20)]
    for (let d = 0; d < 10; d++) deltas.push(sell(T0 + d * DAY + 3600_000, 1))
    const s = foldDeltas(emptyBelief(), deltas)
    const b = beliefAt(s, T0 + 10 * DAY)
    expect(b.anchored).toBe(false)
    expect(b.flags).toContain('never_observed')
    expect(confidenceLevelOf(b)).toBe('unknown')
    expect(b.mu).toBeCloseTo(10, 6)
    expect(b.dailyUsage).toBeGreaterThan(0.5) // ~1 kg/día, sesgo corregido
    expect(b.dailyUsage).toBeLessThan(1.5)
  })

  it('A. una vez anclado, la incertidumbre crece con el tiempo sin contar', () => {
    const base: BeliefDelta[] = [count(T0, 30)]
    for (let d = 0; d < 14; d++) base.push(sell(T0 + d * DAY + 7200_000, 2))
    const s = foldDeltas(emptyBelief(), base)
    const at2 = beliefAt(s, T0 + 14 * DAY).sigma
    const at10 = beliefAt(s, T0 + 30 * DAY).sigma
    expect(at10).toBeGreaterThan(at2)
  })

  it('B. venta imposible: μ queda negativo y se marca (no se recorta a 0)', () => {
    const s = foldDeltas(emptyBelief(), [count(T0, 2), sell(T0 + 1000, 5)])
    const b = beliefAt(s, T0 + 2000)
    expect(b.mu).toBeCloseTo(-3, 6)
    expect(b.flags).toContain('negative_estimate')
  })

  it('D. un conteo tardío se ubica en su momento: re-proyectar en orden de ocurrencia da 6, no 10', () => {
    // El proyector ordena por occurredAt; acá se simula ese orden.
    const yesterday = T0 - DAY
    const ordered = [count(yesterday, 10), sell(T0, 4)].sort((a, b) => a.at - b.at)
    const b = beliefAt(foldDeltas(emptyBelief(), ordered), T0 + 1000)
    expect(b.mu).toBeCloseTo(6, 6)
    expect(b.lastObservedAt).toBe(new Date(yesterday).toISOString())
  })

  it('un conteo se COMBINA con la estimación (no la reemplaza) y detecta discrepancias', () => {
    // Línea base pesada (±1 kg) + 20 días de ventas teóricas → el conteo con
    // balanza manda y la diferencia de 6 kg (>2,5σ) es discrepancia.
    // (Con una línea base VISUAL de ±4 kg, 6 kg estaría dentro de lo esperable
    // y correctamente NO se marcaría: ver el caso siguiente.)
    const deltas: BeliefDelta[] = [count(T0, 50, 'manual_scale')]
    for (let d = 0; d < 20; d++) deltas.push(sell(T0 + d * DAY + 3600_000, 2))
    const before = foldDeltas(emptyBelief(), deltas)
    const after = foldDeltas(before, [count(T0 + 21 * DAY, 4, 'manual_scale')])
    const b = beliefAt(after, T0 + 21 * DAY)
    expect(b.mu).toBeGreaterThan(3)
    expect(b.mu).toBeLessThan(10) // pegado al conteo, no a 10 (=50−40)
    expect(b.sigma).toBeLessThan(beliefAt(before, T0 + 21 * DAY).sigma)
    expect(b.lastDiscrepancy).not.toBeNull()
    expect(b.lastDiscrepancy!.difference).toBeCloseTo(-6, 0)
    expect(b.flags).toContain('discrepancy')
  })

  it('una diferencia explicable por la incertidumbre NO se marca como discrepancia', () => {
    const deltas: BeliefDelta[] = [count(T0, 50, 'visual_count')]
    for (let d = 0; d < 20; d++) deltas.push(sell(T0 + d * DAY + 3600_000, 2))
    const b = beliefAt(foldDeltas(emptyBelief(), [...deltas, count(T0 + 21 * DAY, 4, 'manual_scale')]), T0 + 21 * DAY)
    expect(b.lastDiscrepancy).toBeNull()
    expect(b.mu).toBeLessThan(5)
  })

  it('costo promedio ponderado con las recepciones', () => {
    const s = foldDeltas(emptyBelief(), [count(T0, 0), receive(T0 + 1, 10, 1000), receive(T0 + 2, 10, 2000)])
    expect(beliefAt(s, T0 + 3).avgUnitCostCents).toBe(1500)
  })

  it('day-start hook: retomar desde un snapshot da el mismo resultado que el fold completo', () => {
    const deltas: BeliefDelta[] = [count(T0, 40)]
    for (let d = 0; d < 6; d++) deltas.push(sell(T0 + d * DAY + 3600_000, 3), receive(T0 + d * DAY + 7200_000, 1, 500))
    const snaps = new Map<number, ReturnType<typeof emptyBelief>>()
    const full = foldDeltas(emptyBelief(), deltas, P, (idx, st) => snaps.set(idx, st))
    const snap = [...snaps.values()][2]
    // El snapshot tiene asOf = inicio del día: se re-aplican solo los eventos posteriores.
    const resumed = foldDeltas(snap, deltas.filter((d) => d.at >= (snap.asOf ?? 0)))
    expect(resumed.mu).toBeCloseTo(full.mu, 6)
    expect(resumed.variance).toBeCloseTo(full.variance, 6)
  })
})

describe('Consumo por plato — unidades, variantes y modificadores', () => {
  const skus = new Map<string, SkuUnitInfo>([
    ['carne', { canonicalUnit: 'kg', name: 'Carne' }],
    ['queso', { canonicalUnit: 'kg', name: 'Queso' }],
    ['cebolla', { canonicalUnit: 'kg', name: 'Cebolla' }],
    ['pan', { canonicalUnit: 'unit', name: 'Pan' }],
  ])

  it('C. receta en gramos contra insumo en kg: 300 g = 0,3 kg (no 300 kg)', () => {
    const r = explodeSaleLine({
      portions: 1,
      recipe: { id: 'r1', version: 1, items: [{ skuId: 'carne', quantity: 300, unit: 'g' }] },
      modifiers: [], rules: [], skus, storageLocationId: 'dep',
    })
    expect(r.consumption).toEqual([{ skuId: 'carne', storageLocationId: 'dep', quantity: 0.3, unit: 'kg' }])
  })

  it('unidad de otra dimensión: se rechaza con warning, nunca 1:1', () => {
    expect(convertQuantity(2, 'unit', 'kg')).toBeNull()
    const r = explodeSaleLine({
      portions: 1,
      recipe: { id: 'r1', version: 1, items: [{ skuId: 'carne', quantity: 1, unit: 'unit' }] },
      modifiers: [], rules: [], skus, storageLocationId: 'dep',
    })
    expect(r.consumption).toHaveLength(0)
    expect(r.warnings[0]).toMatch(/no se puede convertir/)
  })

  it('modificadores: "Extra queso" suma, "Sin cebolla" resta; nunca queda negativo', () => {
    const modifiers = flattenModifiers([
      { groupName: 'Agregados', selectedOptions: [{ name: 'Extra Queso' }] },
      { groupName: 'Quitar', selectedOptions: [{ name: 'sin cebolla' }] },
    ])
    const r = explodeSaleLine({
      portions: 2,
      recipe: { id: 'r1', version: 3, items: [{ skuId: 'cebolla', quantity: 20, unit: 'g' }, { skuId: 'pan', quantity: 1, unit: 'unit' }] },
      modifiers,
      rules: [
        { optionName: 'extra queso', groupName: null, items: [{ skuId: 'queso', quantity: 30, unit: 'g' }] },
        { optionName: 'Sin Cebolla', groupName: null, items: [{ skuId: 'cebolla', quantity: -20, unit: 'g' }] },
      ],
      skus, storageLocationId: 'dep',
    })
    const bySku = Object.fromEntries(r.consumption.map((c) => [c.skuId, c.quantity]))
    expect(bySku).toEqual({ pan: 2, queso: 0.06 })
  })

  it('plato sin receta: venta registrada como "sin receta", sin inventar consumo', () => {
    const r = explodeSaleLine({ portions: 1, recipe: null, modifiers: [], rules: [], skus, storageLocationId: 'dep' })
    expect(r.unmapped).toBe(true)
    expect(r.consumption).toHaveLength(0)
  })
})

describe('Reconciliación de ventas — idempotente por línea', () => {
  const line = (lineId: string, portions: number) => ({ lineId, menuItemId: 'm1', name: 'Bife', variantName: null, modifierLabels: [], portions })
  const recordedEvent = (lineId: string, portions: number, qty: number) => ({
    payload: { lineId, menuItemId: 'm1', name: 'Bife', portions, consumption: [{ skuId: 'carne', storageLocationId: 'dep', quantity: qty, unit: 'kg' as const }] },
  })

  it('C. reintentar la misma venta no duplica: sin diferencia, sin eventos', () => {
    const recorded = summarizeRecorded([recordedEvent('l1', 1, 0.3)])
    expect(planSaleCorrections([line('l1', 1)], recorded, false)).toEqual([])
  })

  it('ronda agregada y cantidad aumentada: solo se registra la diferencia', () => {
    const recorded = summarizeRecorded([recordedEvent('l1', 1, 0.3)])
    const plan = planSaleCorrections([line('l1', 3), line('l2', 1)], recorded, false)
    expect(plan.map((c) => [c.lineId, c.kind, c.portions, c.reason, c.sequence])).toEqual([
      ['l1', 'consume', 2, 'quantity_changed', 1],
      ['l2', 'consume', 1, 'sold', 0],
    ])
  })

  it('cancelación: devuelve EXACTAMENTE lo descontado, con id determinístico', () => {
    const recorded = summarizeRecorded([recordedEvent('l1', 2, 0.6)])
    const plan = planSaleCorrections([line('l1', 0)], recorded, true)
    expect(plan).toHaveLength(1)
    const c = plan[0]
    expect(c.kind).toBe('revert')
    expect(c.reason).toBe('cancelled')
    if (c.kind === 'revert') expect(c.consumption).toEqual([{ skuId: 'carne', storageLocationId: 'dep', quantity: -0.6, unit: 'kg' }])
    expect(saleEventId('o1', 'l1', c.sequence)).toBe('sale:o1:l1:1')
  })

  it('línea quitada de la orden (ya no figura): se revierte', () => {
    const recorded = summarizeRecorded([recordedEvent('l1', 1, 0.3)])
    const plan = planSaleCorrections([], recorded, false)
    expect(plan[0]).toMatchObject({ kind: 'revert', reason: 'removed', portions: -1 })
  })
})

describe('Ledger → agregado', () => {
  it('un SaleRecorded solo afecta a los insumos de su consumo', () => {
    const ev = {
      eventType: 'SaleRecorded', occurredAt: new Date(T0),
      payload: { consumption: [{ skuId: 'a', storageLocationId: 'd', quantity: 0.3 }, { skuId: 'b', storageLocationId: 'd', quantity: 1 }] },
    }
    expect(deltasForAggregate(ev, 'a', 'd')).toHaveLength(1)
    expect(deltasForAggregate(ev, 'c', 'd')).toHaveLength(0)
  })
})

describe('Prioridades — en pesos, comparables y explicables', () => {
  const beliefOf = (deltas: BeliefDelta[], at: number) => beliefAt(foldDeltas(emptyBelief(), deltas), at)

  it('A. con ventas y costo, el valor en riesgo es > 0 (antes: siempre 0)', () => {
    const deltas: BeliefDelta[] = [count(T0, 20)]
    for (let d = 0; d < 7; d++) deltas.push(sell(T0 + d * DAY + 3600_000, 2))
    const p = computePriority({
      skuId: 's', storageLocationId: 'd', name: 'Carne', unit: 'kg', businessImpact: 'high', parLevel: null,
      referenceUnitCostCents: 900_000, belief: beliefOf(deltas, T0 + 7 * DAY),
    }, 10)
    expect(p.valueAtRiskCents).toBeGreaterThan(0)
    expect(p.interruptionCostCents).toBeGreaterThan(0)
  })

  it('el costo de interrumpir sube en hora pico: el mismo insumo puede no entrar a las 21', () => {
    const b = beliefOf([count(T0, 10), sell(T0 + 1, 1)], T0 + 2)
    const input = { skuId: 's', storageLocationId: 'd', name: 'Sal', unit: 'kg', businessImpact: 'low' as const, parLevel: null, referenceUnitCostCents: 10_000, belief: b }
    expect(computePriority(input, 16).interruptionCostCents).toBeLessThan(computePriority(input, 21).interruptionCostCents)
  })

  it('nunca contado + caro → primero en la lista, con motivo en lenguaje operativo', () => {
    const neverCounted = beliefOf([receive(T0, 10), sell(T0 + DAY, 2)], T0 + 2 * DAY)
    const cheapKnown = beliefOf([count(T0, 10)], T0 + 2 * DAY)
    const list = selectVerifications([
      { skuId: 'lomo', storageLocationId: 'd', name: 'Lomo', unit: 'kg', businessImpact: 'critical', parLevel: null, referenceUnitCostCents: 1_500_000, belief: neverCounted },
      { skuId: 'sal', storageLocationId: 'd', name: 'Sal', unit: 'kg', businessImpact: 'low', parLevel: null, referenceUnitCostCents: 5_000, belief: cheapKnown },
    ], 10)
    expect(list[0].skuId).toBe('lomo')
    expect(list[0].reasons[0]).toMatch(/Nunca se contó/)
    expect(list.find((x) => x.skuId === 'sal')).toBeUndefined()
  })

  it('alerta de faltante por límite inferior y stock mínimo', () => {
    const b = beliefOf([count(T0, 3), sell(T0 + 1, 0)], T0 + 2)
    expect(stockAlertOf(b, 5)).toBe('low')
    expect(stockAlertOf(beliefOf([count(T0, 0)], T0 + 1), 5)).toBe('out')
  })
})

describe('G. Onboarding: sugiere INSUMOS, no platos', () => {
  it('reconoce insumos por palabra completa y sin acentos', () => {
    const names = (dish: string) => suggestIngredientsForDish(dish).map((s) => s.ingredient.key).sort()
    expect(names('Milanesa napolitana con papas fritas')).toEqual(
      ['aceite', 'huevo', 'jamon', 'mozzarella', 'nalga', 'pan_rallado', 'papas_congeladas', 'salsa_tomate'].sort(),
    )
    expect(names('Salmón grillado')).toEqual(['salmon'])
    expect(names('Panqueque con dulce de leche')).not.toContain('pan_hamburguesa')
    expect(names('Ensalada César')).toContain('lechuga')
    expect(names('Ensalada César')).not.toContain('Ensalada César')
    expect(names('Plato inventado')).toEqual([])
  })
})
