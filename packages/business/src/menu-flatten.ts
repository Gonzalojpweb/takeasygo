import type { MenuCategory, Product, ProductModifier } from "@takeasygo/types"

// ============================================================================
// Aplanado del menú — la ÚNICA regla, compartida POS ⇄ SaaS
// ============================================================================
// Extraído de apps/sync/src/routes/menu.ts. La colección `menus` es anidada
// (categoria → items → customizationGroups → options → subGroups) y el POS
// consume el menú plano: Product[] + MenuCategory[].
//
// Si esta regla viviera en dos lugares, el POS y el SaaS verían menús
// distintos para el mismo catálogo: mitad-y-mitad, grupos heredados de la
// categoría y desactivados por item dejarían de coincidir.
//
// Tipos estructurales a propósito: ni mongoose ni @takeasygo/db. Cualquier
// `.lean()` de un Menu entra tal cual.
// ============================================================================

export type PriceRule = 'sum' | 'max' | 'average'
export type GroupType = 'single' | 'multiple' | 'fixed'

// ---------------------------------------------------------------------------
// Entrada — forma "cruda" de un Menu leído con .lean()
// ---------------------------------------------------------------------------

export interface RawOptionSubGroup {
  name: string
  type?: string
  fixedCount?: number
  required?: boolean
  priceRule?: string
  options?: Array<{ name: string; extraPrice?: number; subGroups?: RawOptionSubGroup[] }>
}

export interface RawGroupOption {
  _id?: unknown
  name: string
  extraPrice?: number
  subGroups?: RawOptionSubGroup[]
}

export interface RawCustomizationGroup {
  _id?: unknown
  name: string
  type?: string
  fixedCount?: number
  required?: boolean
  priceRule?: string
  options?: RawGroupOption[]
}

export interface RawMenuItem {
  _id?: unknown
  name: string
  description?: string
  price: number
  halfPrice?: number
  isAvailable?: boolean
  /** Fase J: motivo de la pausa (manual / stock) y porciones con stock. */
  pausedReason?: 'manual' | 'stock' | null
  stockPortions?: number | null
  imageUrl?: string
  customizationGroups?: RawCustomizationGroup[]
  disabledGroupIds?: string[]
  disabledOptionIds?: string[]
  disabledVariantNames?: string[]
  variants?: Array<{ name: string; price?: number; customizationGroups?: RawCustomizationGroup[] }>
}

export interface RawMenuSubCategory {
  _id?: unknown
  name: string
  sortOrder?: number
  customizationGroups?: RawCustomizationGroup[]
  items?: RawMenuItem[]
}

export interface RawMenuCategory {
  _id?: unknown
  name: string
  sortOrder?: number
  isAvailable?: boolean
  customizationGroups?: RawCustomizationGroup[]
  items?: RawMenuItem[]
  subcategories?: RawMenuSubCategory[]
}

export interface RawMenu {
  tenantId: { toString(): string } | string
  categories?: RawMenuCategory[]
}

