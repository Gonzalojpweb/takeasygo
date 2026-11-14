// ============================================================================
// Guía en vivo del inventario (lib/inventory/coach/rules.ts)
// ============================================================================
// Caso real: La Pescería, 13/11/2026. Receta «Mejillones rebozados» con 20
// mejillones por plato, venta antes del primer conteo, la misma compra
// registrada dos veces y un conteo de 12 cuando el sistema esperaba 20.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { buildCoach, portionsFor, suspiciousPortion, convert, type CoachInput, type CoachSku, type CoachDish } from '@/lib/inventory/coach/rules'

const can = { recipes: true, capture: true, manage: true }

function sku(p: Partial<CoachSku> & { id: string; name: string }): CoachSku {
  return { category: 'other', unit: 'unit', hasCost: true, isActive: true, usedInRecipes: true, stock: null, ...p }
}
function dish(p: Partial<CoachDish> & { menuItemId: string; name: string }): CoachDish {
  return { soldLast30d: 0, coverage: 'no_recipe', pendingVariants: [], recipe: null, isAvailable: true, pausedReason: null, stockPortions: null, ...p }
}
function input(p: Partial<CoachInput>): CoachInput {
  return {
    locationName: 'Centro',
    status: 'preparing',
    dishes: [],
    skus: [],
    receipts: [],
    counts: [],
    unmappedPortions: 0,
    totals: { receipts: 0, counts: 0, wastes: 0 },
    can,
    ...p,
  }
}

describe('utilidades', () => {
  it('convierte dentro de la misma familia y no entre familias', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500)
    expect(convert(250, 'ml', 'l')).toBe(0.25)
    expect(convert(3, 'unit', 'g')).toBeNull()
  })

  it('detecta cantidades por porción que parecen error', () => {
    expect(suspiciousPortion({ quantity: 20, unit: 'unit' })?.kind).toBe('too_many_units')
    expect(suspiciousPortion({ quantity: 2, unit: 'kg' })?.kind).toBe('too_heavy')
    expect(suspiciousPortion({ quantity: 0.2, unit: 'g' })?.kind).toBe('too_light')
    expect(suspiciousPortion({ quantity: 1.5, unit: 'l' })?.kind).toBe('too_much_liquid')
    expect(suspiciousPortion({ quantity: 180, unit: 'g' })).toBeNull()
    expect(suspiciousPortion({ quantity: 8, unit: 'unit' })).toBeNull()
  })

  it('calcula los platos que alcanzan y el insumo que limita', () => {
    const skus = new Map([
      ['m', sku({ id: 'm', name: 'Mejillones', stock: { qty: 12, counted: true } })],
      ['h', sku({ id: 'h', name: 'Harina', unit: 'kg', stock: { qty: 2, counted: true } })],
    ])
    const r = portionsFor([{ skuId: 'm', skuName: 'Mejillones', quantity: 4, unit: 'unit' }, { skuId: 'h', skuName: 'Harina', quantity: 100, unit: 'g' }], skus)
    expect(r.portions).toBe(3)
    expect(r.limiting?.sku.id).toBe('m')
  })

  it('sin conteo el stock es desconocido', () => {
    const skus = new Map([['m', sku({ id: 'm', name: 'Mejillones', stock: { qty: -20, counted: false } })]])
    expect(portionsFor([{ skuId: 'm', skuName: 'Mejillones', quantity: 4, unit: 'unit' }], skus).portions).toBeNull()
  })
})

