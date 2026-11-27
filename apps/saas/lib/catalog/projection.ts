// ============================================================================
// Proyección del catálogo comercial a la carta de una sede (multi-rubro)
// ============================================================================
// El catálogo maestro (CatalogProduct, por marca) es la fuente de verdad. Para
// vender con el checkout, el POS y la carta pública de siempre, cada producto
// se proyecta como un ítem de Menu en cada sede donde se vende.
//
// Reglas:
//   · Solo se tocan ítems con `catalogLink` y categorías con `catalogCategory`.
//     Los platos y categorías de la carta quedan exactamente como estaban.
//   · El ítem conserva su _id (por productId) y cada variante el suyo (por
//     variantId): carritos, POS y pedidos siguen apuntando a lo mismo.
//   · Una pausa manual hecha desde «Artículos pausados» se respeta.
//   · Variante sin sedes cargadas = se vende en todas a precio de lista.
//     Con sedes cargadas = solo en esas, con su precio (o el de lista).
//   · Un producto con una sola variante se muestra sin selector; su variante
//     queda en catalogLink.defaultVariantId para identificarla en el pedido.
//
// Función pura (sin Mongo): la usa lib/catalog/service y los tests.
// ============================================================================

export interface ProjectionOffer {
  locationId: unknown
  price?: number | null
  available?: boolean
}

export interface ProjectionVariant {
  _id: unknown
  code: string
  name?: string
  options?: Array<{ name: string; value: string }>
  listPrice: number
  offers?: ProjectionOffer[]
  isActive?: boolean
}

export interface ProjectionProduct {
  _id: unknown
  kind?: 'product' | 'service'
  name: string
  description?: string
  category?: string
  brand?: string
  model?: string
  attributes?: Array<{ name: string; value: string }>
  imageUrl?: string
  status?: 'active' | 'archived'
  sortOrder?: number
  variants: ProjectionVariant[]
}

type AnyObj = Record<string, any>

export const DEFAULT_PRODUCT_CATEGORY = 'Productos'
export const DEFAULT_SERVICE_CATEGORY = 'Servicios'

export function variantLabel(v: ProjectionVariant): string {
  if (v.name && v.name.trim()) return v.name.trim()
  const opts = (v.options ?? []).map(o => o.value).filter(Boolean)
  return opts.length ? opts.join(' · ') : v.code
}

interface SoldVariant {
  id: string
  name: string
  price: number
  available: boolean
}

/** Variantes que se venden en la sede, con su precio. null = el producto no se vende ahí. */
export function variantsForLocation(product: ProjectionProduct, locationId: string): SoldVariant[] {
  const out: SoldVariant[] = []
  for (const v of product.variants ?? []) {
    if (v.isActive === false) continue
    const offers = v.offers ?? []
    if (offers.length === 0) {
      out.push({ id: String(v._id), name: variantLabel(v), price: v.listPrice, available: true })
      continue
    }
    const offer = offers.find(o => String(o.locationId) === locationId)
    if (!offer) continue
    out.push({
      id: String(v._id),
      name: variantLabel(v),
      price: offer.price ?? v.listPrice,
      available: offer.available !== false,
    })
  }
  return out
}

function isProjected(item: AnyObj): boolean {
  return Boolean(item?.catalogLink?.productId)
}

/** Ítems proyectados existentes, por productId (para conservar _id, likes y pausas). */
function collectProjected(categories: AnyObj[]): Map<string, AnyObj> {
  const map = new Map<string, AnyObj>()
  for (const c of categories) {
    for (const it of c.items ?? []) if (isProjected(it)) map.set(String(it.catalogLink.productId), it)
    for (const sc of c.subcategories ?? []) for (const it of sc.items ?? []) if (isProjected(it)) map.set(String(it.catalogLink.productId), it)
  }
  return map
}

