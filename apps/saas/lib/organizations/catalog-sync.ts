/**
 * lib/organizations/catalog-sync.ts — carta central del grupo (F3): lógica
 * pura del ENVÍO a la carta de una sede y del armado desde una carta.
 *
 * Sin DB: recibe las categorías de la carta (objetos planos, con sus _id) y
 * devuelve las categorías nuevas + un informe. Quien llama guarda.
 *
 * Reglas del envío:
 *  · Plato vinculado (master.itemKey) → se actualiza EN EL MISMO LUGAR, con
 *    el mismo _id (recetas, pedidos y estadísticas apuntan a ese id). Las
 *    variantes, grupos y opciones conservan su _id si coinciden por nombre.
 *  · Sin vínculo y con «vincular por nombre» → el plato de la sede con el
 *    mismo nombre se vincula (no se duplica).
 *  · Si no existe → se crea en la categoría vinculada, o en la del mismo
 *    nombre, o en una nueva al final.
 *  · Qué se actualiza lo elige quien envía:
 *      info     → nombre, descripción, foto, etiquetas, IVA
 *      prices   → precio de salón, para llevar y de cada variante
 *      options  → variantes (las que no están en la carta central se quitan)
 *                 y grupos de opciones
 *    Un plato nuevo se crea completo.
 *  · Precio local: si la sede cambió el precio después del último envío
 *    (precio actual ≠ precio enviado), se conserva — salvo «pisar precios».
 *  · NUNCA se tocan: disponibilidad, pausas y stock, destacado, sugerencias,
 *    recompensa escondida, horarios, precio business y de mitad, ocultos,
 *    traducciones ni likes. No se borra ningún plato.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>

export type SyncField = 'info' | 'prices' | 'options'
export const SYNC_FIELDS: SyncField[] = ['info', 'prices', 'options']

export interface CatalogCategoryLike { key: string; name: string; description?: string; sortOrder?: number }
export interface CatalogItemLike {
  key: string
  categoryKey: string
  name: string
  description: string
  imageUrl: string
  price: number
  takeawayPrice: number | null
  variants: Array<{ name: string; price: number; takeawayPrice: number | null }>
  tags: string[]
  ivaRate: number | null
  customizationGroups: unknown[]
  isArchived?: boolean
}
export interface CatalogLike { categories: CatalogCategoryLike[]; items: CatalogItemLike[] }

export interface PushOptions {
  catalogId: string
  fields: SyncField[]
  linkByName: boolean
  overrideLocalPrices: boolean
  now: Date
}

export type ItemAction = 'created' | 'updated' | 'linked' | 'unchanged'

export interface ItemReport {
  itemKey: string
  name: string
  action: ItemAction
  categoryName: string
  /** Qué cambió, en palabras («nombre», «precio», «variantes»…). */
  changes: string[]
  /** La sede había cambiado el precio y se conservó. */
  localPriceKept: boolean
  price: { before: number | null; after: number }
  removedVariants: string[]
}

export interface PushPlan {
  categories: AnyObj[]
  items: ItemReport[]
  categoriesCreated: string[]
  changed: boolean
}

export const normName = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Copia profunda que conserva ObjectId (los deja como están) y Date. */
export function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (v instanceof Date) return new Date(v.getTime()) as unknown as T
  const anyV = v as AnyObj
  if (anyV._bsontype === 'ObjectId' || anyV._bsontype === 'ObjectID') return v
  if (Array.isArray(v)) return v.map(deepClone) as unknown as T
  const out: AnyObj = {}
  for (const [k, val] of Object.entries(anyV)) out[k] = deepClone(val)
  return out as T
}

