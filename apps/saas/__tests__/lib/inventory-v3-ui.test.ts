// ============================================================================
// inventory-v3-ui.test.ts — lógica de interacción y accesibilidad de V3
// ============================================================================
// La lógica de la UI vive en funciones puras (lib/inventory/ui): se prueba
// sin navegador. La accesibilidad se verifica renderizando los componentes
// base a HTML (react-dom/server): etiquetas asociadas, roles, aria-*.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseDecimal, parsePesosToCents, compatibleUnits } from '@/lib/inventory/ui/fields'
import { estimateText, formatDelta, formatQty } from '@/lib/inventory/ui/format'
import { productState, needsAttention } from '@/lib/inventory/ui/product-status'
import {
  addLine,
  emptySession,
  markResult,
  markSending,
  receiptBody,
  removeLine,
  sendableLines,
  summarize,
  updateLine,
  validateLine,
} from '@/lib/inventory/ui/receive-session'
import { addRow, copyFromBase, draftFrom, draftPayload, isDirty, validateDraft } from '@/lib/inventory/ui/recipe-draft'
import { ErrorBlock, Field, FilterChip, LoadingBlock, SearchPicker, StatusTag } from '@/components/admin/inventory-v3/ui'

const carne = { _id: 'sku-carne', name: 'Carne', canonicalUnit: 'kg', lastPack: { label: 'caja', quantity: 6, unit: 'kg' } }
const pan = { _id: 'sku-pan', name: 'Pan', canonicalUnit: 'unit' }

describe('campos: números como los escribe una persona', () => {
  it('decimales con coma, punto o miles', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('1.5')).toBe(1.5)
    expect(parseDecimal(' 2 ')).toBe(2)
    expect(parseDecimal('1.250,5')).toBe(1250.5)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
  it('pesos a centavos', () => {
    expect(parsePesosToCents('54.000')).toBe(5_400_000)
    expect(parsePesosToCents('$ 54000,50')).toBe(5_400_050)
    expect(parsePesosToCents('1.250.000')).toBe(125_000_000)
    expect(parsePesosToCents('-3')).toBeNull()
  })
  it('unidades compatibles por dimensión', () => {
    expect(compatibleUnits('kg')).toEqual(['kg', 'g'])
    expect(compatibleUnits('ml')).toEqual(['l', 'ml'])
    expect(compatibleUnits('unit')).toEqual(['unit'])
  })
})

describe('formatos: una estimación nunca es un número exacto', () => {
  it('sin conteo, faltante y rango solo si importa', () => {
    expect(estimateText({ mu: 5, sigma: 0, anchored: false }, 'kg')).toEqual({ main: 'Sin conteo inicial', range: null })
    expect(estimateText({ mu: -0.3, sigma: 0.1, anchored: true }, 'kg').main).toMatch(/^Faltante: −0,3 kg$/)
    expect(estimateText({ mu: 12, sigma: 0.01, anchored: true }, 'kg')).toEqual({ main: '≈ 12 kg', range: null })
    const wide = estimateText({ mu: 12, sigma: 1, anchored: true }, 'kg')
    expect(wide.main).toBe('≈ 12 kg')
    expect(wide.range).toMatch(/^entre 10,4 y 13,6 kg$/)
  })
  it('cantidades y movimientos', () => {
    expect(formatQty(1250, 'g')).toBe('1.250 g')
    expect(formatDelta(5, 'kg')).toBe('+5 kg')
    expect(formatDelta(-0.15, 'kg')).toBe('−0,15 kg')
  })
})

describe('estado de producto: sin datos ≠ sin stock ≠ negativo', () => {
  const base = { stockAlert: null as 'out' | 'low' | null, confidence: 'high' }
  it('tres estados distintos con texto propio', () => {
    const noData = productState({ ...base, belief: { anchored: false, mu: 0, flags: ['never_observed'] } })
    const out = productState({ ...base, stockAlert: 'out', belief: { anchored: true, mu: 0, flags: [] } })
    const neg = productState({ ...base, belief: { anchored: true, mu: -1, flags: ['negative_estimate'] } })
    expect([noData.state, out.state, neg.state]).toEqual(['no_data', 'out', 'negative'])
    expect(new Set([noData.label, out.label, neg.label]).size).toBe(3)
    expect(neg.rank).toBeLessThan(out.rank)
  })
  it('incierto pide contar; confiable no pide nada', () => {
    expect(productState({ ...base, confidence: 'critical', belief: { anchored: true, mu: 3, flags: [] } }).state).toBe('uncertain')
    const ok = productState({ ...base, belief: { anchored: true, mu: 3, flags: [] } })
    expect(ok.state).toBe('ok')
    expect(needsAttention(ok)).toBe(false)
  })
})