function buildItem(product: ProjectionProduct, sold: SoldVariant[], previous: AnyObj | undefined, now: Date): AnyObj {
  const available = sold.filter(v => v.available)
  const shown = available.length ? available : sold
  const minPrice = Math.min(...shown.map(v => v.price))
  const single = shown.length === 1
  const prevVariants = new Map<string, AnyObj>()
  for (const pv of previous?.variants ?? []) if (pv?.variantId) prevVariants.set(String(pv.variantId), pv)

  const manualPause = previous?.pausedReason === 'manual'
  const item: AnyObj = {
    ...(previous?._id ? { _id: previous._id } : {}),
    name: product.name,
    description: product.description ?? '',
    price: single ? shown[0].price : minPrice,
    imageUrl: product.imageUrl ?? '',
    isAvailable: manualPause ? false : available.length > 0,
    pausedReason: manualPause ? 'manual' : null,
    pausedAt: manualPause ? previous?.pausedAt ?? null : null,
    pausedBy: manualPause ? previous?.pausedBy ?? null : null,
    isTakeawayAvailable: true,
    isBusinessAvailable: false,
    likesCount: previous?.likesCount ?? 0,
    tags: product.brand ? [product.brand] : [],
    isFeatured: previous?.isFeatured ?? false,
    customizationGroups: [],
    variants: single
      ? []
      : shown.map(v => ({
        ...(prevVariants.get(v.id)?._id ? { _id: prevVariants.get(v.id)!._id } : {}),
        name: v.name,
        price: v.price,
        variantId: v.id,
      })),
    catalogLink: {
      productId: String(product._id),
      defaultVariantId: single ? shown[0].id : null,
      kind: product.kind === 'service' ? 'service' : 'product',
      brand: product.brand ?? '',
      model: product.model ?? '',
      specs: (product.attributes ?? []).map(a => ({ name: a.name, value: a.value })),
      syncedAt: now,
    },
  }
  return item
}

export interface ProjectionResult {
  categories: AnyObj[]
  projectedItems: number
  changed: boolean
}

/**
 * Devuelve las categorías de la carta de la sede con el catálogo proyectado.
 * No muta la entrada.
 */
export function projectCatalogToMenu(
  menuCategories: AnyObj[],
  products: ProjectionProduct[],
  locationId: string,
  now: Date = new Date(),
): ProjectionResult {
  const source: AnyObj[] = JSON.parse(JSON.stringify(menuCategories ?? []))
  const previous = collectProjected(menuCategories ?? [])

  // 1. Sacar los ítems proyectados de donde estén (la carta queda intacta).
  const categories: AnyObj[] = source.map(c => ({
    ...c,
    items: (c.items ?? []).filter((it: AnyObj) => !isProjected(it)),
    ...(Array.isArray(c.subcategories)
      ? { subcategories: c.subcategories.map((sc: AnyObj) => ({ ...sc, items: (sc.items ?? []).filter((it: AnyObj) => !isProjected(it)) })) }
      : {}),
  }))
  // Volver a usar los _id de las categorías originales (JSON los volvió texto).
  categories.forEach((c, i) => { if (menuCategories[i]?._id) c._id = menuCategories[i]._id })

  // 2. Agrupar los productos que se venden en la sede por categoría.
  const byCategory = new Map<string, AnyObj[]>()
  const ordered = [...products]
    .filter(p => p.status !== 'archived')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'es'))
  let projectedItems = 0
  for (const p of ordered) {
    const sold = variantsForLocation(p, locationId)
    if (sold.length === 0) continue
    const catName = (p.category ?? '').trim() || (p.kind === 'service' ? DEFAULT_SERVICE_CATEGORY : DEFAULT_PRODUCT_CATEGORY)
    const list = byCategory.get(catName) ?? []
    list.push(buildItem(p, sold, previous.get(String(p._id)), now))
    byCategory.set(catName, list)
    projectedItems++
  }

  // 3. Volcar en categorías del catálogo (se reutilizan por nombre; se crean
  //    al final si no existen; las que quedan vacías se quitan).
  let maxSort = categories.reduce((m, c) => Math.max(m, Number(c.sortOrder) || 0), 0)
  const usedNames = new Set<string>()
  const result: AnyObj[] = []
  for (const c of categories) {
    if (!c.catalogCategory) { result.push(c); continue }
    const items = byCategory.get(c.name)
    if (!items || items.length === 0) continue
    result.push({ ...c, items })
    usedNames.add(c.name)
  }
  for (const [name, items] of byCategory) {
    if (usedNames.has(name)) continue
    result.push({
      name,
      description: '',
      imageUrl: '',
      isAvailable: true,
      isBusinessAvailable: false,
      sortOrder: ++maxSort,
      items,
      catalogCategory: true,
    })
  }

  const before = JSON.stringify(stripVolatile(menuCategories ?? []))
  const after = JSON.stringify(stripVolatile(result))
  return { categories: result, projectedItems, changed: before !== after }
}

/** Para comparar sin que la fecha de sincronización cuente como cambio. */
function stripVolatile(categories: AnyObj[]): AnyObj[] {
  return JSON.parse(JSON.stringify(categories, (k, v) => (k === 'syncedAt' ? undefined : v)))
}
