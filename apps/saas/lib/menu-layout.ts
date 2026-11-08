/**
 * Formato de cada categoría en el menú público.
 *
 * El comercio elige un layout general (grilla o lista) y, por categoría, puede
 * pisarlo con lista, grilla o carrusel, en takeaway, en salón o en ambos.
 */

export type CategoryLayout = 'list' | 'grid' | 'carousel'
export type CategoryLayoutSetting = 'inherit' | CategoryLayout
export type LayoutApplyTo = 'both' | 'takeaway' | 'dine-in'
/** Menú que se está mostrando. Business y delivery usan la vista takeaway. */
export type MenuSurface = 'takeaway' | 'dine-in'

export interface CategoryLayoutFields {
  displayLayout?: CategoryLayoutSetting | string | null
  displayLayoutApplyTo?: LayoutApplyTo | string | null
}

export const CATEGORY_LAYOUTS: readonly CategoryLayoutSetting[] = ['inherit', 'list', 'grid', 'carousel']
export const LAYOUT_APPLY_TO: readonly LayoutApplyTo[] = ['both', 'takeaway', 'dine-in']

/** Carrusel: cuántos productos se muestran antes de la tarjeta «Ver todos». */
export const CAROUSEL_PREVIEW_LIMIT = 8

/** Formato propio si está definido y aplica a este menú; si no, el heredado. */
function resolveOwnLayout(fields: CategoryLayoutFields, surface: MenuSurface, inherited: CategoryLayout): CategoryLayout {
  const layout = fields.displayLayout
  if (layout !== 'list' && layout !== 'grid' && layout !== 'carousel') return inherited
  const applyTo = fields.displayLayoutApplyTo || 'both'
  if (applyTo !== 'both' && applyTo !== surface) return inherited
  return layout
}

/** Categoría: su formato o, si hereda, el layout general del menú. */
export function resolveCategoryLayout(
  category: CategoryLayoutFields,
  surface: MenuSurface,
  globalIsGrid: boolean,
): CategoryLayout {
  return resolveOwnLayout(category, surface, globalIsGrid ? 'grid' : 'list')
}

/** Subcategoría: su formato o, si hereda, el ya resuelto de su categoría. */
export function resolveSubcategoryLayout(
  subcategory: CategoryLayoutFields,
  surface: MenuSurface,
  categoryLayout: CategoryLayout,
): CategoryLayout {
  return resolveOwnLayout(subcategory, surface, categoryLayout)
}

/**
 * Categoría que ancla una sección (combos o Tarjeta del Club). Se busca entre
 * las categorías visibles: si la marcada está oculta (sin stock, fuera de
 * horario), la sección vuelve a su posición general.
 */
export function findAnchorCategoryId<T extends { _id: string }>(
  visibleCategories: T[],
  flag: (category: T) => boolean | undefined,
): string | null {
  const found = visibleCategories.find(c => flag(c) === true)
  return found ? String(found._id) : null
}

/** Inicial para el reemplazo de foto: primera letra o número del nombre. */
export function itemInitial(name: string): string {
  const match = (name || '').trim().match(/[\p{L}\p{N}]/u)
  return match ? match[0].toLocaleUpperCase('es-AR') : '·'
}
