// ============================================================================
// Personalizaciones ocultas del menú (vista «Artículos pausados» del admin)
// ============================================================================
// Una personalización se oculta guardando su nombre (o su _id, en datos viejos)
// en listas del menú, con la misma semántica que el menú público
// (lib/menu-sanitize.ts y CustomizationSheet.computeActiveGroups):
//   · categoría.disabledGroupIds / disabledOptionIds → aplican a los grupos de
//     la categoría y a los de sus subcategorías.
//   · ítem.disabledGroupIds / disabledOptionIds → aplican a los grupos que ve
//     ese ítem (los propios, los de sus variantes y los heredados).
//   · ítem.disabledVariantNames → variantes ocultas del ítem.
// Este archivo es puro: arma la lista legible para el admin.
// ============================================================================

export type PausedCustomizationKind = 'group' | 'option' | 'variant'

export interface PausedCustomizationData {
  /** Valor guardado en la lista (nombre o _id): es lo que se quita al reactivar. */
  key: string
  kind: PausedCustomizationKind
  /** Nombre legible (si la clave era un _id, el nombre actual). */
  label: string
  /** Grupos a los que pertenece la opción (vacío para grupos y variantes). */
  parentGroups: string[]
  /** Dónde está definida en el menú: «Categoría», «Subcategoría X», «Ítem», «Variante Y». */
  foundIn: string[]
  owner: 'category' | 'item'
  categoryId: string
  categoryName: string
  /** Subcategoría del ítem (solo owner = 'item'). */
  subcategoryName: string | null
  itemId: string | null
  itemName: string | null
  locationId: string
  locationName: string
}

interface Group { _id?: unknown; name?: string; options?: Option[] }
interface Option { _id?: unknown; name?: string; subGroups?: Group[] }
interface Item {
  _id?: unknown; name?: string; customizationGroups?: Group[]
  variants?: Array<{ name?: string; customizationGroups?: Group[] }>
  disabledGroupIds?: string[]; disabledOptionIds?: string[]; disabledVariantNames?: string[]
}
interface Subcategory { name?: string; customizationGroups?: Group[]; items?: Item[] }
interface Category {
  _id?: unknown; name?: string; customizationGroups?: Group[]; items?: Item[]; subcategories?: Subcategory[]
  disabledGroupIds?: string[]; disabledOptionIds?: string[]
}

interface Source { label: string; groups: Group[] }

const idOf = (v: unknown) => (v == null ? '' : String(v))
const matches = (key: string, node: { _id?: unknown; name?: string }) => key === idOf(node._id) || key === (node.name ?? '')

/** Busca la clave como grupo (incluye subgrupos) en las fuentes dadas. */
function findGroup(key: string, sources: Source[]) {
  let label: string | null = null
  const foundIn = new Set<string>()
  const visit = (groups: Group[], where: string) => {
    for (const g of groups) {
      if (matches(key, g)) { label ??= g.name ?? key; foundIn.add(where) }
      for (const o of g.options ?? []) visit(o.subGroups ?? [], where)
    }
  }
  for (const s of sources) visit(s.groups, s.label)
  return { label, foundIn: [...foundIn] }
}

/** Busca la clave como opción (incluye opciones de subgrupos) en las fuentes dadas. */
function findOption(key: string, sources: Source[]) {
  let label: string | null = null
  const foundIn = new Set<string>()
  const parents = new Set<string>()
  const visit = (groups: Group[], where: string) => {
    for (const g of groups) {
      for (const o of g.options ?? []) {
        if (matches(key, o)) { label ??= o.name ?? key; foundIn.add(where); if (g.name) parents.add(g.name) }
        visit(o.subGroups ?? [], where)
      }
    }
  }
  for (const s of sources) visit(s.groups, s.label)
  return { label, foundIn: [...foundIn], parentGroups: [...parents] }
}

function unique(list: string[] | undefined): string[] {
  return [...new Set((list ?? []).filter((v) => typeof v === 'string' && v.trim() !== ''))]
}

export function collectPausedCustomizations(
  categories: Category[],
  location: { id: string; name: string },
): PausedCustomizationData[] {
  const out: PausedCustomizationData[] = []

  for (const cat of categories ?? []) {
    const categoryId = idOf(cat._id)
    const categoryName = cat.name ?? ''
    const base = { categoryId, categoryName, locationId: location.id, locationName: location.name }
    const catSources: Source[] = [
      { label: 'Categoría', groups: cat.customizationGroups ?? [] },
      ...(cat.subcategories ?? []).map((s) => ({ label: `Subcategoría ${s.name ?? ''}`.trim(), groups: s.customizationGroups ?? [] })),
    ]

    // ── Ocultas a nivel categoría (alcanzan a sus subcategorías) ──────────
    for (const key of unique(cat.disabledGroupIds)) {
      const r = findGroup(key, catSources)
      out.push({ ...base, key, kind: 'group', label: r.label ?? key, parentGroups: [], foundIn: r.foundIn, owner: 'category', subcategoryName: null, itemId: null, itemName: null })
    }
    for (const key of unique(cat.disabledOptionIds)) {
      const r = findOption(key, catSources)
      out.push({ ...base, key, kind: 'option', label: r.label ?? key, parentGroups: r.parentGroups, foundIn: r.foundIn, owner: 'category', subcategoryName: null, itemId: null, itemName: null })
    }

    // ── Ocultas a nivel ítem ──────────────────────────────────────────────
    const items: Array<{ item: Item; sub: Subcategory | null }> = [
      ...(cat.items ?? []).map((item) => ({ item, sub: null })),
      ...(cat.subcategories ?? []).flatMap((sub) => (sub.items ?? []).map((item) => ({ item, sub }))),
    ]
    for (const { item, sub } of items) {
      const itemBase = { ...base, owner: 'item' as const, subcategoryName: sub?.name ?? null, itemId: idOf(item._id), itemName: item.name ?? '' }
      const sources: Source[] = [
        { label: 'Ítem', groups: item.customizationGroups ?? [] },
        ...(item.variants ?? []).map((v) => ({ label: `Variante ${v.name ?? ''}`.trim(), groups: v.customizationGroups ?? [] })),
        { label: 'Categoría', groups: cat.customizationGroups ?? [] },
        ...(sub ? [{ label: `Subcategoría ${sub.name ?? ''}`.trim(), groups: sub.customizationGroups ?? [] }] : []),
      ]
      for (const key of unique(item.disabledVariantNames)) {
        const exists = (item.variants ?? []).some((v) => v.name === key)
        out.push({ ...itemBase, key, kind: 'variant', label: key, parentGroups: [], foundIn: exists ? ['Ítem'] : [] })
      }
      for (const key of unique(item.disabledGroupIds)) {
        const r = findGroup(key, sources)
        out.push({ ...itemBase, key, kind: 'group', label: r.label ?? key, parentGroups: [], foundIn: r.foundIn })
      }
      for (const key of unique(item.disabledOptionIds)) {
        const r = findOption(key, sources)
        out.push({ ...itemBase, key, kind: 'option', label: r.label ?? key, parentGroups: r.parentGroups, foundIn: r.foundIn })
      }
    }
  }
  return out
}

/** Quita claves de una lista de ocultos (reactivación). Devuelve la lista nueva. */
export function withoutKeys(list: string[] | undefined, keys: unknown): string[] {
  const remove = new Set(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [])
  return (list ?? []).filter((v) => !remove.has(v))
}

/** true si `value` es una lista de strings (validación del body). */
export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 200 && value.every((v) => typeof v === 'string' && v.length <= 200)
}
