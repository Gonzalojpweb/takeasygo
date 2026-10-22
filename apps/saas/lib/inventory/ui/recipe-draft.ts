// ============================================================================
// Inventario V3 — borrador del editor de recetas (puro)
// ============================================================================
// El borrador vive en el cliente hasta que el responsable confirma. Valida
// por fila (error junto al campo), arma el payload exacto de PUT recipes y
// el resumen "esto va a descontar por porción" que se confirma antes de
// guardar. No decide qué descuenta una venta: eso es resolveDishRecipe en el
// servidor.
// ============================================================================

import { compatibleUnits, parseDecimal, recipeDefaultUnit, type FieldErrors } from './fields'

export interface DraftSku {
  _id: string
  name: string
  canonicalUnit: string
  isActive?: boolean
}

export interface DraftRow {
  key: string
  skuId: string
  quantity: string
  unit: string
}

/** Variante: receta propia, o confirmada "igual a la base". */
export type DraftMode = 'own' | 'same_as_base'

export interface RecipeDraft {
  menuItemId: string
  dishName: string
  variantName: string | null
  mode: DraftMode
  rows: DraftRow[]
}

let seq = 0
const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`

export function draftFrom(
  dish: { menuItemId: string; name: string },
  variantName: string | null,
  existing: { usesBaseRecipe?: boolean; items: Array<{ skuId: string; quantity: number; unit: string }> } | null,
): RecipeDraft {
  return {
    menuItemId: dish.menuItemId,
    dishName: dish.name,
    variantName,
    mode: existing?.usesBaseRecipe ? 'same_as_base' : 'own',
    rows: existing && !existing.usesBaseRecipe
      ? existing.items.map((i) => ({ key: rowKey(), skuId: i.skuId, quantity: String(i.quantity).replace('.', ','), unit: i.unit }))
      : [],
  }
}

export function addRow(d: RecipeDraft, sku: DraftSku, quantity = '', unit?: string): RecipeDraft {
  if (d.rows.some((r) => r.skuId === sku._id)) return d
  return { ...d, rows: [...d.rows, { key: rowKey(), skuId: sku._id, quantity, unit: unit ?? recipeDefaultUnit(sku.canonicalUnit) }] }
}

export function updateRow(d: RecipeDraft, key: string, patch: Partial<Omit<DraftRow, 'key'>>): RecipeDraft {
  return { ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }
}

export function removeRow(d: RecipeDraft, key: string): RecipeDraft {
  return { ...d, rows: d.rows.filter((r) => r.key !== key) }
}

/**
 * Punto de partida para una variante: copia la base TAL CUAL. No multiplica:
 * "Doble" no es necesariamente 2× (D-26); la persona ajusta y confirma.
 */
export function copyFromBase(d: RecipeDraft, base: Array<{ skuId: string; quantity: number; unit: string }>): RecipeDraft {
  return {
    ...d,
    mode: 'own',
    rows: base.map((i) => ({ key: rowKey(), skuId: i.skuId, quantity: String(i.quantity).replace('.', ','), unit: i.unit })),
  }
}

export type RowField = 'skuId' | 'quantity' | 'unit'

export interface DraftValidation {
  rows: Record<string, FieldErrors<RowField>>
  /** Error general (sin insumos, base inexistente…). */
  form: string | null
  valid: boolean
}

export function validateDraft(d: RecipeDraft, skus: ReadonlyMap<string, DraftSku>, opts: { baseExists: boolean }): DraftValidation {
  const rows: Record<string, FieldErrors<RowField>> = {}
  let form: string | null = null

  if (d.mode === 'same_as_base') {
    if (!d.variantName) form = 'Solo una variante puede usar la receta base'
    else if (!opts.baseExists) form = 'Primero cargá la receta base del plato'
    return { rows, form, valid: form === null }
  }

  if (d.rows.length === 0) form = 'Agregá al menos un insumo'
  Object.assign(rows, validateRows(d.rows, skus, { allowNegative: false }))
  return { rows, form, valid: form === null && Object.keys(rows).length === 0 }
}

/**
 * Errores por fila. `allowNegative`: reglas de modificadores ("Sin cebolla"
 * resta −20 g); en recetas y preparaciones la cantidad es siempre positiva.
 */
export function validateRows(
  rows: readonly DraftRow[],
  skus: ReadonlyMap<string, DraftSku>,
  opts: { allowNegative: boolean },
): Record<string, FieldErrors<RowField>> {
  const out: Record<string, FieldErrors<RowField>> = {}
  for (const r of rows) {
    const e: FieldErrors<RowField> = {}
    const sku = skus.get(r.skuId)
    if (!sku) e.skuId = 'Elegí un insumo'
    else if (sku.isActive === false) e.skuId = 'Este insumo está desactivado'
    const q = parseDecimal(r.quantity)
    if (q === null || q === 0 || (!opts.allowNegative && q < 0)) {
      e.quantity = opts.allowNegative ? 'Cantidad distinta de 0 (negativa para "sin…")' : 'Cantidad por porción mayor a 0'
    }
    if (sku && !(compatibleUnits(sku.canonicalUnit) as string[]).includes(r.unit)) e.unit = `Se mide en ${sku.canonicalUnit}`
    if (Object.keys(e).length) out[r.key] = e
  }
  return out
}

/** Filas → items de la API (cantidades ya validadas). */
export function rowsToItems(rows: readonly DraftRow[]) {
  return rows.map((r) => ({ skuId: r.skuId, quantity: parseDecimal(r.quantity) as number, unit: r.unit }))
}

/** Payload exacto para PUT /inventory/recipes. */
export function draftPayload(d: RecipeDraft, locationId: string) {
  return {
    kind: 'dish' as const,
    locationId,
    menuItemId: d.menuItemId,
    variantName: d.variantName,
    name: d.variantName ? `${d.dishName} (${d.variantName})` : d.dishName,
    usesBaseRecipe: d.mode === 'same_as_base',
    items: d.mode === 'same_as_base'
      ? []
      : rowsToItems(d.rows),
  }
}

/** "150 g de Carne picada · 1 u. de Pan" para la confirmación. */
export function draftSummary(d: RecipeDraft, skus: ReadonlyMap<string, DraftSku>, unitShort: Record<string, string>): string[] {
  if (d.mode === 'same_as_base') return ['Lo mismo que la receta base, por porción']
  return d.rows.map((r) => `${r.quantity} ${unitShort[r.unit] ?? r.unit} de ${skus.get(r.skuId)?.name ?? 'insumo'}`)
}

/** ¿Hay cambios sin guardar respecto de lo que estaba? */
export function isDirty(d: RecipeDraft, original: RecipeDraft): boolean {
  if (d.mode !== original.mode) return true
  const norm = (x: RecipeDraft) => x.rows.map((r) => `${r.skuId}|${parseDecimal(r.quantity)}|${r.unit}`).sort().join(';')
  return norm(d) !== norm(original)
}
