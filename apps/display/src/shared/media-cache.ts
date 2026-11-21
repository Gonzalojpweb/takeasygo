// ============================================================================
// Caché de medios — opción B (sin service worker para los videos)
// ============================================================================
// Se descarga el archivo COMPLETO con fetch(mode: 'cors') — Cloudinary
// responde con Access-Control-Allow-Origin: * , así que la respuesta no es
// opaca y se puede verificar el tamaño —, se guarda en Cache Storage y se
// reproduce con URL.createObjectURL(blob). Evita las peticiones Range: el
// <video> lee el blob local.
// ============================================================================

export const MEDIA_CACHE = 'tgd-media-b'

export interface DownloadResult {
  bytes: number
  ms: number
  fromCache: boolean
}

export class MediaCacheError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

/** Descarga y guarda (si no estaba). Verifica que el tamaño coincida con Content-Length. */
export async function ensureCached(url: string, cacheName = MEDIA_CACHE, signal?: AbortSignal): Promise<DownloadResult> {
  if (typeof caches === 'undefined') throw new MediaCacheError('no_cache_api', 'El navegador no tiene Cache Storage')
  const cache = await caches.open(cacheName)
  const hit = await cache.match(url)
  if (hit) {
    const len = Number(hit.headers.get('content-length')) || (await hit.clone().blob()).size
    return { bytes: len, ms: 0, fromCache: true }
  }
  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal })
  } catch (e) {
    throw new MediaCacheError('network', `Sin conexión o bloqueado: ${(e as Error).message}`)
  }
  if (res.type === 'opaque') throw new MediaCacheError('opaque', 'Respuesta opaca (sin CORS): no se puede verificar')
  if (!res.ok) throw new MediaCacheError(`http_${res.status}`, `El servidor respondió ${res.status}`)
  const blob = await res.blob()
  const expected = Number(res.headers.get('content-length'))
  if (Number.isFinite(expected) && expected > 0 && blob.size !== expected) {
    throw new MediaCacheError('truncated', `Descarga incompleta: ${blob.size} de ${expected} bytes`)
  }
  try {
    await cache.put(url, new Response(blob, {
      headers: { 'content-type': res.headers.get('content-type') || 'video/mp4', 'content-length': String(blob.size) },
    }))
  } catch (e) {
    const name = (e as DOMException)?.name
    throw new MediaCacheError(name === 'QuotaExceededError' ? 'quota' : 'cache_put', `No se pudo guardar: ${name || (e as Error).message}`)
  }
  return { bytes: blob.size, ms: Math.round(performance.now() - t0), fromCache: false }
}

/** URL local (blob:) del archivo guardado, o null si no está. Hay que liberarla con URL.revokeObjectURL. */
export async function cachedObjectUrl(url: string, cacheName = MEDIA_CACHE): Promise<string | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(cacheName)
  const hit = await cache.match(url)
  if (!hit) return null
  return URL.createObjectURL(await hit.blob())
}

export async function removeCached(url: string, cacheName = MEDIA_CACHE): Promise<void> {
  if (typeof caches === 'undefined') return
  await (await caches.open(cacheName)).delete(url)
}

/** Lo que ocupa una caché (suma de content-length). */
export async function cacheUsage(cacheName = MEDIA_CACHE): Promise<{ items: number; bytes: number }> {
  if (typeof caches === 'undefined') return { items: 0, bytes: 0 }
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  let bytes = 0
  for (const k of keys) {
    const r = await cache.match(k)
    bytes += Number(r?.headers.get('content-length')) || 0
  }
  return { items: keys.length, bytes }
}