describe('sesión de recepción: no atómica, resultados por línea, reintento idempotente', () => {
  it('agrega con la presentación habitual y no duplica el insumo', () => {
    let s = addLine(emptySession(), carne)
    s = addLine(s, carne)
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]).toMatchObject({ byPack: true, packLabel: 'caja', packSize: '6', packUnit: 'kg' })
  })

  it('valida por campo y conserva lo cargado', () => {
    let s = addLine(addLine(emptySession(), carne), pan)
    const [c, p] = s.lines
    expect(validateLine(c, { allowCost: true })).toHaveProperty('quantity')
    s = updateLine(s, c.key, { quantity: '2', total: 'abc' })
    expect(validateLine(s.lines[0], { allowCost: true })).toEqual({ total: 'Monto inválido' })
    expect(validateLine(s.lines[0], { allowCost: false })).toEqual({})
    s = updateLine(s, p.key, { quantity: '24' })
    expect(sendableLines(s, { allowCost: false }).map((l) => l.sku.name)).toEqual(['Carne', 'Pan'])
  })

  it('resultado parcial: lo registrado queda registrado; el reintento reenvía solo lo fallido con el MISMO id', () => {
    let s = addLine(addLine(emptySession(), carne), pan)
    s = updateLine(s, s.lines[0].key, { quantity: '2' })
    s = updateLine(s, s.lines[1].key, { quantity: '24' })
    const [c, p] = s.lines
    s = markSending(s, [c.key, p.key])
    s = markResult(s, c.key, { ok: true, result: { quantity: 12, unit: 'kg', unitCostCents: null, duplicate: false } })
    s = markResult(s, p.key, { ok: false, error: 'Sin conexión' })
    expect(summarize(s)).toMatchObject({ done: 1, failed: 1 })

    const retry = sendableLines(s, { allowCost: false })
    expect(retry.map((l) => l.sku.name)).toEqual(['Pan'])
    expect(retry[0].clientEventId).toBe(p.clientEventId)
    expect(retry[0].quantity).toBe('24') // lo cargado no se perdió

    // Una línea registrada no se edita ni se quita.
    s = updateLine(s, c.key, { quantity: '99' })
    s = removeLine(s, c.key)
    expect(s.lines.find((l) => l.key === c.key)?.quantity).toBe('2')
  })

  it('el cuerpo omite el costo si el rol no ve costos', () => {
    let s = addLine(emptySession(), pan)
    s = updateLine(s, s.lines[0].key, { quantity: '10', total: '5000' })
    expect(receiptBody(s, s.lines[0], 'st-1', { allowCost: false })).not.toHaveProperty('totalCostCents')
    expect(receiptBody(s, s.lines[0], 'st-1', { allowCost: true })).toMatchObject({ totalCostCents: 500_000, quantity: 10, unit: 'unit' })
  })
})

describe('borrador de receta', () => {
  const skus = new Map([
    [carne._id, carne],
    [pan._id, pan],
  ])
  const dish = { menuItemId: 'm1', name: 'Hamburguesa' }

  it('errores por fila, sin insumos y unidades incompatibles', () => {
    let d = draftFrom(dish, null, null)
    expect(validateDraft(d, skus, { baseExists: false }).form).toMatch(/al menos un insumo/)
    d = addRow(d, carne)
    expect(d.rows[0].unit).toBe('g') // por porción se piensa en gramos
    let v = validateDraft(d, skus, { baseExists: false })
    expect(v.rows[d.rows[0].key]).toHaveProperty('quantity')
    d = { ...d, rows: [{ ...d.rows[0], quantity: '150', unit: 'unit' }] }
    v = validateDraft(d, skus, { baseExists: false })
    expect(v.rows[d.rows[0].key]).toHaveProperty('unit')
  })

  it('variante "igual a la base" exige base; "partir de la base" copia sin multiplicar', () => {
    const variant = { ...draftFrom(dish, 'Doble', null), mode: 'same_as_base' as const }
    expect(validateDraft(variant, skus, { baseExists: false }).valid).toBe(false)
    expect(validateDraft(variant, skus, { baseExists: true }).valid).toBe(true)
    expect(draftPayload(variant, 'loc')).toMatchObject({ usesBaseRecipe: true, items: [], variantName: 'Doble', name: 'Hamburguesa (Doble)' })

    const copied = copyFromBase(draftFrom(dish, 'Doble', null), [{ skuId: carne._id, quantity: 150, unit: 'g' }])
    expect(copied.rows[0].quantity).toBe('150') // no asume "doble = 2×"
    expect(copied.mode).toBe('own')
  })

  it('detecta cambios sin guardar', () => {
    const original = draftFrom(dish, null, { items: [{ skuId: carne._id, quantity: 150, unit: 'g' }] })
    expect(isDirty(original, original)).toBe(false)
    expect(isDirty({ ...original, rows: [{ ...original.rows[0], quantity: '160' }] }, original)).toBe(true)
  })
})

