// ============================================================================
// Pantallas — archivo de una fuente de Google para guardarlo en el equipo
// ============================================================================
// La marca suele tener una fuente de Google («Inter», «Plus Jakarta Sans»)
// sin archivo propio. La pantalla NO la pide a internet al dibujar (el TV Box
// puede no tener conexión): el servidor busca una sola vez la URL del .woff2
// (fonts.gstatic.com, que permite CORS) y la manda como un archivo más a
// guardar en el equipo, igual que las fotos.
// Solo viaja el nombre de la familia; ningún dato del comercio ni de clientes.
// Caché en memoria 24 h por familia (también los fallos, 1 h). Sin respuesta
// en 3 s → sin fuente (la pantalla usa la del sistema).
// ============================================================================

const OK_TTL_MS = 24 * 60 * 60 * 1000
const FAIL_TTL_MS = 60 * 60 * 1000
const cache = new Map<string, { at: number; url: string | null }>()

/** User-Agent de un Chrome actual: con otro, Google devuelve TTF en lugar de WOFF2. */
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** Primera URL de fuente del CSS de Google (subconjunto latino si lo marca). */
export function fontUrlFromCss(css: string): string | null {
  const URL_RE = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/
  const latin = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]*)\}/.exec(css)
  const m = (latin && URL_RE.exec(latin[1])) || URL_RE.exec(css)
  return m ? m[1] : null
}

export async function resolveGoogleFont(family: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const hit = cache.get(family)
  if (hit && now - hit.at < (hit.url ? OK_TTL_MS : FAIL_TTL_MS)) return hit.url
  let url: string | null = null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetchImpl(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`, { headers: { 'User-Agent': CHROME_UA }, signal: ctrl.signal })
    clearTimeout(t)
    if (res.ok) url = fontUrlFromCss(await res.text())
  } catch { /* sin conexión o lento: sin fuente */ }
  cache.set(family, { at: now, url })
  return url
}

export async function resolveGoogleFonts(families: string[], fetchImpl: typeof fetch = fetch): Promise<Record<string, string | null>> {
  const entries = await Promise.all(families.map(async (f) => [f, await resolveGoogleFont(f, fetchImpl)] as const))
  return Object.fromEntries(entries)
}

export function __clearFontCache() { cache.clear() }
