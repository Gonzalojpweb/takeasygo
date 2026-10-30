import type { OrderItem, Product, ProductModifier } from "@takeasygo/types"

// ============================================================================
// Personalizar un plato — lógica pura (obs. UX 30/10/2026)
// ============================================================================
// La hoja de personalización (ProductConfigSheet) solo dibuja; acá vive qué
// grupos se ven, qué falta elegir, el precio y la línea del pedido.
//
// CONTRATO con el server (apps/saas/lib/pos-online/catalogPrices.ts), que
// rechaza con 409 cualquier diferencia:
//   · normal → unitPrice = product.price; un modificador por opción elegida,
//              «${grupo}: ${opción}» con el precio del catálogo (también los
//              subgrupos de una opción, con el nombre del subgrupo).
//   · mitad  → unitPrice = halfPrice(1º) + halfPrice(2º) y EXACTAMENTE dos
//              modificadores «Primera mitad: …» / «Segunda mitad: …» (sin
//              extras: el server los rechaza).
// `total` respeta la regla de precio de cada grupo (suma, máximo, promedio).
// ============================================================================

export type Selections = Record<string, string | string[]>

export const HALF_TYPE = "__half_type"
export const HALF_FIRST = "__half_first"
export const HALF_SECOND = "__half_second"
export const HALF_MODE = "Mitad y mitad"
export const HALF_SINGLE = "Un sabor"
/** Grupo de la vista que reúne las dos mitades. */
export const HALF_GROUP_KEY = "__half"

export type GroupKind = "single" | "multi" | "fixed" | "half"

export interface ViewOption {
  name: string
  price: number
}

export interface ViewGroup {
  /** Clave en `Selections` (el nombre del grupo; los subgrupos llevan ruta). */
  key: string
  /** Lo que ve el cajero. */
  label: string
  /** Nombre con el que viaja el modificador («${name}: ${opción}»). */
  name: string
  kind: GroupKind
  required: boolean
  /** multi/fixed: tope de elecciones. fixed: además es la cantidad exacta. */
  max?: number
  options: ViewOption[]
  priceRule: "sum" | "max" | "average"
  /** Subgrupo que aparece al elegir una opción de otro grupo. */
  parentLabel?: string
  source?: ProductModifier
}

function kindOf(g: ProductModifier): "single" | "multi" | "fixed" {
  if (g.type === "fixed") return "fixed"
  if (g.type === "single") return "single"
  if (g.type === "multiple") return "multi"
  // Sin tipo (catálogos viejos): obligatorio o de una sola opción ⇒ elegir uno.
  return g.required || (g.maxSelections ?? 0) <= 1 ? "single" : "multi"
}

export function isHalfProduct(product: Product): boolean {
  return (product.modifiers ?? []).some((g) => g.name === HALF_TYPE)
}

export function isHalfMode(product: Product, sel: Selections): boolean {
  return isHalfProduct(product) && sel[HALF_TYPE] === HALF_MODE
}

function picked(sel: Selections, key: string): string[] {
  const v = sel[key]
  return v == null ? [] : Array.isArray(v) ? v : [v]
}

function toView(g: ProductModifier, key: string, parentLabel?: string): ViewGroup {
  const kind = kindOf(g)
  const max = kind === "fixed" ? (g.fixedCount ?? g.maxSelections ?? 1) : kind === "multi" ? g.maxSelections : undefined
  return {
    key,
    label: g.name,
    name: g.name,
    kind,
    required: kind === "fixed" || Boolean(g.required),
    max: max && max > 0 ? max : undefined,
    options: g.options.map((o) => ({ name: o.name, price: o.price })),
    priceRule: g.priceRule ?? "sum",
    parentLabel,
    source: g,
  }
}

/** El grupo y, debajo, los subgrupos de cada opción elegida (recursivo). */
function pushWithSubgroups(out: ViewGroup[], g: ProductModifier, key: string, sel: Selections, parentLabel?: string): void {
  out.push(toView(g, key, parentLabel))
  for (const optName of picked(sel, key)) {
    const opt = g.options.find((o) => o.name === optName)
    for (const sub of opt?.subGroups ?? []) {
      pushWithSubgroups(out, sub, `${key}›${optName}›${sub.name}`, sel, optName)
    }
  }
}