describe('caso La Pescería', () => {
  const mejillones = sku({ id: 'mej', name: 'MEJILLONES', category: 'fish_seafood', stock: { qty: 12, counted: true } })
  const rebozados = dish({
    menuItemId: 'd1',
    name: 'Mejillones rebozados',
    soldLast30d: 1,
    coverage: 'controlled',
    recipe: [{ skuId: 'mej', skuName: 'MEJILLONES', quantity: 20, unit: 'unit' }],
    isAvailable: false,
    pausedReason: 'stock',
    stockPortions: 0,
  })
  const base = input({
    status: 'active',
    dishes: [rebozados, dish({ menuItemId: 'd2', name: 'Boquerones a la provenzal' })],
    skus: [mejillones],
    receipts: [
      { skuId: 'mej', quantity: 20, at: '2026-11-13T21:16:38.140Z' },
      { skuId: 'mej', quantity: 20, at: '2026-11-13T21:15:47.733Z' },
    ],
    counts: [{ skuId: 'mej', observed: 12, expected: 20, at: '2026-11-13T21:16:57.052Z' }],
    totals: { receipts: 2, counts: 1, wastes: 0 },
  })
  const coach = buildCoach(base)

  it('explica por qué el plato aparece «Sin inventario», con los números', () => {
    const f = coach.findings.find((x) => x.id === 'short:d1')!
    expect(f.level).toBe('stop')
    expect(f.what).toContain('20 unidades de MEJILLONES por plato')
    expect(f.what).toContain('hay 12 unidades')
    // 20 por plato es raro: sugiere revisar que sea UNA porción.
    expect(f.fix[0]).toContain('UN plato')
    expect(f.actions.map((a) => a.action.type)).toEqual(['recipe', 'receive', 'count'])
  })

  it('avisa la compra registrada dos veces', () => {
    const f = coach.findings.find((x) => x.id.startsWith('dup:mej:'))!
    expect(f.level).toBe('warn')
    expect(f.what).toContain('1 minuto')
  })

  it('relaciona el conteo que no cerró con la compra duplicada', () => {
    const f = coach.findings.find((x) => x.id.startsWith('gap:mej:'))!
    expect(f.title).toContain('Contaste 12 unidades')
    expect(f.title).toContain('esperaba 20 unidades')
    expect(f.fix[0]).toContain('registrada dos veces')
  })

  it('el primer paso es resolver el bloqueo', () => {
    expect(coach.next.title).toBe('Primero, resolvé esto')
    expect(coach.findings[0].level).toBe('stop')
    expect(coach.counts.stop).toBeGreaterThan(0)
  })

  it('stock negativo por vender antes de contar', () => {
    const c = buildCoach({ ...base, skus: [{ ...mejillones, stock: { qty: -20, counted: false } }], counts: [] })
    const f = c.findings.find((x) => x.id === 'neg:mej')!
    expect(f.what).toContain('antes de contarlo')
    expect(c.findings.some((x) => x.id === 'active-uncounted')).toBe(true)
  })

  it('un «ya lo vi» no tapa el mismo problema con otros números', () => {
    const otra = buildCoach({ ...base, skus: [{ ...mejillones, stock: { qty: 5, counted: true } }] })
    const a = coach.findings.find((x) => x.id === 'short:d1')!
    const b = otra.findings.find((x) => x.id === 'short:d1')!
    expect(a.fingerprint).not.toBe(b.fingerprint)
  })
})

describe('recorrido', () => {
  it('sede sin inventario: etapa 1 y botón para preparar', () => {
    const c = buildCoach(input({ status: 'off', dishes: [dish({ menuItemId: 'a', name: 'Milanesa', soldLast30d: 40 })] }))
    expect(c.current).toBe('prepare')
    expect(c.stages[0].state).toBe('current')
    expect(c.next.action).toEqual({ type: 'setup' })
  })

  it('en preparación sin recetas: propone el plato más vendido', () => {
    const c = buildCoach(input({
      dishes: [dish({ menuItemId: 'a', name: 'Milanesa', soldLast30d: 40 }), dish({ menuItemId: 'b', name: 'Flan', soldLast30d: 90 })],
    }))
    expect(c.current).toBe('recipes')
    expect(c.next.title).toBe('Cargá la receta de Flan')
    expect(c.starDishes[0].name).toBe('Flan')
  })

  it('con recetas y sin conteo: pide contar', () => {
    const c = buildCoach(input({
      dishes: [dish({ menuItemId: 'a', name: 'Milanesa', soldLast30d: 40, coverage: 'needs_counts', recipe: [{ skuId: 'n', skuName: 'Nalga', quantity: 200, unit: 'g' }] })],
      skus: [sku({ id: 'n', name: 'Nalga', unit: 'kg' })],
    }))
    expect(c.current).toBe('count')
    expect(c.next.title).toBe('Contá Nalga')
  })

  it('todo listo en preparación: toca activar', () => {
    const c = buildCoach(input({
      dishes: [dish({ menuItemId: 'a', name: 'Milanesa', soldLast30d: 40, coverage: 'controlled', recipe: [{ skuId: 'n', skuName: 'Nalga', quantity: 200, unit: 'g' }] })],
      skus: [sku({ id: 'n', name: 'Nalga', unit: 'kg', stock: { qty: 5, counted: true } })],
    }))
    expect(c.current).toBe('activate')
    expect(c.findings.find((f) => f.level === 'win')).toBeTruthy()
  })

  it('una cantidad rara se avisa aunque haya stock', () => {
    const c = buildCoach(input({
      dishes: [dish({ menuItemId: 'a', name: 'Ñoquis', coverage: 'controlled', recipe: [{ skuId: 's', skuName: 'Salsa', quantity: 2, unit: 'kg' }] })],
      skus: [sku({ id: 's', name: 'Salsa', unit: 'kg', stock: { qty: 50, counted: true } })],
    }))
    expect(c.findings.some((f) => f.id === 'odd:a:s')).toBe(true)
  })
})