describe('accesibilidad de las piezas base (HTML renderizado)', () => {
  it('Field asocia label, control y error (aria-invalid + aria-describedby)', () => {
    const html = renderToStaticMarkup(
      h(Field, { label: 'Cantidad', error: 'Indicá cuánto llegó', children: (a: Record<string, unknown>) => h('input', a) }),
    )
    const id = /<label for="([^"]+)"/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}"`)
    expect(html).toContain('aria-invalid="true"')
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1]
    expect(html).toContain(`id="${described}"`)
    expect(html).toContain('Indicá cuánto llegó')
  })

  it('estados de vista: carga anunciada, error con alerta y reintento', () => {
    const loading = renderToStaticMarkup(h(LoadingBlock, { label: 'Cargando productos' }))
    expect(loading).toContain('role="status"')
    expect(loading).toContain('aria-busy="true"')
    expect(loading).toContain('Cargando productos')
    const error = renderToStaticMarkup(h(ErrorBlock, { error: { message: 'Sin conexión', code: null, status: 0, network: true }, onRetry: () => {}, what: 'los productos' }))
    expect(error).toContain('role="alert"')
    expect(error).toContain('Reintentar')
  })

  it('estado con texto (nunca solo color) y filtros conmutables', () => {
    expect(renderToStaticMarkup(h(StatusTag, { tone: 'danger', children: 'Sin stock' }))).toContain('Sin stock')
    const chip = renderToStaticMarkup(h(FilterChip, { active: true, onClick: () => {}, children: 'Atención' }))
    expect(chip).toContain('aria-pressed="true"')
    expect(chip).toMatch(/min-h-11/) // área táctil ≥ 44 px
  })

  it('selector de insumos: combobox con label y listbox asociado', () => {
    const html = renderToStaticMarkup(h(SearchPicker, { label: 'Agregar insumo', items: [{ id: 'a', label: 'Carne' }], onPick: () => {} }))
    expect(html).toContain('role="combobox"')
    expect(html).toMatch(/aria-controls="[^"]+-list"/)
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Agregar insumo<\/label>/)
  })
})

describe('filas de modificadores (pueden restar)', () => {
  it('negativo válido en modificadores; 0 nunca', async () => {
    const { validateRows } = await import('@/lib/inventory/ui/recipe-draft')
    const skus = new Map([['q', { _id: 'q', name: 'Queso', canonicalUnit: 'kg' }]])
    const rows = [
      { key: 'a', skuId: 'q', quantity: '-20', unit: 'g' },
      { key: 'b', skuId: 'q', quantity: '0', unit: 'g' },
    ]
    const withNeg = validateRows(rows, skus, { allowNegative: true })
    expect(withNeg.a).toBeUndefined()
    expect(withNeg.b).toHaveProperty('quantity')
    expect(validateRows(rows, skus, { allowNegative: false }).a).toHaveProperty('quantity')
  })
})

describe('InventoryV3: primer render de cada contexto (sin errores, accesible)', () => {
  const caps = { read: true, capture: true, recipes: true, manage: true }
  const locations = [
    { id: 'l1', name: 'Centro', status: 'active' as const, inventoryActive: true },
    { id: 'l2', name: 'Norte', status: 'preparing' as const, inventoryActive: false },
  ]
  for (const view of ['ahora', 'productos', 'recetas', 'actividad']) {
    it(`vista ${view}`, async () => {
      const { default: InventoryV3 } = await import('@/components/admin/inventory-v3/InventoryV3')
      const html = renderToStaticMarkup(h(InventoryV3, { tenantSlug: 't', capabilities: caps, locations, initialView: view, initialLocationId: 'l1' }))
      expect(html).toContain('<h1')
      expect(html).toContain('role="tablist"')
      expect(html).toContain('aria-label="Contextos de inventario"')
      expect(html).toContain('Recibir mercadería')
      expect(html).toMatch(/role="status"[^>]*aria-busy="true"/) // estado de carga anunciado
    })
  }

  it('sin permisos de gestión no aparecen acciones de gestión ni contextos sin acceso', async () => {
    const { default: InventoryV3 } = await import('@/components/admin/inventory-v3/InventoryV3')
    const html = renderToStaticMarkup(
      h(InventoryV3, { tenantSlug: 't', capabilities: { read: false, capture: true, recipes: false, manage: false }, locations, initialView: 'recetas', initialLocationId: 'l1' }),
    )
    expect(html).not.toContain('Configuración de la sede')
    expect(html).toMatch(/Ahora<\/button>/) // control: así se ve una pestaña
    expect(html).not.toMatch(/Recetas<\/button>/)
    expect(html).not.toMatch(/Actividad<\/button>/)
    expect(html).not.toMatch(/Productos<\/button>/)
  })
})