/** Los grupos que la hoja muestra, en orden, según lo elegido hasta ahora. */
export function visibleGroups(product: Product, sel: Selections): ViewGroup[] {
  const mods = product.modifiers ?? []
  const out: ViewGroup[] = []
  const half = isHalfProduct(product)
  if (half) {
    out.push({
      key: HALF_TYPE,
      label: "¿Entera o mitad y mitad?",
      name: HALF_TYPE,
      kind: "single",
      required: true,
      options: [{ name: HALF_SINGLE, price: 0 }, { name: HALF_MODE, price: 0 }],
      priceRule: "sum",
    })
    if (sel[HALF_TYPE] === HALF_MODE) {
      const flavors = mods.find((g) => g.name === HALF_FIRST)?.options ?? []
      out.push({
        key: HALF_GROUP_KEY,
        label: "Sabores",
        name: HALF_GROUP_KEY,
        kind: "half",
        required: true,
        options: flavors.map((o) => ({ name: o.name, price: o.price })),
        priceRule: "sum",
      })
      // El server no acepta extras en mitad y mitad: no se ofrecen.
      return out
    }
  }
  for (const g of mods) {
    if (g.name.startsWith("__half_")) continue
    pushWithSubgroups(out, g, g.name, sel)
  }
  return out
}

export function countPicked(sel: Selections, g: ViewGroup): number {
  if (g.kind === "half") return (sel[HALF_FIRST] ? 1 : 0) + (sel[HALF_SECOND] ? 1 : 0)
  return picked(sel, g.key).length
}

export function isGroupDone(sel: Selections, g: ViewGroup): boolean {
  const n = countPicked(sel, g)
  if (g.kind === "half") return n === 2
  if (g.kind === "fixed") return n === (g.max ?? 1)
  return g.required ? n > 0 : true
}

/** El primer grupo que falta completar (null = se puede agregar). */
export function pendingGroup(groups: ViewGroup[], sel: Selections): ViewGroup | null {
  return groups.find((g) => !isGroupDone(sel, g)) ?? null
}

/** Elegir / sacar una opción. Devuelve las selecciones nuevas (inmutable). */
export function toggleOption(sel: Selections, g: ViewGroup, option: string): Selections {
  if (g.kind === "single") {
    const next: Selections = { ...sel, [g.key]: option }
    // Cambiar entera ↔ mitad descarta lo elegido del otro modo.
    if (g.key === HALF_TYPE && sel[HALF_TYPE] !== option) {
      for (const k of Object.keys(next)) if (k !== HALF_TYPE) delete next[k]
    }
    return next
  }
  const cur = picked(sel, g.key)
  if (cur.includes(option)) return { ...sel, [g.key]: cur.filter((x) => x !== option) }
  if (g.max === 1) return { ...sel, [g.key]: [option] }
  if (g.max && cur.length >= g.max) return sel
  return { ...sel, [g.key]: [...cur, option] }
}

function groupExtra(g: ViewGroup, sel: Selections): number {
  const opts = picked(sel, g.key)
    .map((n) => g.options.find((o) => o.name === n))
    .filter((o): o is ViewOption => Boolean(o))
  if (opts.length === 0) return 0
  if (g.priceRule === "max") return Math.max(...opts.map((o) => o.price))
  if (g.priceRule === "average") return opts.reduce((s, o) => s + o.price, 0) / opts.length
  return opts.reduce((s, o) => s + o.price, 0)
}

function halfPrice(product: Product, name: unknown, group: string): number {
  return (product.modifiers ?? []).find((g) => g.name === group)?.options.find((o) => o.name === name)?.price ?? 0
}

/** Precio de UNA unidad con lo elegido (0 en mitad y mitad incompleta). */
export function unitTotal(product: Product, sel: Selections): number {
  if (isHalfMode(product, sel)) {
    if (!sel[HALF_FIRST] || !sel[HALF_SECOND]) return 0
    return halfPrice(product, sel[HALF_FIRST], HALF_FIRST) + halfPrice(product, sel[HALF_SECOND], HALF_SECOND)
  }
  let total = product.price
  for (const g of visibleGroups(product, sel)) {
    if (g.kind !== "half" && g.key !== HALF_TYPE) total += groupExtra(g, sel)
  }
  return total
}

