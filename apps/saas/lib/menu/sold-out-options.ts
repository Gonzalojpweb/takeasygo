// ============================================================================
// Opciones agotadas (sabores del día) — lógica pura
// ============================================================================
// Una opción de personalización (p. ej. un sabor de helado) puede estar:
//   · OCULTA (disabledOptionIds): no se ofrece en ese plato. Configuración.
//   · AGOTADA (soldOutOptionIds): se ofrece pero hoy no hay. Operación diaria:
//     la marca el personal (panel o POS) y queda así hasta que alguien la repone.
//
// Dónde se guarda: en el dueño del grupo. Grupo de la categoría (o de una de
// sus subcategorías) → categoría.soldOutOptionIds (alcanza a todos sus platos);
// grupo propio del plato o de una variante → ítem.soldOutOptionIds.
// La clave es el _id de la opción; se aceptan nombres por compatibilidad.
//
// Para un plato, lo agotado es la UNIÓN de la lista de su categoría y la suya.
// Archivo puro: lo usan el menú público, el selector, el panel y el pedido.
// ============================================================================

export interface SoldOutOptionLike {
  _id?: unknown
  name?: string
  soldOut?: boolean
  subGroups?: SoldOutGroupLike[]
}
export interface SoldOutGroupLike {
  options?: SoldOutOptionLike[]
}

export function optionKey(option: { _id?: unknown; name?: string }): string {
  return option._id != null ? String(option._id) : String(option.name ?? '')
}

/** Lista efectiva de un plato: la de su categoría + la propia, sin repetidos. */
export function soldOutKeysFor(...lists: Array<readonly string[] | null | undefined>): string[] {
  const out = new Set<string>()
  for (const list of lists) for (const k of list ?? []) if (k) out.add(String(k))
  return [...out]
}

export function isOptionSoldOut(option: { _id?: unknown; name?: string }, keys: readonly string[] | Set<string>): boolean {
  const set = keys instanceof Set ? keys : new Set(keys)
  if (set.size === 0) return false
  return (option._id != null && set.has(String(option._id))) || (!!option.name && set.has(option.name))
}

/**
 * Copia de los grupos con `soldOut: true` en las opciones agotadas (también
 * en subgrupos). No borra nada: el cliente las ve en gris.
 */
export function markSoldOutGroups<G extends SoldOutGroupLike>(groups: G[] | undefined, keys: readonly string[]): G[] {
  if (!groups?.length) return groups ?? []
  if (!keys.length) return groups
  const set = new Set(keys)
  const visit = (gs: SoldOutGroupLike[]): SoldOutGroupLike[] =>
    gs.map(g => ({
      ...g,
      options: (g.options ?? []).map(o => ({
        ...o,
        ...(isOptionSoldOut(o, set) ? { soldOut: true } : {}),
        ...(o.subGroups?.length ? { subGroups: visit(o.subGroups) } : {}),
      })),
    }))
  return visit(groups) as G[]
}

/** Grupos con muchas opciones (sabores): usan panel propio y buscador. */
export const LARGE_GROUP_THRESHOLD = 12

export function isLargeGroup(group: { options?: unknown[] } | null | undefined): boolean {
  return (group?.options?.length ?? 0) > LARGE_GROUP_THRESHOLD
}
