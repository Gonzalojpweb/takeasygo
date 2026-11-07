/**
 * lib/menu/price-engine.ts — motor de «Actualizar precios» (puro, sin base).
 *
 * Recibe las cartas (una por sede) y un plan, y devuelve la lista exacta de
 * cambios con su valor anterior y nuevo. El servidor lo recalcula siempre:
 * nunca se aplica una lista de cambios que mande el navegador.
 *
 * Plan:
 *   · reglas en orden: cada una elige platos (selección) y dice cómo cambiar
 *     el precio (porcentaje, monto fijo o precio exacto, con redondeo). Si un
 *     plato entra en varias reglas, gana la ÚLTIMA (lo específico después de
 *     lo general: «toda la carta +10 %» y después «Bebidas +$500»);
 *   · ajustes a mano por plato (overrides): mandan sobre las reglas;
 *   · qué precios toca: local, para llevar, empresas, variantes, extras.
 *
 * Los platos se identifican por categoría + nombre (sin distinguir
 * mayúsculas), así la misma regla sirve para varias sedes con la misma carta.
 * Precios en centavos; redondeo en pesos.
 * Nunca toca fotos, nombres, descripciones ni disponibilidad.
 */
import { adjustedListPrice, nextListPrice } from './list-price'

export type Rounding = 'none' | '100' | '500' | '1000' | 'end900' | 'end990'
export type AdjustKind = 'percent' | 'amount' | 'set'

export interface Adjustment {
  kind: AdjustKind
  /** percent: % (negativo baja). amount: pesos a sumar (negativo resta). set: pesos. */
  value: number
  rounding: Rounding
}

export interface Selection {
  all?: boolean
  /** Nombres de categoría. */
  categories?: string[]
  /** «Categoría > Subcategoría». */
  subcategories?: string[]
  /** Claves de plato (itemKey). */
  items?: string[]
  tag?: string | null
  /** Pesos. */
  minPrice?: number | null
  maxPrice?: number | null
  search?: string | null
}

export interface PriceTargets {
  dineIn: boolean
  takeaway: boolean
  business: boolean
  variants: boolean
  options: boolean
}

export interface PriceRule {
  id: string
  selection: Selection
  adjustment: Adjustment
}

export interface PriceOverride {
  /** Centavos. */
  price: number
  /** Centavos; sin indicar y con precio para llevar propio: igual a price. */
  takeawayPrice?: number
}

export interface PricePlan {
  rules: PriceRule[]
  targets: PriceTargets
  overrides?: Record<string, PriceOverride>
}

export type ChangeField =
  | 'price' | 'takeawayPrice' | 'businessPrice' | 'originalPrice' | 'takeawayOriginalPrice'
  | 'variant.price' | 'variant.takeawayPrice' | 'variant.businessPrice' | 'variant.originalPrice' | 'variant.takeawayOriginalPrice'
  | 'option.extraPrice'

export interface PriceChange {
  locationId: string
  categoryId: string
  subcategoryId: string | null
  itemId: string
  variantId?: string | null
  groupId?: string | null
  optionId?: string | null
  field: ChangeField
  /** Precio de lista que acompaña a otro cambio: se aplica y se deshace, no se muestra aparte. */
  hidden?: boolean
  itemKey: string
  categoryName: string
  itemName: string
  /** «Precio», «Para llevar», «Variante Grande», «Extra 2 Platos»… */
  label: string
  before: number
  after: number
  source: string
}

export interface PlanWarning {
  itemKey: string
  itemName: string
  message: string
  level: 'error' | 'warning'
}

export interface PlanResult {
  changes: PriceChange[]
  warnings: PlanWarning[]
  /** Platos tocados (sin contar repetidos por sede). */
  items: number
}

// ── Lectura de la carta ──────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDoc = Record<string, any>

