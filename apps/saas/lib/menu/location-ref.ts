// ============================================================================
// Direcciones públicas del menú con el NOMBRE de la sede (31/10/2026)
// ============================================================================
// Antes: /kekelarry/menu/69f8c0cdd3fcc97fd64bec9d (el _id de la sede).
// Ahora: /kekelarry/menu/palermo (el slug de la sede, único por comercio) y,
// si el comercio tiene una sola sede, /kekelarry/menu a secas.
//
// Las direcciones viejas con el _id SIGUEN FUNCIONANDO (QR impresos, links en
// redes): proxy.ts las manda a /api/menu-link, que busca el slug y redirige
// conservando el resto del camino y la query (?source=qr, mesa, promo…).
//
// Adentro nada cambia: pedidos, pagos, POS e impresión siguen con el _id. El
// slug es solo la dirección pública.
//
// Este archivo es puro (sirve en cliente y servidor).
// ============================================================================

export const OBJECT_ID_RE = /^[0-9a-f]{24}$/i
export const LOCATION_SLUG_RE = /^[a-z0-9-]{1,60}$/

/** Filtro de Mongo para encontrar una sede por slug o (compatibilidad) por _id. */
export function locationRefFilter(ref: string): { _id: string } | { slug: string } {
  return OBJECT_ID_RE.test(ref) ? { _id: ref } : { slug: ref.toLowerCase() }
}

/** Lo que identifica a la sede en la dirección: el slug; el _id solo si no hay slug. */
export function locationPathSegment(location: { slug?: string | null; _id?: unknown; id?: unknown }): string {
  if (location.slug && LOCATION_SLUG_RE.test(location.slug)) return location.slug
  return String(location._id ?? location.id ?? '')
}

/**
 * Dirección pública del menú de una sede.
 *   menuHref('kekelarry', { slug: 'palermo' })               → /kekelarry/menu/palermo
 *   menuHref('kekelarry', { slug: 'palermo' }, 'takeaway')   → /kekelarry/menu/palermo/takeaway
 */
export function menuHref(
  tenantSlug: string,
  location: { slug?: string | null; _id?: unknown; id?: unknown },
  subpath = ''
): string {
  const rest = subpath ? `/${subpath.replace(/^\/+/, '')}` : ''
  return `/${tenantSlug}/menu/${locationPathSegment(location)}${rest}`
}

/**
 * Dirección vieja con _id ⇒ datos para redirigir. null si no corresponde.
 * /kekelarry/menu/<24 hex>[/resto]
 */
export function parseLegacyMenuPath(pathname: string): { tenant: string; locationId: string; rest: string } | null {
  const m = /^\/([a-z0-9-]{2,50})\/menu\/([0-9a-f]{24})(\/[A-Za-z0-9/_-]*)?$/i.exec(pathname)
  if (!m) return null
  return { tenant: m[1].toLowerCase(), locationId: m[2].toLowerCase(), rest: m[3] ?? '' }
}