/** Grupos de opciones de la carta central → forma de la carta, conservando _id por nombre. */
export function mergeGroups(master: unknown[], current: AnyObj[] | undefined): AnyObj[] {
  const byName = new Map((current ?? []).map((g) => [normName(g.name), g]))
  return (master as AnyObj[]).map((mg) => {
    const prev = byName.get(normName(mg.name))
    const optsByName = new Map(((prev?.options as AnyObj[]) ?? []).map((o) => [normName(o.name), o]))
    const group: AnyObj = {
      name: String(mg.name ?? '').trim(),
      type: mg.type ?? 'single',
      required: Boolean(mg.required),
      priceRule: mg.priceRule ?? 'sum',
      options: ((mg.options as AnyObj[]) ?? []).map((mo) => {
        const po = optsByName.get(normName(mo.name))
        const opt: AnyObj = {
          name: String(mo.name ?? '').trim(),
          extraPrice: Number(mo.extraPrice ?? 0),
          imageUrl: mo.imageUrl ?? po?.imageUrl ?? '',
          subGroups: mergeGroups((mo.subGroups as unknown[]) ?? [], po?.subGroups as AnyObj[] | undefined),
        }
        if (po?._id) opt._id = po._id
        return opt
      }),
    }
    if (mg.fixedCount !== undefined && mg.fixedCount !== null) group.fixedCount = mg.fixedCount
    if (prev?._id) group._id = prev._id
    return group
  })
}

