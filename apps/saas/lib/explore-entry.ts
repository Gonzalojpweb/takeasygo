// ============================================================================
// Entrada a la app del consumidor (/app): un pageview por sesión
// ============================================================================
// Del 13/11/2026 (commit 54e7bfc4, «ciudad viva») al 20/11/2026 el inicio no
// registró pageviews: el único que lo hacía era /api/explore/home, que dejó de
// llamarse al salir HomeView. Además ese pageview viejo no llevaba la sesión
// del navegador (cada pedido era una «sesión» nueva) y la ruta tiene caché de
// CDN, así que contaba cargas sin caché, no sesiones.
//
// Versión 2: el cliente manda UN pageview por sesión de pestaña con
// metadata.v = 2, la vista de entrada y el origen clasificado. Las métricas del
// Super Admin cuentan pageviews solo de la versión 2 (corte por versión).
// ============================================================================

export const EXPLORE_PAGEVIEW_VERSION = 2

/** sessionStorage: ya se mandó el pageview de entrada en esta pestaña. */
export const ENTRY_TRACKED_KEY = 'tgo_entry_tracked'

/** Filtro Mongo de los pageviews de entrada (uno por sesión). */
export const ENTRY_PAGEVIEW_MATCH = { eventType: 'pageview', 'metadata.v': EXPLORE_PAGEVIEW_VERSION } as const

const TOKEN_RE = /[^a-z0-9_-]/g

function cleanToken(v: string | null | undefined): string {
  if (!v) return ''
  return v.trim().toLowerCase().replace(TOKEN_RE, '').slice(0, 40)
}

/**
 * Origen de la entrada a la app. Prioridad: ?source=, ?utm_source=, y si no
 * hay, el dominio del referrer reducido a una categoría (nunca la URL).
 */
export function classifyEntrySource(input: {
  sourceParam?: string | null
  utmSource?: string | null
  referrer?: string | null
  selfHost?: string | null
}): string {
  const explicit = cleanToken(input.sourceParam) || cleanToken(input.utmSource)
  if (explicit) return explicit

  const ref = (input.referrer || '').trim()
  if (!ref) return 'direct'
  let host = ''
  try {
    host = new URL(ref).hostname.toLowerCase()
  } catch {
    return 'otro'
  }
  const self = (input.selfHost || '').toLowerCase()
  if (self && (host === self || host.endsWith(`.${self}`))) return 'menu'
  if (/(^|\.)takeasygo\.(com|app)$/.test(host)) return 'menu'
  if (host.includes('whatsapp') || host === 'wa.me') return 'whatsapp'
  if (host.includes('instagram')) return 'instagram'
  if (host.includes('facebook') || host === 'fb.me' || host.endsWith('.fb.com')) return 'facebook'
  if (host.includes('tiktok')) return 'tiktok'
  if (/(^|\.)google\./.test(host)) return 'google'
  return 'otro'
}
