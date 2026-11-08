// ============================================================================
// Producto que ya no está al confirmar el pedido (07/11/2026)
// ============================================================================
// El cliente lo agregó al carrito y, al pagar, el plato quedó sin stock, se
// pausó para llevar o se borró. El aviso tiene que decir QUÉ plato es (antes
// mostraba el id interno, un código hexadecimal que el cliente no entiende).
// El nombre sale de la carta (aunque el plato esté pausado); si se borró, del
// nombre que mandó el carrito; si no hay ninguno, un texto genérico.
// Nunca se muestra el id.
// ============================================================================

const OBJECT_ID_RE = /^[a-f\d]{24}$/i

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.trim().slice(0, 120)
  if (!n || OBJECT_ID_RE.test(n)) return null
  return n
}

/** Nombre de cada plato de la carta, esté disponible o no. */
export function menuItemNamesOf(menu: { categories?: Array<{ items?: Array<{ _id?: unknown; name?: string }>; subcategories?: Array<{ items?: Array<{ _id?: unknown; name?: string }> }> }> } | null | undefined): Map<string, string> {
  const names = new Map<string, string>()
  for (const c of menu?.categories ?? []) {
    for (const i of c.items ?? []) if (i._id && i.name) names.set(String(i._id), i.name)
    for (const s of c.subcategories ?? []) for (const i of s.items ?? []) if (i._id && i.name) names.set(String(i._id), i.name)
  }
  return names
}

export function unavailableItemMessage(menuName: unknown, cartName?: unknown, kind: 'item' | 'promotion' = 'item'): string {
  const name = cleanName(menuName) ?? cleanName(cartName)
  if (kind === 'promotion') {
    return name
      ? `La promoción «${name}» ya no está disponible. Sacala del carrito para continuar.`
      : 'Una de las promociones del carrito ya no está disponible. Sacala para continuar.'
  }
  return name
    ? `«${name}» ya no está disponible. Sacalo del carrito para continuar.`
    : 'Uno de los productos del carrito ya no está disponible. Sacalo para continuar.'
}
