/**
 * lib/menu/price-apply.ts — aplica o deshace una lista de cambios sobre UNA
 * carta (documento de Menu), con control de conflictos.
 *
 * Cada cambio dice dónde (categoría, subcategoría, plato, variante u opción),
 * qué campo y el valor esperado. Si el valor actual no es el esperado (alguien
 * lo cambió entre la vista previa y la aplicación, o después en un deshacer),
 * ese cambio es un conflicto y NO se pisa. Quien llama decide: con algún
 * conflicto no se guarda nada (todo o nada por carta).
 */
import type { PriceChange } from './price-engine'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDoc = Record<string, any>

export interface ApplyConflict {
  change: PriceChange
  current: number | null
}

const byId = (list: AnyDoc[] | undefined, id: string | null | undefined) => (id ? (list ?? []).find(x => String(x._id) === String(id)) : undefined)

function target(menu: AnyDoc, c: PriceChange): { obj: AnyDoc; key: string } | null {
  const cat = byId(menu.categories, c.categoryId)
  if (!cat) return null
  const holder = c.subcategoryId ? byId(cat.subcategories, c.subcategoryId) : cat
  const item = byId(holder?.items, c.itemId)
  if (!item) return null
  if (c.field.startsWith('variant.')) {
    const v = byId(item.variants, c.variantId)
    return v ? { obj: v, key: c.field.slice('variant.'.length) } : null
  }
  if (c.field === 'option.extraPrice') {
    const g = byId(item.customizationGroups, c.groupId)
    const o = byId(g?.options, c.optionId)
    return o ? { obj: o, key: 'extraPrice' } : null
  }
  return { obj: item, key: c.field }
}

/**
 * Revisa conflictos y, si no hay, escribe. direction 'forward' = before→after;
 * 'back' = after→before (deshacer). Devuelve los conflictos (vacío = aplicado).
 */
export function applyToMenu(menu: AnyDoc, changes: PriceChange[], direction: 'forward' | 'back' = 'forward'): ApplyConflict[] {
  const conflicts: ApplyConflict[] = []
  const plan: { obj: AnyDoc; key: string; value: number }[] = []
  for (const c of changes) {
    const t = target(menu, c)
    const expected = direction === 'forward' ? c.before : c.after
    const value = direction === 'forward' ? c.after : c.before
    if (!t) { conflicts.push({ change: c, current: null }); continue }
    const current = t.obj[t.key] == null ? null : Number(t.obj[t.key])
    if (current !== expected) { conflicts.push({ change: c, current }); continue }
    plan.push({ obj: t.obj, key: t.key, value })
  }
  if (conflicts.length) return conflicts
  for (const p of plan) p.obj[p.key] = p.value
  return []
}
/* eslint-enable @typescript-eslint/no-explicit-any */
