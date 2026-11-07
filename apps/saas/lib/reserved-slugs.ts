/**
 * lib/reserved-slugs.ts
 *
 * Slugs que ningún comercio puede usar (multi-marca PR 5). Una sola lista para
 * el alta pública (onboarding), el alta y la edición del superadmin.
 *
 * - Rutas propias de la app (`app/*` de primer nivel) y del proxy.
 * - Namespace del panel de organización (`/grupo/{slug}`) y alias.
 * - Nombres que suplantarían a la plataforma.
 *
 * Solo rige para slugs NUEVOS o que cambian: un comercio que ya tiene un slug
 * de la lista lo conserva (ver scripts/check-reserved-slugs.ts).
 */

export const TENANT_SLUG_REGEX = /^[a-z0-9-]{2,50}$/

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Rutas de la app y del proxy
  'api', 'app', 'auth', 'admin', 'superadmin', 'seller', 'login', 'logout', 'demo', 'empezar', 'invite',
  'forgot-password', 'reset-password', 'sso-callback', 'privacidad', 'terminos', 'tgo', 'autorizar-mercadopago',
  'explore', 'pos', 'sync', 'static', 'assets', 'public', 'favicon', 'manifest', 'robots', 'sitemap',
  // Carpetas fijas de app/api: un comercio con ese slug tendría sus APIs
  // (/api/{slug}/…) tapadas por la carpeta (multi-marca PR 8)
  'agent', 'app-stories', 'business', 'cis', 'crm', 'cron', 'delivery', 'directory', 'internal', 'leads',
  'menu-link', 'mp-oauth', 'network', 'og', 'onboarding', 'push', 'tia', 'user', 'visits', 'wallet', 'webhooks',
  // Panel de organización (multi-marca)
  'grupo', 'grupos', 'org', 'orgs', 'organizacion', 'organizaciones',
  // Plataforma
  'takeasygo', 'soporte', 'support', 'ayuda', 'help', 'www',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(String(slug).trim().toLowerCase())
}

/**
 * Valida un slug de comercio (formato + reservado). Devuelve el mensaje de
 * error para mostrar, o null si es válido. La unicidad la chequea quien llama.
 */
export function tenantSlugError(slug: unknown): string | null {
  if (typeof slug !== 'string' || !TENANT_SLUG_REGEX.test(slug)) {
    return 'Slug inválido — solo minúsculas, números y guiones (2 a 50)'
  }
  if (isReservedSlug(slug)) return `El enlace "${slug}" está reservado. Probá con otro.`
  return null
}

/**
 * Slug de organización (multi-marca PR 7): vive en otro namespace
 * (`/grupo/{slug}`), así que puede coincidir con el de un comercio, pero
 * tampoco puede ser una palabra reservada. La unicidad la da el índice.
 */
export function orgSlugError(slug: unknown): string | null {
  return tenantSlugError(slug)
}
