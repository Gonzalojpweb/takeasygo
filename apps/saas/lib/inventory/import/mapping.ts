// ============================================================================
// Importador de inventario — mapeo y normalización (puro, sin DB)
// ============================================================================
// De una hoja ya leída (table.ts) a filas de insumo listas para revisar:
//
//   1. Plantilla: si la hoja es un export conocido (Fudo › Stock, hojas
//      «Ingredientes» y «Productos») el mapeo es fijo. Fudo repite el
//      encabezado «Unidad» tres veces: se lee por POSICIÓN (la unidad que
//      sigue a cada cantidad).
//   2. Genérico: cada columna se reconoce por sinónimos («Existencia»,
//      «Rubro», «UM», «Costo s/IVA»…). El admin corrige en la vista previa.
//   3. Normalización: unidades (kg/g/l/ml/unidad), números con coma decimal o
//      «$ 1.200», categoría de insumo sugerida por palabras clave.
//   4. Diagnóstico por fila: ok · revisar · error, con el motivo en criollo.
//
// Nada de esto escribe: la carga real la hace commit.ts con lo que el admin
// confirmó.
// ============================================================================

import { normalizeName } from '@takeasygo/business/inventory'
import type { Cell, ImportSheet } from './table'

export const IMPORT_CATEGORIES = ['meat_poultry', 'fish_seafood', 'vegetables', 'fruits', 'dairy', 'dry_goods', 'beverages', 'packaging', 'other'] as const
export const IMPORT_UNITS = ['kg', 'g', 'l', 'ml', 'unit'] as const
export type ImportCategory = (typeof IMPORT_CATEGORIES)[number]
export type ImportUnit = (typeof IMPORT_UNITS)[number]

export type ImportField = 'name' | 'category' | 'unit' | 'quantity' | 'parLevel' | 'cost' | 'supplier' | 'code'
export type ImportSource = 'fudo' | 'generic'

/** Columna (índice) de cada dato; null = el archivo no lo trae. */
export type ColumnMap = Record<ImportField, number | null>

export type RowStatus = 'ok' | 'warn' | 'error' | 'skipped'

export interface ImportRow {
  /** Identificador estable en la vista previa: «hoja:fila». */
  id: string
  sheet: string
  /** Fila del archivo (1 = encabezado), para que el admin la encuentre. */
  line: number
  include: boolean
  name: string
  category: ImportCategory
  unit: ImportUnit
  /** Stock a cargar como conteo de apertura; null = solo se crea el insumo. */
  quantity: number | null
  parLevel: number | null
  /** Costo por unidad, en centavos; null = el archivo no lo trae. */
  costCents: number | null
  supplier: string | null
  code: string | null
  /** Categoría tal como venía (referencia para el admin). */
  sourceCategory: string | null
  status: RowStatus
  messages: string[]
  /** Insumo existente con el mismo nombre (lo completa la ruta con la DB). */
  match: { skuId: string; name: string; unit: string } | null
}

export interface MappedSheet {
  name: string
  source: ImportSource
  /** stock = inventario; sales = reporte de ventas (no se importa). */
  kind: 'stock' | 'sales'
  /** Aviso para toda la hoja (se muestra arriba de sus filas). */
  notice: string | null
  columns: ColumnMap
  headers: string[]
  rows: ImportRow[]
}

// ── Texto y números ──────────────────────────────────────────────────────────

const key = (s: string) => normalizeName(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** «1.234,5» · «1,5» · «$ 1.200» · «-3» · 0.235 → número; basura → null. */
export function parseNumber(value: Cell): number | null {
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = value.replace(/[$\s]|ARS/gi, '')
  // Un número real nunca es tan largo; el tope acota también las regex.
  if (s.length > 24 || !/\d/.test(s)) return null
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // El último separador es el decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (hasComma) {
    s = s.replace(',', '.')
  } else if (hasDot && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '') // «1.200» es mil doscientos; «0.235» es decimal
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Texto plano y acotado (nunca una fórmula). */
function cleanText(value: Cell, max = 120): string | null {
  if (value === null) return null
  const s = String(value).replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').trim()
  return s ? s.slice(0, max) : null
}

// ── Unidades ─────────────────────────────────────────────────────────────────

const UNIT_WORDS: Record<ImportUnit, string[]> = {
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'k'],
  g: ['g', 'gr', 'grs', 'gramo', 'gramos', 'grm'],
  l: ['l', 'lt', 'lts', 'litro', 'litros', 'ltr'],
  ml: ['ml', 'cc', 'cm3', 'mililitro', 'mililitros'],
  unit: ['u', 'un', 'uni', 'unid', 'unidad', 'unidades', 'ud', 'uds', 'pza', 'pieza', 'piezas', 'porcion', 'porciones', 'c u', 'cu', 'docena'],
}