/** Grupos de la carta → forma de la carta central (sin _id). */
export function stripGroupIds(groups: AnyObj[] | undefined): AnyObj[] {
  return (groups ?? []).map((g) => {
    const out: AnyObj = {
      name: g.name,
      type: g.type ?? 'single',
      required: Boolean(g.required),
      priceRule: g.priceRule ?? 'sum',
      options: ((g.options as AnyObj[]) ?? []).map((o) => ({
        name: o.name,
        extraPrice: Number(o.extraPrice ?? 0),
        imageUrl: o.imageUrl ?? '',
        subGroups: stripGroupIds(o.subGroups as AnyObj[] | undefined),
      })),
    }
    if (g.fixedCount !== undefined && g.fixedCount !== null) out.fixedCount = g.fixedCount
    return out
  })
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** Para comparar grupos sin los _id. */
const groupsShape = (g: AnyObj[] | undefined) => stripGroupIds(g)
const sameTags = (a: string[] | undefined, b: string[] | undefined) => sameJson([...(a ?? [])], [...(b ?? [])])

function variantPriceMap(variants: Array<{ name: string; price: number }>): Record<string, number> {
  return Object.fromEntries(variants.map((v) => [normName(v.name), v.price]))
}

function newMenuItem(m: CatalogItemLike, opts: PushOptions): AnyObj {
  const item: AnyObj = {
    name: m.name,
    description: m.description ?? '',
    price: m.price,
    imageUrl: m.imageUrl ?? '',
    tags: [...(m.tags ?? [])],
    ivaRate: m.ivaRate ?? null,
    isAvailable: true,
    isTakeawayAvailable: true,
    variants: m.variants.map((v) => ({ name: v.name, price: v.price, ...(v.takeawayPrice !== null ? { takeawayPrice: v.takeawayPrice } : {}) })),
    customizationGroups: mergeGroups(m.customizationGroups ?? [], []),
    master: {
      catalogId: opts.catalogId,
      itemKey: m.key,
      syncedAt: opts.now,
      syncedPrice: m.price,
      syncedTakeawayPrice: m.takeawayPrice,
      syncedVariantPrices: variantPriceMap(m.variants),
    },
  }
  if (m.takeawayPrice !== null) item.takeawayPrice = m.takeawayPrice
  return item
}

interface Slot { item: AnyObj; categoryName: string; category: AnyObj }

/**
 * Planifica el envío de `itemKeys` (platos de la carta central) a una carta.
 * No modifica `menuCategories`.
 */
export function planPush(menuCategories: AnyObj[], catalog: CatalogLike, itemKeys: string[], opts: PushOptions): PushPlan {
  const categories = deepClone(menuCategories ?? [])
  const fields = new Set(opts.fields)
  const wanted = new Set(itemKeys)
  const masterItems = catalog.items.filter((i) => wanted.has(i.key) && !i.isArchived)
  const masterCatByKey = new Map(catalog.categories.map((c) => [c.key, c]))

  // Índices de la carta: por vínculo y por nombre (solo platos sin vínculo).
  const byKey = new Map<string, Slot>()
  const byName = new Map<string, Slot>()
  for (const cat of categories) {
    const holders: AnyObj[] = [cat, ...((cat.subcategories as AnyObj[]) ?? [])]
    for (const h of holders) {
      for (const item of (h.items as AnyObj[]) ?? []) {
        const slot = { item, categoryName: String(cat.name ?? ''), category: cat }
        if (item.master?.itemKey && item.master.catalogId === opts.catalogId) {
          if (!byKey.has(item.master.itemKey)) byKey.set(item.master.itemKey, slot)
        } else if (!item.master?.itemKey) {
          const n = normName(item.name)
          if (n && !byName.has(n)) byName.set(n, slot)
        }
      }
    }
  }

  const reports: ItemReport[] = []
  const categoriesCreated: string[] = []
  const usedByName = new Set<AnyObj>()

  const categoryFor = (m: CatalogItemLike): AnyObj => {
    const mc = masterCatByKey.get(m.categoryKey)
    let cat = categories.find((c) => c.masterCategoryKey === m.categoryKey)
    if (!cat && mc) {
      cat = categories.find((c) => !c.masterCategoryKey && normName(c.name) === normName(mc.name))
      if (cat) cat.masterCategoryKey = m.categoryKey
    }
    if (!cat) {
      const nextOrder = categories.reduce((max, c) => Math.max(max, Number(c.sortOrder ?? 0)), -1) + 1
      cat = { name: mc?.name ?? 'Carta del grupo', description: mc?.description ?? '', imageUrl: '', isAvailable: true, sortOrder: nextOrder, items: [], subcategories: [], masterCategoryKey: m.categoryKey }
      categories.push(cat)
      categoriesCreated.push(cat.name)
    }
    return cat
  }

  for (const m of masterItems) {
    let slot = byKey.get(m.key)
    let linking = false
    if (!slot && opts.linkByName) {
      const candidate = byName.get(normName(m.name))
      if (candidate && !usedByName.has(candidate.item)) {
        slot = candidate
        linking = true
        usedByName.add(candidate.item)
        // Su categoría pasa a ser la de la carta central (si ninguna lo es):
        // los platos nuevos de esa categoría caen juntos, sin duplicarla.
        if (!candidate.category.masterCategoryKey && !categories.some((c) => c.masterCategoryKey === m.categoryKey)) {
          candidate.category.masterCategoryKey = m.categoryKey
        }
      }
    }

    if (!slot) {
      const cat = categoryFor(m)
      const holder: AnyObj = ((cat.items as AnyObj[]) ?? []).length === 0 && ((cat.subcategories as AnyObj[]) ?? []).length > 0 ? cat.subcategories[0] : cat
      holder.items = holder.items ?? []
      holder.items.push(newMenuItem(m, opts))
      reports.push({ itemKey: m.key, name: m.name, action: 'created', categoryName: String(cat.name), changes: ['plato nuevo'], localPriceKept: false, price: { before: null, after: m.price }, removedVariants: [] })
      continue
    }

    const item = slot.item
    const prevLink = linking ? null : (item.master as AnyObj | null)
    const changes: string[] = []
    const removedVariants: string[] = []
    let localPriceKept = false
    const priceBefore = typeof item.price === 'number' ? item.price : null

    if (fields.has('info')) {
      if (item.name !== m.name) { item.name = m.name; changes.push('nombre') }
      if ((item.description ?? '') !== (m.description ?? '')) { item.description = m.description ?? ''; changes.push('descripción') }
      if ((item.imageUrl ?? '') !== (m.imageUrl ?? '')) { item.imageUrl = m.imageUrl ?? ''; changes.push('foto') }
      if (!sameTags(item.tags, m.tags)) { item.tags = [...(m.tags ?? [])]; changes.push('etiquetas') }
      if ((item.ivaRate ?? null) !== (m.ivaRate ?? null)) { item.ivaRate = m.ivaRate ?? null; changes.push('IVA') }
    }

    // Precio enviado la última vez (para detectar cambios locales).
    let syncedPrice: number | null = prevLink?.syncedPrice ?? null
    let syncedTakeaway: number | null = prevLink?.syncedTakeawayPrice ?? null
    const syncedVariants: Record<string, number> = { ...((prevLink?.syncedVariantPrices as Record<string, number>) ?? {}) }
    const localEdited = (current: unknown, synced: number | null) => synced !== null && typeof current === 'number' && current !== synced

    if (fields.has('prices')) {
      if (localEdited(item.price, prevLink?.syncedPrice ?? null) && !opts.overrideLocalPrices) {
        localPriceKept = true
      } else {
        if (item.price !== m.price) { item.price = m.price; changes.push('precio') }
        syncedPrice = m.price
      }
      if (m.takeawayPrice !== null) {
        if (localEdited(item.takeawayPrice, prevLink?.syncedTakeawayPrice ?? null) && !opts.overrideLocalPrices) {
          localPriceKept = true
        } else {
          if (item.takeawayPrice !== m.takeawayPrice) { item.takeawayPrice = m.takeawayPrice; changes.push('precio para llevar') }
          syncedTakeaway = m.takeawayPrice
        }
      }
    }

    if (fields.has('options')) {
      const current = ((item.variants as AnyObj[]) ?? [])
      const byVName = new Map(current.map((v) => [normName(v.name), v]))
      const next = m.variants.map((mv) => {
        const prev = byVName.get(normName(mv.name))
        if (!prev) return { name: mv.name, price: mv.price, ...(mv.takeawayPrice !== null ? { takeawayPrice: mv.takeawayPrice } : {}) }
        const v = { ...prev, name: mv.name }
        return v
      })
      for (const v of current) if (!m.variants.some((mv) => normName(mv.name) === normName(v.name))) removedVariants.push(String(v.name))
      const shape = (list: AnyObj[]) => list.map((v) => normName(v.name))
      if (!sameJson(shape(current), shape(next)) || current.some((v, i) => next[i] && v.name !== next[i].name)) changes.push('variantes')
      item.variants = next
      for (const mv of m.variants) if (!byVName.has(normName(mv.name))) syncedVariants[normName(mv.name)] = mv.price

      const mergedGroups = mergeGroups(m.customizationGroups ?? [], item.customizationGroups as AnyObj[] | undefined)
      if (!sameJson(groupsShape(item.customizationGroups as AnyObj[] | undefined), groupsShape(mergedGroups))) changes.push('opciones')
      item.customizationGroups = mergedGroups
    }

    if (fields.has('prices')) {
      let variantChanged = false
      for (const v of (item.variants as AnyObj[]) ?? []) {
        const mv = m.variants.find((x) => normName(x.name) === normName(v.name))
        if (!mv) continue
        const key = normName(v.name)
        const synced = prevLink ? (syncedVariants[key] ?? null) : null
        if (localEdited(v.price, synced) && !opts.overrideLocalPrices) { localPriceKept = true; continue }
        if (v.price !== mv.price) { v.price = mv.price; variantChanged = true }
        if (mv.takeawayPrice !== null && v.takeawayPrice !== mv.takeawayPrice) { v.takeawayPrice = mv.takeawayPrice; variantChanged = true }
        syncedVariants[key] = mv.price
      }
      if (variantChanged) changes.push('precio de variantes')
    }

    const action: ItemAction = linking ? 'linked' : changes.length ? 'updated' : 'unchanged'
    if (action !== 'unchanged' || !item.master) {
      item.master = {
        catalogId: opts.catalogId,
        itemKey: m.key,
        syncedAt: opts.now,
        syncedPrice,
        syncedTakeawayPrice: syncedTakeaway,
        syncedVariantPrices: syncedVariants,
      }
    }
    reports.push({
      itemKey: m.key,
      name: m.name,
      action,
      categoryName: slot.categoryName,
      changes,
      localPriceKept,
      price: { before: priceBefore, after: typeof item.price === 'number' ? item.price : m.price },
      removedVariants,
    })
  }

  return {
    categories,
    items: reports,
    categoriesCreated,
    changed: categoriesCreated.length > 0 || reports.some((r) => r.action !== 'unchanged'),
  }
}

export function summarizePlan(plan: PushPlan) {
  const count = (a: ItemAction) => plan.items.filter((i) => i.action === a).length
  return {
    created: count('created'),
    updated: count('updated'),
    linked: count('linked'),
    unchanged: count('unchanged'),
    localPricesKept: plan.items.filter((i) => i.localPriceKept).length,
    categoriesCreated: plan.categoriesCreated.length,
  }
}

// ---------------------------------------------------------------------------
// Armar la carta central desde la carta de una sede
// ---------------------------------------------------------------------------

export interface ImportResult {
  categories: CatalogCategoryLike[]
  items: CatalogItemLike[]
  /** _id del plato de la carta de origen → key del plato central (para vincularlo). */
  links: Array<{ menuItemId: string; itemKey: string }>
  /** Nombres repetidos que no se importaron (ya había uno con ese nombre). */
  skippedDuplicates: string[]
}

/**
 * Convierte la carta de una sede en categorías y platos de la carta central.
 * Las subcategorías se aplanan en su categoría. Platos que ya están en la
 * carta central (mismo nombre) o repetidos no se importan.
 */
export function catalogFromMenu(menuCategories: AnyObj[], existing: CatalogLike, newKey: () => string): ImportResult {
  const categories: CatalogCategoryLike[] = []
  const items: CatalogItemLike[] = []
  const links: ImportResult['links'] = []
  const skippedDuplicates: string[] = []
  const seen = new Set(existing.items.filter((i) => !i.isArchived).map((i) => normName(i.name)))
  const catByName = new Map(existing.categories.map((c) => [normName(c.name), c]))
  let order = existing.categories.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), -1) + 1

  const sorted = [...(menuCategories ?? [])].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
  for (const cat of sorted) {
    const name = String(cat.name ?? '').trim()
    if (!name) continue
    let mc = catByName.get(normName(name))
    if (!mc) {
      mc = { key: newKey(), name, description: String(cat.description ?? ''), sortOrder: order++ }
      catByName.set(normName(name), mc)
      categories.push(mc)
    }
    const all: AnyObj[] = [...((cat.items as AnyObj[]) ?? []), ...((cat.subcategories as AnyObj[]) ?? []).flatMap((s) => (s.items as AnyObj[]) ?? [])]
    for (const it of all) {
      const n = normName(it.name)
      if (!n) continue
      if (seen.has(n)) { skippedDuplicates.push(String(it.name)); continue }
      seen.add(n)
      const key = newKey()
      items.push({
        key,
        categoryKey: mc.key,
        name: String(it.name).trim(),
        description: String(it.description ?? ''),
        imageUrl: String(it.imageUrl ?? ''),
        price: Number(it.price ?? 0),
        takeawayPrice: typeof it.takeawayPrice === 'number' ? it.takeawayPrice : null,
        variants: ((it.variants as AnyObj[]) ?? []).map((v) => ({ name: String(v.name), price: Number(v.price ?? 0), takeawayPrice: typeof v.takeawayPrice === 'number' ? v.takeawayPrice : null })),
        tags: [...((it.tags as string[]) ?? [])],
        ivaRate: typeof it.ivaRate === 'number' ? it.ivaRate : null,
        customizationGroups: stripGroupIds(it.customizationGroups as AnyObj[] | undefined),
        isArchived: false,
      })
      if (it._id) links.push({ menuItemId: String(it._id), itemKey: key })
    }
  }
  return { categories, items, links, skippedDuplicates }
}

/** Marca como vinculados los platos de la carta de origen (precios enviados = los actuales). */
export function linkSourceItems(menuCategories: AnyObj[], links: ImportResult['links'], catalogId: string, now: Date): AnyObj[] {
  const categories = deepClone(menuCategories ?? [])
  const byId = new Map(links.map((l) => [l.menuItemId, l.itemKey]))
  for (const cat of categories) {
    for (const h of [cat, ...((cat.subcategories as AnyObj[]) ?? [])]) {
      for (const item of (h.items as AnyObj[]) ?? []) {
        const key = item._id ? byId.get(String(item._id)) : undefined
        if (!key) continue
        item.master = {
          catalogId,
          itemKey: key,
          syncedAt: now,
          syncedPrice: typeof item.price === 'number' ? item.price : null,
          syncedTakeawayPrice: typeof item.takeawayPrice === 'number' ? item.takeawayPrice : null,
          syncedVariantPrices: variantPriceMap(((item.variants as AnyObj[]) ?? []).map((v) => ({ name: String(v.name), price: Number(v.price ?? 0) }))),
        }
      }
    }
  }
  return categories
}
