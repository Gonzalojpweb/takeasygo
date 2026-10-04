/**
 * Elimina de la payload pública lo que no debe exponerse al cliente:
 * - hiddenReward de todos los ítems (NUNCA se expone en el menú público).
 * - Grupos y opciones de personalización globales marcados como ocultos
 *   (category.disabledGroupIds / disabledOptionIds — disponibilidad).
 * Se aplica en todas las rutas que sirven menú al cliente (takeaway, dine-in,
 * business, API). El admin y el server de pedidos leen el menú crudo.
 */
interface SanitizeOption {
  _id?: unknown
  name?: string
  subGroups?: SanitizeGroup[]
  [key: string]: unknown
}

interface SanitizeGroup {
  _id?: unknown
  name?: string
  options?: SanitizeOption[]
  [key: string]: unknown
}

interface SanitizeCategory {
  disabledGroupIds?: string[]
  disabledOptionIds?: string[]
  customizationGroups?: SanitizeGroup[]
  subcategories?: Array<{ customizationGroups?: SanitizeGroup[] }>
  [key: string]: unknown
}

function idOf(value: unknown): string {
  return value == null ? '' : String(value)
}

export function sanitizeMenuForPublic(menu: any) {
  const menuObj = menu?.toObject ? menu.toObject() : { ...menu }
  for (const cat of (menuObj?.categories || []) as SanitizeCategory[]) {
    const items = (cat as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined
    for (const item of items || []) {
      delete item.hiddenReward
    }
    const catSubs = (cat as Record<string, unknown>).subcategories as Array<{ items?: Array<Record<string, unknown>> }> | undefined
    for (const sub of catSubs || []) {
      for (const item of sub.items || []) {
        delete item.hiddenReward
      }
    }
    filterHiddenCustomizations(cat)
  }
  return menuObj
}

/** Aplica las listas de ocultos de la categoría a sus grupos globales
 *  (y a los de sus subcategorías, que heredan de la categoría). */
function filterHiddenCustomizations(cat: SanitizeCategory) {
  const disabledGroupIds: string[] = cat.disabledGroupIds ?? []
  const disabledOptionIds: string[] = cat.disabledOptionIds ?? []
  if (disabledGroupIds.length === 0 && disabledOptionIds.length === 0) return

  if (cat.customizationGroups?.length) {
    cat.customizationGroups = filterGroups(cat.customizationGroups, disabledGroupIds, disabledOptionIds)
  }
  for (const sub of cat.subcategories || []) {
    if (sub.customizationGroups?.length) {
      sub.customizationGroups = filterGroups(sub.customizationGroups, disabledGroupIds, disabledOptionIds)
    }
  }
}

/** Misma semántica de filtrado que computeActiveGroups en CustomizationSheet:
 *  grupo oculto por _id o nombre; opción oculta por _id o nombre; subgrupos recursivos. */
function filterGroups(groups: SanitizeGroup[], disabledGroupIds: string[], disabledOptionIds: string[]): SanitizeGroup[] {
  const visible: SanitizeGroup[] = []
  for (const group of groups) {
    if (disabledGroupIds.includes(idOf(group._id)) || disabledGroupIds.includes(group.name ?? '')) continue
    const options = (group.options ?? [])
      .filter(opt =>
        !disabledOptionIds.includes(idOf(opt._id)) && !disabledOptionIds.includes(opt.name ?? '')
      )
      .map(opt =>
        opt.subGroups?.length
          ? { ...opt, subGroups: filterGroups(opt.subGroups, disabledGroupIds, disabledOptionIds) }
          : opt
      )
    visible.push({ ...group, options })
  }
  return visible
}
