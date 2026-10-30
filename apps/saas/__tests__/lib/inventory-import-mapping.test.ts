import { describe, it, expect } from 'vitest'
import { guessCategory, guessColumns, mapSheet, normalizeUnit, parseNumber } from '@/lib/inventory/import/mapping'
import { parseCsv } from '@/lib/inventory/import/table'

// Importador de inventario v1 (30/10/2026). Las hojas imitan el export real
// de Fudo › Stock (datos inventados): «Unidad» repetida tres veces, stock
// negativo, platos que Fudo descuenta por receta (sin stock).

const FUDO_HEADERS_INGREDIENTES = ['Id.', 'Categoría', 'Nombre', 'Disponibilidad', 'Unidad', 'Stock', 'Unidad', 'Stock Mínimo', 'Unidad', 'Proveedor']
const FUDO_HEADERS_PRODUCTOS = ['Id.', 'Categoría', 'Código', 'Nombre', 'Disponibilidad', 'Unidad', 'Stock', 'Unidad', 'Stock Mínimo', 'Unidad', 'Proveedor']

describe('normalización', () => {
  it('números en formato argentino', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5)
    expect(parseNumber('1,5')).toBe(1.5)
    expect(parseNumber('$ 1.200')).toBe(1200)
    expect(parseNumber('0.235')).toBe(0.235)
    expect(parseNumber(-3)).toBe(-3)
    expect(parseNumber('n/d')).toBeNull()
  })

  it('unidades de distintos sistemas', () => {
    expect(normalizeUnit('Kgs')).toBe('kg')
    expect(normalizeUnit('unid.')).toBe('unit')
    expect(normalizeUnit('Lts')).toBe('l')
    expect(normalizeUnit('cc')).toBe('ml')
    expect(normalizeUnit('GR')).toBe('g')
    expect(normalizeUnit('bulto')).toBeNull()
  })

  it('categoría de insumo sugerida', () => {
    expect(guessCategory('Muzzarella', null)).toBe('dairy')
    expect(guessCategory('Entraña Sous-Vide', '3. Terco')).toBe('meat_poultry')
    expect(guessCategory('Copa de Malbec', 'Vinos')).toBe('beverages')
    expect(guessCategory('Cosa rara', null)).toBe('other')
  })
})

describe('plantilla Fudo', () => {
  it('Ingredientes: unidad por POSICIÓN y stock negativo → 0 con aviso', () => {
    const m = mapSheet({
      name: 'Ingredientes',
      headers: FUDO_HEADERS_INGREDIENTES,
      rows: [
        [5, 'Cafe', 'Cafe', 0.235, 'kg', 0.235, 'kg', null, null, null],
        [6, 'Cafe', 'Te', 0, 'unid.', -1469, 'unid.', 50, 'unid.', null],
      ],
    })
    expect(m.source).toBe('fudo')
    expect(m.rows[0]).toMatchObject({ name: 'Cafe', unit: 'kg', quantity: 0.235, status: 'ok', include: true })
    expect(m.rows[1]).toMatchObject({ name: 'Te', unit: 'unit', quantity: 0, parLevel: 50, status: 'warn' })
    expect(m.rows[1].messages[0]).toMatch(/negativo/)
  })

  it('Productos: los que Fudo descuenta por receta quedan afuera', () => {
    const m = mapSheet({
      name: 'Productos',
      headers: FUDO_HEADERS_PRODUCTOS,
      rows: [
        [821, '8. Pasteleria', null, 'Alfajor de Chocolate', 2, 'unid.', 2, 'unid.', null, null, null],
        [205, '7. Cafeteria', null, 'Café con Leche', 26, 'unid.', null, null, null, null, null],
      ],
    })
    expect(m.rows[0].include).toBe(true)
    expect(m.rows[1]).toMatchObject({ include: false, status: 'skipped' })
    expect(m.notice).toMatch(/stock propio/)
  })
})

describe('archivos genéricos', () => {
  it('reconoce columnas por sinónimos («Stock mínimo» no es el stock)', () => {
    const cols = guessColumns(['Cód.', 'Descripción', 'Rubro', 'UM', 'Existencia', 'Stock mínimo', 'Costo s/IVA', 'Proveedor'])
    expect(cols).toEqual({ code: 0, name: 1, category: 2, unit: 3, quantity: 4, parLevel: 5, cost: 6, supplier: 7 })
  })

  it('CSV con punto y coma, comillas y costo en pesos → centavos', () => {
    const rows = parseCsv('Descripción;UM;Existencia;Costo\n"Harina 000";Kg;"12,5";$ 850\nAceite;Lts;3;2.100\n')
    const m = mapSheet({ name: 'export', headers: rows[0].map(String), rows: rows.slice(1) })
    expect(m.rows[0]).toMatchObject({ name: 'Harina 000', unit: 'kg', quantity: 12.5, costCents: 85000, category: 'dry_goods' })
    expect(m.rows[1]).toMatchObject({ name: 'Aceite', unit: 'l', quantity: 3, costCents: 210000 })
  })

  it('un reporte de VENTAS no se importa como stock', () => {
    const m = mapSheet({
      name: 'Detalle',
      headers: ['Fecha', 'Categoría', 'Sub categoría', 'Producto', 'Cantidades vendidas', 'Monto total'],
      rows: [['2026-10-30', 'Cafetería', 'Cafetería', 'Flat White', 8, 48000]],
    })
    expect(m.kind).toBe('sales')
    expect(m.rows.every((r) => !r.include)).toBe(true)
  })

  it('texto que empieza como fórmula queda como texto plano; repetidos y sin nombre afuera', () => {
    const m = mapSheet({
      name: 'x',
      headers: ['Nombre', 'Stock', 'Unidad'],
      rows: [['=HYPERLINK("x")Tomate', 3, 'kg'], ['tomate', 1, 'kg'], [null, 2, 'kg']],
    })
    expect(m.rows[0].name.startsWith('=')).toBe(false)
    expect(m.rows[1]).toMatchObject({ include: true })
    expect(m.rows[2]).toMatchObject({ include: false, status: 'error' })
  })
})