export interface MenuLike {
  locationId: unknown
  categories?: AnyDoc[]
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
export const itemKeyOf = (categoryName: string, itemName: string) => `${norm(categoryName)}||${norm(itemName)}`

export interface FlatItem {
  locationId: string
  categoryId: string
  categoryName: string
  subcategoryId: string | null
  subcategoryName: string | null
  item: AnyDoc
  key: string
}

export function flattenMenus(menus: MenuLike[]): FlatItem[] {
  const out: FlatItem[] = []
  for (const m of menus) {
    for (const c of m.categories ?? []) {
      for (const item of c.items ?? []) {
        out.push({ locationId: String(m.locationId), categoryId: String(c._id), categoryName: c.name, subcategoryId: null, subcategoryName: null, item, key: itemKeyOf(c.name, item.name) })
      }
      for (const s of c.subcategories ?? []) {
        for (const item of s.items ?? []) {
          out.push({ locationId: String(m.locationId), categoryId: String(c._id), categoryName: c.name, subcategoryId: String(s._id), subcategoryName: s.name, item, key: itemKeyOf(c.name, item.name) })
        }
      }
    }
  }
  return out
}

export function matches(sel: Selection, f: FlatItem): boolean {
  const scoped =
    sel.all ||
    (sel.categories ?? []).some(c => norm(c) === norm(f.categoryName)) ||
    (f.subcategoryName != null && (sel.subcategories ?? []).some(s => norm(s) === norm(`${f.categoryName} > ${f.subcategoryName}`))) ||
    (sel.items ?? []).some(k => k === f.key)
  if (!scoped) return false
  const price = Number(f.item.price ?? 0) / 100
  if (sel.minPrice != null && price < sel.minPrice) return false
  if (sel.maxPrice != null && price > sel.maxPrice) return false
  if (sel.tag && !(f.item.tags ?? []).some((t: string) => norm(t) === norm(sel.tag))) return false
  if (sel.search && !norm(f.item.name).includes(norm(sel.search))) return false
  return true
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

/** Redondeo de un precio en centavos según la regla (resultado en centavos). */
export function roundCents(cents: number, rounding: Rounding): number {
  const p = cents / 100
  let out: number
  switch (rounding) {
    case '100': out = Math.round(p / 100) * 100; break
    case '500': out = Math.round(p / 500) * 500; break
    case '1000': out = Math.round(p / 1000) * 1000; break
    case 'end900':
    case 'end990': {
      const tail = rounding === 'end900' ? 900 : 990
      let c = Math.floor(p / 1000) * 1000 + tail
      if (c - p > 500) c -= 1000
      out = c > 0 ? c : Math.round(p / 100) * 100
      break
    }
    default: out = Math.round(p)
  }
  return Math.max(0, Math.round(out * 100))
}

export function applyAdjustment(cents: number, a: Adjustment, roundingOverride?: Rounding): number {
  let raw: number
  if (a.kind === 'percent') raw = cents * (1 + a.value / 100)
  else if (a.kind === 'amount') raw = cents + a.value * 100
  else raw = a.value * 100
  return roundCents(raw, roundingOverride ?? a.rounding)
}

/** Los extras chicos no van con terminación 900/990: se redondean al $100. */
const optionRounding = (r: Rounding): Rounding => (r === 'end900' || r === 'end990' ? '100' : r)

export function computePlan(menus: MenuLike[], plan: PricePlan): PlanResult {
  const changes: PriceChange[] = []
  const warnings: PlanWarning[] = []
  const touched = new Set<string>()
  const warned = new Set<string>()
  const warn = (f: FlatItem, message: string, level: PlanWarning['level']) => {
    const id = `${f.key}|${message}`
    if (warned.has(id)) return
    warned.add(id)
    warnings.push({ itemKey: f.key, itemName: f.item.name, message, level })
  }

  for (const f of flattenMenus(menus)) {
    const override = plan.overrides?.[f.key]
    let rule: PriceRule | undefined
    for (const r of plan.rules) if (matches(r.selection, f)) rule = r
    if (!override && !rule) continue

    const item = f.item
    const base = { locationId: f.locationId, categoryId: f.categoryId, subcategoryId: f.subcategoryId, itemId: String(item._id), itemKey: f.key, categoryName: f.categoryName, itemName: item.name }
    const source = override ? 'manual' : rule!.id
    const push = (c: Omit<PriceChange, keyof typeof base | 'source'>) => {
      if (c.before === c.after) return
      changes.push({ ...base, ...c, source })
      touched.add(f.key)
    }
    const adjust = (cents: number) => applyAdjustment(cents, rule!.adjustment)

    // Precio del local (+ su lista)
    if (plan.targets.dineIn) {
      const before = Number(item.price ?? 0)
      const after = override ? override.price : adjust(before)
      if (after <= 0) warn(f, 'El precio quedaría en $0 o menos: no se cambia.', 'error')
      else {
        push({ field: 'price', label: 'Precio', before, after })
        const listAfter = override ? nextListPrice(before, item.originalPrice, after) : adjustedListPrice(before, item.originalPrice, after, adjust)
        if (item.originalPrice != null) push({ field: 'originalPrice', label: 'Precio de lista', before: Number(item.originalPrice), after: listAfter, hidden: true })
        if (before > 0 && Math.abs(after - before) / before > 0.5) warn(f, `Cambia más del 50 % (${Math.round(((after - before) / before) * 100)} %).`, 'warning')
      }
    }

    // Para llevar: solo si el plato tiene precio propio (si no, sigue al del local)
    if (plan.targets.takeaway && item.takeawayPrice != null) {
      const before = Number(item.takeawayPrice)
      const after = override ? (override.takeawayPrice ?? override.price) : adjust(before)
      if (after > 0) {
        push({ field: 'takeawayPrice', label: 'Para llevar', before, after })
        if (item.takeawayOriginalPrice != null) {
          const listAfter = override ? nextListPrice(before, item.takeawayOriginalPrice, after) : adjustedListPrice(before, item.takeawayOriginalPrice, after, adjust)
          push({ field: 'takeawayOriginalPrice', label: 'Lista para llevar', before: Number(item.takeawayOriginalPrice), after: listAfter, hidden: true })
        }
      }
    }

    // Empresas
    if (plan.targets.business && item.businessPrice != null && !override) {
      const before = Number(item.businessPrice)
      const after = adjust(before)
      if (after > 0) push({ field: 'businessPrice', label: 'Empresas', before, after })
    }

    // Variantes (chico/grande…): siguen porcentaje y monto; con precio exacto se avisa.
    const variants: AnyDoc[] = item.variants ?? []
    if (plan.targets.variants && variants.length) {
      if (override || rule!.adjustment.kind === 'set') {
        warn(f, 'Tiene variantes: su precio exacto se ajusta a mano.', 'warning')
      } else {
        for (const v of variants) {
          const vb = { variantId: String(v._id) }
          const before = Number(v.price ?? 0)
          const after = adjust(before)
          if (after > 0) {
            push({ ...vb, field: 'variant.price', label: `Variante ${v.name}`, before, after })
            if (v.originalPrice != null) push({ ...vb, field: 'variant.originalPrice', label: `Lista ${v.name}`, before: Number(v.originalPrice), after: adjustedListPrice(before, v.originalPrice, after, adjust), hidden: true })
          }
          if (plan.targets.takeaway && v.takeawayPrice != null) {
            const tb = Number(v.takeawayPrice)
            const ta = adjust(tb)
            if (ta > 0) push({ ...vb, field: 'variant.takeawayPrice', label: `Variante ${v.name} para llevar`, before: tb, after: ta })
          }
          if (plan.targets.business && v.businessPrice != null) {
            const bb = Number(v.businessPrice)
            const ba = adjust(bb)
            if (ba > 0) push({ ...vb, field: 'variant.businessPrice', label: `Variante ${v.name} empresas`, before: bb, after: ba })
          }
        }
      }
    }

    // Extras con costo (opciones): solo con porcentaje.
    if (plan.targets.options && rule && !override && rule.adjustment.kind === 'percent') {
      for (const g of item.customizationGroups ?? []) {
        for (const o of g.options ?? []) {
          const before = Number(o.extraPrice ?? 0)
          if (before <= 0) continue
          const after = applyAdjustment(before, rule.adjustment, optionRounding(rule.adjustment.rounding))
          push({ groupId: String(g._id), optionId: String(o._id), field: 'option.extraPrice', label: `Extra ${o.name}`, before, after })
        }
      }
    }
  }

  return { changes, warnings, items: touched.size }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
