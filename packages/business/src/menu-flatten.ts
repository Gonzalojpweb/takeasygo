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
  imageUrl?: string
  customizationGroups?: RawCustomizationGroup[]
  disabledGroupIds?: string[]
  disabledOptionIds?: string[]
  disabledVariantNames?: string[]
  variants?: Array<{ name: string; customizationGroups?: RawCustomizationGroup[] }>
}

export interface RawMenuCategory {
  _id?: unknown
  name: string
  sortOrder?: number
  isAvailable?: boolean
  customizationGroups?: RawCustomizationGroup[]
  items?: RawMenuItem[]
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

export function flattenMenu(doc: RawMenu): FlatMenuResult {
  const products: Product[] = []
  const categories: MenuCategory[] = []
  const tenantId = oid(doc.tenantId)

  for (const cat of doc.categories ?? []) {
    categories.push({
      id: oid(cat._id),
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      isVisible: cat.isAvailable ?? true,
    })

    // Los grupos de customización de la categoría se heredan a cada item.
    const inheritedGroups = cat.customizationGroups ?? []

    for (const item of cat.items ?? []) {
      const disabledGroups = item.disabledGroupIds ?? []
      const disabledOptions = item.disabledOptionIds ?? []

      const allGroups = [...inheritedGroups, ...(item.customizationGroups ?? [])].filter(
        (g) => !disabledGroups.includes(oid(g._id)) && !disabledGroups.includes(g.name)
      )

      // Los grupos propios de cada variante entran solo si nadie los declaró
      // antes (dedup por nombre) y el item no los desactivó.
      const variants = (item.variants ?? []).filter(
        (v) => !(item.disabledVariantNames ?? []).includes(v.name)
      )
      const seenGroupNames = new Set(allGroups.map((g) => g.name))
      for (const variant of variants) {
        for (const vg of variant.customizationGroups ?? []) {
          if (
            !seenGroupNames.has(vg.name) &&
            !disabledGroups.includes(oid(vg._id)) &&
            !disabledGroups.includes(vg.name)
          ) {
            allGroups.push(vg)
            seenGroupNames.add(vg.name)
          }
        }
      }

      const modifiers: ProductModifier[] | undefined =
        allGroups.length > 0
          ? allGroups.map((g) => {
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
            })
          : undefined

      const product: Product = {
        id: oid(item._id),
        tenantId,
        name: item.name,
        description: item.description ?? '',
        price: item.price,
        category: cat.name,
        isAvailable: item.isAvailable ?? true,
        modifiers,
      }
      if (item.halfPrice !== undefined && item.halfPrice !== null) {
        product.halfPrice = item.halfPrice
      }
      if (item.imageUrl) product.imageUrl = item.imageUrl

      products.push(product)
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
  const byCategory = new Map<string, Product[]>()
  for (const p of products) {
    const list = byCategory.get(p.category) ?? []
    list.push(p)
    byCategory.set(p.category, list)
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

  const seen = new Set<string>()
  const deduped = categories.filter((c) => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })

  return { products, categories: deduped.sort((a, b) => a.sortOrder - b.sortOrder) }
}