export function normalizeUnit(value: Cell): ImportUnit | null {
  if (value === null) return null
  const k = key(String(value)).replace(/\s/g, '')
  if (!k) return null
  for (const unit of IMPORT_UNITS) {
    if (UNIT_WORDS[unit].some((w) => w.replace(/\s/g, '') === k)) return unit
  }
  return null
}

// ── Categoría de insumo sugerida ─────────────────────────────────────────────

const CATEGORY_WORDS: [ImportCategory, string[]][] = [
  ['packaging', ['envase', 'bandeja', 'bolsa', 'vaso descartable', 'descartable', 'servilleta', 'film', 'papel aluminio', 'tapa', 'caja pizza', 'packaging', 'sorbete']],
  ['beverages', ['bebida', 'gaseosa', 'agua', 'cerveza', 'vino', 'jugo', 'soda', 'coca', 'sprite', 'fernet', 'aperitivo', 'licor', 'whisky', 'vodka', 'gin', 'champagne', 'espumante', 'tonica', 'energizante', 'malbec', 'cabernet']],
  ['fish_seafood', ['pescado', 'merluza', 'salmon', 'atun', 'besugo', 'langostino', 'camaron', 'calamar', 'mariscos', 'mejillon', 'pulpo', 'trucha', 'abadejo']],
  ['meat_poultry', ['carne', 'pollo', 'cerdo', 'bondiola', 'vacio', 'asado', 'lomo', 'entrana', 'bife', 'nalga', 'peceto', 'chorizo', 'morcilla', 'jamon', 'panceta', 'bacon', 'salame', 'pavo', 'cordero', 'hamburguesa', 'milanesa', 'osobuco', 'gulas', 'matambre']],
  ['dairy', ['leche', 'queso', 'muzzarella', 'mozzarella', 'muzza', 'crema', 'manteca', 'yogur', 'ricota', 'provolone', 'parmesano', 'reggianito', 'dulce de leche', 'huevo', 'huevos']],
  ['fruits', ['fruta', 'manzana', 'banana', 'naranja', 'limon', 'frutilla', 'mango', 'frambuesa', 'pera', 'durazno', 'anana', 'kiwi', 'uva', 'arandano', 'maracuya', 'palta']],
  ['vegetables', ['verdura', 'tomate', 'cebolla', 'papa', 'zanahoria', 'lechuga', 'morron', 'ajo', 'zapallo', 'calabaza', 'berenjena', 'espinaca', 'rucula', 'champinon', 'hongo', 'puerro', 'apio', 'choclo', 'batata', 'perejil', 'albahaca', 'verdeo']],
  ['dry_goods', ['harina', 'azucar', 'arroz', 'fideo', 'pasta', 'cafe', 'te', 'yerba', 'cacao', 'chocolate', 'aceite', 'vinagre', 'sal', 'pimienta', 'especia', 'oregano', 'pan', 'levadura', 'polenta', 'legumbre', 'lenteja', 'garbanzo', 'nuez', 'almendra', 'pistacho', 'avena', 'galletita', 'alfajor', 'croissant', 'medialuna', 'macaron', 'conserva', 'salsa', 'mayonesa', 'ketchup', 'mostaza']],
]