export interface FlatMenuResult {
  products: Product[]
  categories: MenuCategory[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ObjectId o string → string. `undefined`/`null` → '' (nunca 'undefined'). */
function oid(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function toPriceRule(value: string | undefined): PriceRule {
  return value === 'max' || value === 'average' ? value : 'sum'
}

function toGroupType(value: string | undefined): GroupType | undefined {
  return value === 'single' || value === 'multiple' || value === 'fixed' ? value : undefined
}

// ---------------------------------------------------------------------------
// Subgrupos de una opción (profundidad 2 en el catálogo)
// ---------------------------------------------------------------------------

function flattenSubGroups(groups: RawOptionSubGroup[]): ProductModifier[] {
  return groups.map((g) => ({
    name: g.name,
    type: toGroupType(g.type),
    fixedCount: g.fixedCount,
    required: g.required ?? false,
    priceRule: toPriceRule(g.priceRule),
    options: (g.options ?? []).map((o) => ({
      name: o.name,
      price: o.extraPrice ?? 0,
    })),
  }))
}

// ---------------------------------------------------------------------------
// Un menú anidado → productos + categorías planos
// ---------------------------------------------------------------------------

/**
 * Grupo con el que el POS elige la variante del plato (tamaño, porción…).
 * Las variantes no son grupos de personalización en la colección: sin este
 * grupo el POS no podía elegirlas (bug 11/11/2026: platos con variantes
 * llegaban sin opciones y se cobraban al precio base).
 */
export const VARIANT_GROUP_NAME = 'Variante'

/** Un grupo del catálogo → modificador del POS, sin las opciones desactivadas. */
function toModifier(g: RawCustomizationGroup, disabledOptions: readonly string[]): ProductModifier {
  const type = toGroupType(g.type)
  return {
    name: g.name,
    type,
    fixedCount: g.fixedCount,
    required: g.required ?? false,
    maxSelections:
      type === 'fixed'
        ? (g.fixedCount ?? 1)
        : type === 'single'
          ? 1
          : undefined,
    priceRule: toPriceRule(g.priceRule),
    options: (g.options ?? [])
      .filter(
        (o) =>
          !disabledOptions.includes(oid(o._id)) &&
          !disabledOptions.includes(o.name)
      )
      .map((o) => ({
        name: o.name,
        price: o.extraPrice ?? 0,
        subGroups:
          o.subGroups && o.subGroups.length > 0
            ? flattenSubGroups(o.subGroups)
            : undefined,
      })),
  }
}

/** Un ítem del catálogo → Product, con los grupos heredados ya resueltos. */
function flattenItem(
  item: RawMenuItem,
  inheritedGroups: RawCustomizationGroup[],
  tenantId: string,
  categoryName: string,
  subcategoryId?: string,
  /** Fase J: categoría pausada ⇒ todos sus ítems quedan faltantes. */
  categoryAvailable = true
): Product {
  const disabledGroups = item.disabledGroupIds ?? []
  const disabledOptions = item.disabledOptionIds ?? []

  const allGroups = [...inheritedGroups, ...(item.customizationGroups ?? [])].filter(
    (g) => !disabledGroups.includes(oid(g._id)) && !disabledGroups.includes(g.name)
  )

  const topModifiers = allGroups.map((g) => toModifier(g, disabledOptions))

  // Variantes (no desactivadas y con precio): grupo obligatorio de una sola
  // elección, primero en la hoja. El precio del plato pasa a ser el de la
  // variante más barata y cada opción suma la diferencia, así el contrato de
  // precios no cambia (unitPrice = product.price + modificadores, en
  // centavos). Los grupos propios de cada variante cuelgan de su opción
  // (subgrupos), salvo los que ya estaban declarados arriba o desactivados.
  const variants = (item.variants ?? []).filter(
    (v) => !(item.disabledVariantNames ?? []).includes(v.name) && typeof v.price === 'number' && v.price >= 0
  )
  let price = item.price
  let variantModifier: ProductModifier | null = null
  if (variants.length > 0) {
    price = Math.min(...variants.map((v) => v.price as number))
    const topNames = new Set(allGroups.map((g) => g.name))
    const groupName = topNames.has(VARIANT_GROUP_NAME) ? `${VARIANT_GROUP_NAME} del plato` : VARIANT_GROUP_NAME
    variantModifier = {
      name: groupName,
      type: 'single',
      required: true,
      maxSelections: 1,
      priceRule: 'sum',
      options: variants.map((v) => {
        const own = (v.customizationGroups ?? []).filter(
          (vg) =>
            !topNames.has(vg.name) &&
            !disabledGroups.includes(oid(vg._id)) &&
            !disabledGroups.includes(vg.name)
        )
        return {
          name: v.name,
          price: (v.price as number) - price,
          subGroups: own.length > 0 ? own.map((vg) => toModifier(vg, disabledOptions)) : undefined,
        }
      }),
    }
  }

  const allModifiers = variantModifier ? [variantModifier, ...topModifiers] : topModifiers
  const modifiers: ProductModifier[] | undefined = allModifiers.length > 0 ? allModifiers : undefined

  const product: Product = {
    id: oid(item._id),
    tenantId,
    name: item.name,
    description: item.description ?? '',
    price,
    category: categoryName,
    isAvailable: (item.isAvailable ?? true) && categoryAvailable,
    modifiers,
  }
  if (!product.isAvailable) {
    product.unavailableReason = item.isAvailable === false && item.pausedReason === 'stock' ? 'stock' : 'manual'
  }
  if (typeof item.stockPortions === 'number') product.stockPortions = item.stockPortions
  if (subcategoryId) product.subcategoryId = subcategoryId
  if (item.halfPrice !== undefined && item.halfPrice !== null) {
    product.halfPrice = item.halfPrice
  }
  if (item.imageUrl) product.imageUrl = item.imageUrl
  return product
}

export function flattenMenu(doc: RawMenu): FlatMenuResult {
  const products: Product[] = []
  const categories: MenuCategory[] = []
  const tenantId = oid(doc.tenantId)

  for (const cat of doc.categories ?? []) {
    const categoryId = oid(cat._id)
    categories.push({
      id: categoryId,
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      isVisible: cat.isAvailable ?? true,
    })

    // Los grupos de customización de la categoría se heredan a cada item.
    const inheritedGroups = cat.customizationGroups ?? []

    const categoryAvailable = cat.isAvailable ?? true
    for (const item of cat.items ?? []) {
      products.push(flattenItem(item, inheritedGroups, tenantId, cat.name, undefined, categoryAvailable))
    }

    // D13 — subcategorías: cada una es una MenuCategory con `parentId`. Sus
    // ítems heredan los grupos de la categoría Y los de la subcategoría, y
    // conservan `category` = nombre del padre (los filtros por categoría del
    // POS siguen funcionando sin conocer la jerarquía).
    for (const sub of cat.subcategories ?? []) {
      const subId = oid(sub._id)
      categories.push({
        id: subId,
        name: sub.name,
        sortOrder: sub.sortOrder ?? 0,
        isVisible: true,
        parentId: categoryId,
      })
      const subGroups = [...inheritedGroups, ...(sub.customizationGroups ?? [])]
      for (const item of sub.items ?? []) {
        products.push(flattenItem(item, subGroups, tenantId, cat.name, subId, categoryAvailable))
      }
    }
  }

  injectHalfPriceModifiers(products)

  return { products, categories }
}

// ---------------------------------------------------------------------------
// Mitad y mitad — modificadores sintéticos inyectados en el plano
// ---------------------------------------------------------------------------

/**
 * Los productos con `halfPrice` necesitan en el POS tres grupos artificiales
 * (`__half_type`, `__half_first`, `__half_second`) que no existen en el
 * catálogo: los arma el server para que todos los dispositivos calculen el
 * mismo precio de "mitad y mitad".
 */
export function injectHalfPriceModifiers(products: Product[]): void {
  // Los sabores se combinan dentro de la misma (sub)categoría: una pizza de
  // la subcategoría "Especiales" no se mezcla con las "Clásicas".
  const byCategory = new Map<string, Product[]>()
  for (const p of products) {
    const key = `${p.category}\u0000${p.subcategoryId ?? ''}`
    const list = byCategory.get(key) ?? []
    list.push(p)
    byCategory.set(key, list)
  }

  for (const [, catProducts] of byCategory) {
    const halfPriceItems = catProducts.filter((p) => p.halfPrice != null && p.halfPrice > 0)
    if (halfPriceItems.length < 2) continue

    const flavorOptions = halfPriceItems.map((p) => ({
      name: p.name,
      price: p.halfPrice as number,
    }))

    for (const product of halfPriceItems) {
      const existingMods = product.modifiers ?? []
      const tipoGroup: ProductModifier = {
        name: '__half_type',
        type: 'single',
        required: true,
        maxSelections: 1,
        priceRule: 'sum',
        options: [
          { name: 'Un sabor', price: 0 },
          { name: 'Mitad y mitad', price: 0 },
        ],
      }
      const firstHalfGroup: ProductModifier = {
        name: '__half_first',
        type: 'single',
        required: true,
        maxSelections: 1,
        priceRule: 'sum',
        options: flavorOptions,
      }
      const secondHalfGroup: ProductModifier = {
        name: '__half_second',
        type: 'single',
        required: true,
        maxSelections: 1,
        priceRule: 'sum',
        options: flavorOptions,
      }
      product.modifiers = [tipoGroup, firstHalfGroup, secondHalfGroup, ...existingMods]
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot: uno o varios menús → el blob que consume el POS
// ---------------------------------------------------------------------------

/**
 * Fusiona todos los menú activos de la sede, deduplica categorías por nombre
 * (dos sedes pueden compartir categoría) y las ordena por `sortOrder`.
 *
 * El `version`/`tenantId`/`signature` del `MenuSnapshot` los arma el caller.
 */
export function flattenMenuSnapshot(menus: readonly RawMenu[]): FlatMenuResult {
  const products: Product[] = []
  const categories: MenuCategory[] = []

  for (const menu of menus) {
    const flat = flattenMenu(menu)
    products.push(...flat.products)
    categories.push(...flat.categories)
  }

  // Primer nivel: dedup por nombre (dos menús de la sede pueden compartir
  // categoría). Se recuerda qué id sobrevivió para cada nombre.
  const topIdByName = new Map<string, string>()
  const topNameById = new Map<string, string>()
  const deduped: MenuCategory[] = []
  for (const c of categories) {
    if (c.parentId) continue
    topNameById.set(c.id, c.name)
    if (topIdByName.has(c.name)) continue
    topIdByName.set(c.name, c.id)
    deduped.push(c)
  }

  // Subcategorías: el padre puede haber sido deduplicado → se reapunta al id
  // que sobrevivió, y se deduplican por (padre, nombre).
  const subIdRemap = new Map<string, string>()
  const seenSub = new Map<string, string>()
  for (const c of categories) {
    if (!c.parentId) continue
    const parentName = topNameById.get(c.parentId)
    const parentId = parentName !== undefined ? topIdByName.get(parentName) : undefined
    if (!parentId) continue
    const key = `${parentId}\u0000${c.name}`
    const kept = seenSub.get(key)
    if (kept) {
      subIdRemap.set(c.id, kept)
      continue
    }
    seenSub.set(key, c.id)
    deduped.push({ ...c, parentId })
  }

  for (const p of products) {
    if (p.subcategoryId && subIdRemap.has(p.subcategoryId)) {
      p.subcategoryId = subIdRemap.get(p.subcategoryId)
    }
  }

  return { products, categories: deduped.sort((a, b) => a.sortOrder - b.sortOrder) }
}
