/**
 * Formato de importación de carta — único para todo el SaaS:
 *  · Menú › Importar carta (ImportMenuModal) y Superadmin › Sedes,
 *  · alta rápida de comercios y Superadmin › importar carta,
 *  · lectura de carta por foto con IA (plan Élite).
 *
 * Unidad de precio según la versión:
 *  · "version": 1  → precios en PESOS (12000 = $12.000). Es el formato actual.
 *  · sin version   → precios en CENTAVOS tal cual (JSON viejos; se mantiene
 *                     el comportamiento que tenía el importador).
 *
 * Campos soportados por producto: name, description, price, takeawayPrice,
 * businessPrice, originalPrice, takeawayOriginalPrice, tags, isFeatured,
 * isAvailable, isTakeawayAvailable, isBusinessAvailable, imageUrl, printRole,
 * suggestWith, variants, customizationGroups (con subGroups), availabilityMode,
 * availabilitySchedule. Categorías y subcategorías: name, description,
 * imageUrl, items, customizationGroups, availabilityMode, availabilitySchedule
 * (+ isAvailable, isBusinessAvailable, sortOrder, printRole en categorías).
 */

export interface ImportOption { name: string; extraPrice?: number; subGroups?: ImportGroup[] }
export interface ImportGroup { name: string; type?: 'single' | 'multiple'; required?: boolean; options: ImportOption[] }
export interface ImportVariant {
  name: string; price: number; takeawayPrice?: number; businessPrice?: number
  originalPrice?: number; takeawayOriginalPrice?: number; nameTranslations?: { en: string }
}
export interface ImportAvailabilitySlot { days: number[]; timeStart: string; timeEnd: string }
export interface ImportItem {
  name: string; description?: string; price: number
  takeawayPrice?: number; businessPrice?: number; originalPrice?: number; takeawayOriginalPrice?: number
  tags?: string[]; isFeatured?: boolean; isAvailable?: boolean; isTakeawayAvailable?: boolean; isBusinessAvailable?: boolean
  imageUrl?: string; printRole?: string; suggestWith?: string[]
  variants?: ImportVariant[]; customizationGroups?: ImportGroup[]
  availabilityMode?: 'always' | 'scheduled'; availabilitySchedule?: ImportAvailabilitySlot[]
}
export interface ImportSubCategory {
  name: string; description?: string; imageUrl?: string; items: ImportItem[]
  customizationGroups?: ImportGroup[]; availabilityMode?: 'always' | 'scheduled'; availabilitySchedule?: ImportAvailabilitySlot[]
}
export interface ImportCategory {
  name: string; description?: string; imageUrl?: string; isAvailable?: boolean; isBusinessAvailable?: boolean
  sortOrder?: number; printRole?: string; customizationGroups?: ImportGroup[]
  availabilityMode?: 'always' | 'scheduled'; availabilitySchedule?: ImportAvailabilitySlot[]
  items: ImportItem[]; subcategories?: ImportSubCategory[]
}

const PRICE_KEYS = ['price', 'takeawayPrice', 'businessPrice', 'originalPrice', 'takeawayOriginalPrice'] as const

/** Copia con los precios en centavos: ×100 si la carta viene en pesos (version 1). */
export function toCentsCategories(categories: ImportCategory[], version: number | undefined): ImportCategory[] {
  if (version !== 1) return categories
  const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : v)
  const groups = (gs?: ImportGroup[]): ImportGroup[] | undefined =>
    gs?.map(g => ({ ...g, options: (g.options ?? []).map(o => ({ ...o, extraPrice: cents(o.extraPrice) as number | undefined, subGroups: groups(o.subGroups) })) }))
  const item = (it: ImportItem): ImportItem => {
    const out: Record<string, unknown> = { ...it }
    for (const k of PRICE_KEYS) if (k in out) out[k] = cents(out[k])
    if (Array.isArray(it.variants)) out.variants = it.variants.map(v => { const vv: Record<string, unknown> = { ...v }; for (const k of PRICE_KEYS) if (k in vv) vv[k] = cents(vv[k]); return vv })
    if (it.customizationGroups) out.customizationGroups = groups(it.customizationGroups)
    return out as unknown as ImportItem
  }
  return categories.map(c => ({
    ...c,
    customizationGroups: groups(c.customizationGroups),
    items: (c.items ?? []).map(item),
    subcategories: c.subcategories?.map(s => ({ ...s, customizationGroups: groups(s.customizationGroups), items: (s.items ?? []).map(item) })),
  }))
}