/** La línea del pedido, en el formato que valida el server. */
export function buildOrderItem(product: Product, sel: Selections, notes: string, quantity: number): OrderItem {
  const note = notes.trim() || undefined
  if (isHalfMode(product, sel)) {
    const first = String(sel[HALF_FIRST])
    const second = String(sel[HALF_SECOND])
    const p1 = halfPrice(product, first, HALF_FIRST)
    const p2 = halfPrice(product, second, HALF_SECOND)
    return {
      productId: product.id,
      name: `${product.name} Mitad y mitad`,
      quantity,
      unitPrice: p1 + p2,
      total: (p1 + p2) * quantity,
      modifiers: [
        { name: `Primera mitad: ${first}`, price: p1 },
        { name: `Segunda mitad: ${second}`, price: p2 },
      ],
      notes: note,
    }
  }
  const modifiers: { name: string; price: number }[] = []
  for (const g of visibleGroups(product, sel)) {
    if (g.key === HALF_TYPE) continue
    for (const n of picked(sel, g.key)) {
      const opt = g.options.find((o) => o.name === n)
      if (opt) modifiers.push({ name: `${g.name}: ${opt.name}`, price: opt.price })
    }
  }
  return {
    productId: product.id,
    name: product.name,
    quantity,
    unitPrice: product.price,
    total: unitTotal(product, sel) * quantity,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    notes: note,
  }
}

/**
 * Lo inverso: reconstruye lo elegido a partir de una línea del pedido, para
 * editarla con la misma hoja. Lo que ya no existe en la carta se descarta.
 */
export function selectionsFromItem(product: Product, item: Pick<OrderItem, "modifiers">): Selections {
  const mods = item.modifiers ?? []
  const first = mods.find((m) => m.name.startsWith("Primera mitad: "))
  const second = mods.find((m) => m.name.startsWith("Segunda mitad: "))
  if (first && second && isHalfProduct(product)) {
    return {
      [HALF_TYPE]: HALF_MODE,
      [HALF_FIRST]: first.name.slice("Primera mitad: ".length),
      [HALF_SECOND]: second.name.slice("Segunda mitad: ".length),
    }
  }
  let sel: Selections = isHalfProduct(product) ? { [HALF_TYPE]: HALF_SINGLE } : {}
  const remaining = [...mods]
  // Recorre grupos visibles: elegir una opción puede destapar sus subgrupos.
  for (let pass = 0; pass < 4 && remaining.length > 0; pass++) {
    for (const g of visibleGroups(product, sel)) {
      if (g.kind === "half" || g.key === HALF_TYPE) continue
      for (const o of g.options) {
        const i = remaining.findIndex((m) => m.name === `${g.name}: ${o.name}`)
        if (i < 0) continue
        if (!picked(sel, g.key).includes(o.name)) sel = g.kind === "single" ? { ...sel, [g.key]: o.name } : { ...sel, [g.key]: [...picked(sel, g.key), o.name] }
        remaining.splice(i, 1)
      }
    }
  }
  return sel
}

/** Selección inicial: en productos con mitad y mitad arranca «Un sabor». */
export function initialSelections(product: Product): Selections {
  return isHalfProduct(product) ? { [HALF_TYPE]: HALF_SINGLE } : {}
}

/** Resumen corto de lo elegido en un grupo (para la barra de pasos). */
export function groupSummary(sel: Selections, g: ViewGroup): string {
  if (g.kind === "half") return [sel[HALF_FIRST], sel[HALF_SECOND]].filter(Boolean).join(" + ")
  return picked(sel, g.key).join(", ")
}

/**
 * Total de una línea al cambiar la cantidad: mantiene el precio por unidad
 * con el que se armó. (unitPrice + modificadores) no sirve para todas las
 * líneas: en mitad y mitad unitPrice ya suma las mitades, y los grupos con
 * regla «máximo» o «promedio» no suman todas sus opciones.
 */
export function scaleLineTotal(item: Pick<OrderItem, "total" | "quantity">, quantity: number): number {
  if (item.quantity <= 0) return item.total
  return (item.total / item.quantity) * quantity
}
