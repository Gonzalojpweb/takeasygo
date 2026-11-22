/// <reference lib="webworker" />
// ============================================================================
// Service worker del reproductor de pantallas (sin librerías)
// ============================================================================
// 1. App shell: los archivos del build (__WB_MANIFEST) se guardan al instalar;
//    las navegaciones van NetworkFirst con 4 s de espera → sin internet se
//    abre la copia guardada.
// 2. Opción A del diagnóstico: un video guardado en la caché 'tgd-media-a' se
//    sirve desde acá. Si el <video> pide un rango (Range), se recorta del
//    archivo completo y se responde 206 con Content-Range.
// 3. Mensajes: {type:'cache-a', url} descarga y guarda un video para la
//    opción A; responde por el MessagePort.
// ============================================================================

import { parseRangeHeader, contentRange } from '../shared/range'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

const PRECACHE = self.__WB_MANIFEST
// Sin repetidos: cache.addAll() rechaza la lista entera si una URL aparece dos
// veces (pasó con icon.svg en 4ed85e41 → el SW nunca se instalaba y la
// opción A del diagnóstico fallaba con «todavía no controla la página»).
const SHELL_URLS = Array.from(new Set(PRECACHE.map((e) => e.url)))
const SHELL = `tgd-shell-${hash(JSON.stringify(PRECACHE))}`
const PAGES = 'tgd-pages'
const MEDIA_A = 'tgd-media-a'
const NAV_TIMEOUT_MS = 4000

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    await cache.addAll(SHELL_URLS)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('tgd-shell-') && key !== SHELL) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

async function notify(msg: Record<string, unknown>) {
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage(msg)
}

async function navigation(req: Request): Promise<Response> {
  const pages = await caches.open(PAGES)
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), NAV_TIMEOUT_MS)),
    ])
    if (res.ok) await pages.put('/index.html', res.clone())
    return res
  } catch {
    const cached = (await pages.match('/index.html')) || (await caches.match('/index.html')) || (await caches.match('index.html'))
    return cached || new Response('Sin conexión y sin copia guardada', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
}

async function mediaFromCache(req: Request): Promise<Response | null> {
  const cache = await caches.open(MEDIA_A)
  const hit = await cache.match(req.url, { ignoreVary: true, ignoreSearch: false })
  if (!hit) return null
  const blob = await hit.blob()
  const size = blob.size
  const type = hit.headers.get('content-type') || 'video/mp4'
  const rangeHeader = req.headers.get('range')
  if (!rangeHeader) {
    void notify({ type: 'sw-media', status: 200, url: req.url })
    return new Response(blob, { status: 200, headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
  }
  const r = parseRangeHeader(rangeHeader, size)
  if (!r) {
    void notify({ type: 'sw-media', status: 416, url: req.url })
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  }
  void notify({ type: 'sw-media', status: 206, url: req.url, start: r.start, end: r.end })
  return new Response(blob.slice(r.start, r.end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'content-type': type,
      'content-length': String(r.end - r.start + 1),
      'content-range': contentRange(r, size),
      'accept-ranges': 'bytes',
    },
  })
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(navigation(req))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => (await caches.match(req, { ignoreSearch: true })) || fetch(req))())
    return
  }

  // Medios de otro origen (Cloudinary): solo si están en la caché de la opción A.
  if (url.hostname === 'res.cloudinary.com') {
    event.respondWith((async () => (await mediaFromCache(req)) || fetch(req))())
  }
})

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; url?: string } | null
  const port = event.ports[0]
  if (data?.type === 'cache-a' && data.url && port) {
    event.waitUntil((async () => {
      try {
        const res = await fetch(data.url!, { mode: 'cors', credentials: 'omit', cache: 'no-store' })
        if (res.type === 'opaque') throw new Error('opaque')
        if (!res.ok) throw new Error(`http_${res.status}`)
        const blob = await res.blob()
        await (await caches.open(MEDIA_A)).put(data.url!, new Response(blob, { headers: { 'content-type': res.headers.get('content-type') || 'video/mp4', 'content-length': String(blob.size) } }))
        port.postMessage({ ok: true, bytes: blob.size })
      } catch (e) {
        port.postMessage({ ok: false, error: (e as Error).message || 'error' })
      }
    })())
  }
  // La página pide control cuando abrió sin SW (primera visita o recarga forzada).
  if (data?.type === 'claim') {
    event.waitUntil(self.clients.claim())
  }
  if (data?.type === 'clear-a' && port) {
    event.waitUntil(caches.delete(MEDIA_A).then(() => port.postMessage({ ok: true })))
  }
})