/** Sugerencia por palabras clave en el nombre y en la categoría de origen. */
export function guessCategory(name: string, sourceCategory: string | null): ImportCategory {
  const words = ` ${key(`${name} ${sourceCategory ?? ''}`)} `
  for (const [category, list] of CATEGORY_WORDS) {
    if (list.some((w) => words.includes(` ${w} `) || words.includes(` ${w}s `))) return category
  }
  return 'other'
}

// ── Columnas ─────────────────────────────────────────────────────────────────

const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  name: ['nombre', 'descripcion', 'producto', 'insumo', 'articulo', 'item', 'detalle', 'materia prima', 'ingrediente'],
  category: ['categoria', 'rubro', 'familia', 'grupo', 'subrubro', 'tipo'],
  unit: ['unidad', 'um', 'u m', 'unidad de medida', 'medida', 'unid'],
  quantity: ['stock', 'stock actual', 'existencia', 'existencias', 'cantidad', 'saldo', 'disponible', 'stock fisico', 'cant'],
  parLevel: ['stock minimo', 'minimo', 'stock min', 'punto de pedido', 'punto de reposicion', 'reposicion', 'stock de seguridad'],
  cost: ['costo', 'costo unitario', 'precio costo', 'precio de costo', 'ultimo costo', 'costo s iva', 'costo sin iva', 'p costo', 'costo promedio', 'precio compra'],
  supplier: ['proveedor', 'proveedores', 'proveedor habitual'],
  code: ['codigo', 'cod', 'sku', 'codigo interno', 'cod interno', 'plu'],
}

function headerScore(header: string, field: ImportField): number {
  const h = key(header)
  if (!h) return 0
  let best = 0
  for (const syn of FIELD_SYNONYMS[field]) {
    if (h === syn) best = Math.max(best, 3)
    else if (h.startsWith(`${syn} `) || h.endsWith(` ${syn}`)) best = Math.max(best, 2)
    else if (h.includes(syn) && syn.length >= 4) best = Math.max(best, 1)
  }
  return best
}

/**
 * Reporte de ventas (cantidades vendidas, ingresos, % del total): NO es stock.
 * Sin esta guarda, «Cantidades vendidas» se leería como existencia.
 */
export function isSalesReport(headers: string[]): boolean {
  const h = headers.map(key)
  return h.some((x) => x.includes('vendid') || x.includes('ingresos') || x === 'monto total' || x.includes('del total') || x === 'ventas')
}

/** Mapeo genérico por sinónimos: cada columna se usa una sola vez. */
export function guessColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = { name: null, category: null, unit: null, quantity: null, parLevel: null, cost: null, supplier: null, code: null }
  const used = new Set<number>()
  // Lo más específico primero: «Stock mínimo» no puede quedar como stock.
  const order: ImportField[] = ['parLevel', 'cost', 'supplier', 'code', 'name', 'category', 'quantity', 'unit']
  for (const field of order) {
    let best = -1
    let bestScore = 0
    headers.forEach((h, i) => {
      if (used.has(i)) return
      const s = headerScore(h, field)
      if (s > bestScore) { bestScore = s; best = i }
    })
    if (best >= 0) { map[field] = best; used.add(best) }
  }
  return map
}

/** Export de Fudo › Stock (hojas «Ingredientes» / «Productos»). */
export function fudoColumns(headers: string[]): ColumnMap | null {
  const h = headers.map(key)
  const at = (name: string) => h.indexOf(name)
  const stock = at('stock')
  const name = at('nombre')
  if (at('id') < 0 || name < 0 || at('disponibilidad') < 0 || stock < 0 || h[stock + 1] !== 'unidad') return null
  const min = at('stock minimo')
  const code = at('codigo')
  const supplier = at('proveedor')
  return {
    name,
    category: at('categoria') >= 0 ? at('categoria') : null,
    quantity: stock,
    unit: stock + 1,
    parLevel: min >= 0 ? min : null,
    cost: null,
    supplier: supplier >= 0 ? supplier : null,
    code: code >= 0 ? code : null,
  }
}

// ── Filas ────────────────────────────────────────────────────────────────────

function at(row: Cell[], index: number | null): Cell {
  return index === null ? null : (row[index] ?? null)
}