/** Construye customizationGroups de forma recursiva (resuelve subGroups). */
export function buildGroups(groups: ImportGroup[] = []): Array<Record<string, unknown>> {
  return groups.map(g => ({
    name: g.name,
    type: g.type ?? 'single',
    required: g.required ?? false,
    options: (g.options ?? []).map(o => ({ name: o.name, extraPrice: o.extraPrice ?? 0, subGroups: buildGroups(o.subGroups) })),
  }))
}

function buildItem(item: ImportItem): Record<string, unknown> {
  return {
    name: item.name.trim(),
    description: item.description?.trim() ?? '',
    price: item.price,
    takeawayPrice: item.takeawayPrice,
    businessPrice: item.businessPrice,
    originalPrice: item.originalPrice,
    takeawayOriginalPrice: item.takeawayOriginalPrice,
    tags: Array.isArray(item.tags) ? item.tags.map(t => String(t).trim()).filter(Boolean) : [],
    isFeatured: item.isFeatured ?? false,
    isAvailable: item.isAvailable ?? true,
    isTakeawayAvailable: item.isTakeawayAvailable ?? true,
    isBusinessAvailable: item.isBusinessAvailable ?? true,
    imageUrl: item.imageUrl ?? '',
    printRole: item.printRole ?? 'kitchen',
    suggestWith: Array.isArray(item.suggestWith) ? item.suggestWith : [],
    variants: (item.variants ?? []).map(v => ({
      name: v.name, price: v.price, takeawayPrice: v.takeawayPrice, businessPrice: v.businessPrice,
      originalPrice: v.originalPrice, takeawayOriginalPrice: v.takeawayOriginalPrice, nameTranslations: v.nameTranslations,
    })),
    customizationGroups: buildGroups(item.customizationGroups),
    availabilityMode: item.availabilityMode ?? 'always',
    availabilitySchedule: item.availabilityMode === 'scheduled' ? (item.availabilitySchedule ?? []) : [],
  }
}

/** Categorías listas para Menu.categories (precios ya en centavos). */
export function buildImportCategories(categories: ImportCategory[], startOrder = 0): Array<Record<string, unknown>> {
  return categories.map((cat, catIndex) => ({
    name: cat.name.trim(),
    description: cat.description?.trim() ?? '',
    imageUrl: cat.imageUrl ?? '',
    isAvailable: cat.isAvailable ?? true,
    isBusinessAvailable: cat.isBusinessAvailable ?? true,
    sortOrder: startOrder + (cat.sortOrder ?? catIndex),
    printRole: cat.printRole ?? 'kitchen',
    customizationGroups: buildGroups(cat.customizationGroups),
    availabilityMode: cat.availabilityMode ?? 'always',
    availabilitySchedule: cat.availabilityMode === 'scheduled' ? (cat.availabilitySchedule ?? []) : [],
    items: (cat.items ?? []).map(buildItem),
    subcategories: cat.subcategories?.map((sub, subIndex) => ({
      name: sub.name.trim(),
      description: sub.description?.trim() ?? '',
      imageUrl: sub.imageUrl ?? '',
      sortOrder: subIndex,
      items: (sub.items ?? []).map(buildItem),
      customizationGroups: buildGroups(sub.customizationGroups),
      availabilityMode: sub.availabilityMode ?? 'always',
      availabilitySchedule: sub.availabilityMode === 'scheduled' ? (sub.availabilitySchedule ?? []) : [],
    })) ?? [],
  }))
}

/** Validación mínima del importador clásico (nombre en categorías y productos, precio numérico ≥ 0). */
export function validateImportCategories(categories: unknown): categories is ImportCategory[] {
  if (!Array.isArray(categories) || categories.length === 0) return false
  const okItems = (items: unknown) => Array.isArray(items) && items.every(i => i && typeof i.name === 'string' && i.name.trim() && typeof i.price === 'number' && i.price >= 0)
  return categories.every(cat =>
    cat && typeof cat.name === 'string' && cat.name.trim() && okItems(cat.items) &&
    (!cat.subcategories || (Array.isArray(cat.subcategories) && cat.subcategories.every((s: { name?: unknown; items?: unknown }) => typeof s?.name === 'string' && String(s.name).trim() && okItems(s.items)))),
  )
}