export function mapSheet(sheet: ImportSheet, override?: ColumnMap): MappedSheet {
  const fudo = override ? null : fudoColumns(sheet.headers)
  const columns = override ?? fudo ?? guessColumns(sheet.headers)
  const source: ImportSource = fudo ? 'fudo' : 'generic'
  const isFudoProducts = source === 'fudo' && key(sheet.name) === 'productos'
  const sales = !override && !fudo && isSalesReport(sheet.headers)
  const seen = new Set<string>()

  const rows = sheet.rows.map((cells, i): ImportRow => {
    const line = i + 2
    const messages: string[] = []
    const name = cleanText(at(cells, columns.name)) ?? ''
    const sourceCategory = cleanText(at(cells, columns.category), 80)
    const rawUnit = at(cells, columns.unit)
    let unit = normalizeUnit(rawUnit)
    let quantity = parseNumber(at(cells, columns.quantity))
    const parLevel = parseNumber(at(cells, columns.parLevel))
    const cost = parseNumber(at(cells, columns.cost))
    let status: RowStatus = 'ok'
    let include = true

    if (!unit) {
      if (rawUnit !== null) messages.push(`No reconocimos la unidad «${String(rawUnit)}»: quedó en unidades.`)
      else if (columns.unit !== null && quantity !== null) messages.push('Sin unidad: quedó en unidades.')
      unit = 'unit'
      if (rawUnit !== null) status = 'warn'
    }
    if (quantity !== null && quantity < 0) {
      messages.push(`El stock venía negativo (${quantity}): se cargará 0. Contalo apenas puedas.`)
      quantity = 0
      status = 'warn'
    }
    if (columns.cost !== null && cost === null && at(cells, columns.cost) !== null) {
      messages.push('No pudimos leer el costo.')
      status = 'warn'
    }

    if (sales) {
      include = false
      status = 'skipped'
      messages.length = 0
      messages.push('Reporte de ventas: no es stock.')
    } else if (isFudoProducts && quantity === null) {
      // Fudo calcula la disponibilidad de estos platos con una receta que no
      // viene en el export: no son un insumo para importar.
      include = false
      status = 'skipped'
      messages.push('Fudo lo descuenta por receta: no es un insumo. Cargá su receta en TakeasyGO.')
    }
    if (!name || name.length < 2) {
      include = false
      status = 'error'
      messages.push('Sin nombre: no se puede importar.')
    } else {
      const k = normalizeName(name)
      if (seen.has(k) && include) {
        include = false
        status = 'skipped'
        messages.push('Repetido en el archivo: se usa la primera fila.')
      }
      seen.add(k)
    }

    return {
      id: `${sheet.name}:${line}`,
      sheet: sheet.name,
      line,
      include,
      name,
      category: guessCategory(name, sourceCategory),
      unit,
      quantity,
      parLevel: parLevel !== null && parLevel >= 0 ? parLevel : null,
      costCents: cost !== null && cost >= 0 ? Math.round(cost * 100) : null,
      supplier: cleanText(at(cells, columns.supplier)),
      code: cleanText(at(cells, columns.code), 40),
      sourceCategory,
      status,
      messages,
      match: null,
    }
  })

  const notice = sales
    ? 'Esta hoja es un reporte de VENTAS (cantidades vendidas), no de stock: no se importa. Para el inventario, exportá Stock.'
    : isFudoProducts
      ? 'Artículos de la carta con stock propio en Fudo (alfajores, porciones listas…): se importan como insumo. Después vinculá cada uno con su plato desde Recetas. Los que Fudo descuenta por receta quedan afuera.'
      : source === 'fudo'
        ? 'Export de Fudo reconocido: el mapeo de columnas es automático.'
        : null
  return { name: sheet.name, source, kind: sales ? 'sales' : 'stock', notice, columns, headers: sheet.headers, rows }
}

/** Unidades de la misma dimensión (kg↔g, l↔ml): se puede contar en la otra. */
export function sameDimension(a: string, b: string): boolean {
  const dim = (u: string) => (u === 'kg' || u === 'g' ? 'mass' : u === 'l' || u === 'ml' ? 'volume' : u)
  return dim(a) === dim(b)
}
