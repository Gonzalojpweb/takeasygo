// TakeasyGO Service Worker
// Strategy:
//   - JS/CSS chunks (/_next/static/): NETWORK ONLY — nunca cachear, cambian con cada deploy
//   - Imágenes y fuentes estáticas: cache-first
//   - HTML pages: network-first con fallback al cache
//   - API routes: siempre network

const CACHE = 'tgo-v3'

const PRECACHE = [
  '/real192.jpg',
  '/real512.jpg',
  '/tgo192.png',
]

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)

  // Solo GET de nuestro propio origen
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // ── NETWORK ONLY: API routes y chunks JS/CSS de Next.js ───────────────────
  // Los chunks de /_next/static/ contienen el código de la app — si los
  // cacheamos con cache-first, un deploy nuevo causa hydration mismatch.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/')
  ) return

  // ── CACHE FIRST: imágenes y fuentes (no cambian entre deploys) ────────────
  const isMedia = url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2|woff|ttf)$/)
  if (isMedia) {
    e.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok && res.status !== 206) {
              const clone = res.clone()
              caches.open(CACHE).then((c) => c.put(req, clone))
            }
            return res
          })
      )
    )
    return
  }

  // ── NETWORK FIRST: páginas HTML — fallback al cache si offline ────────────
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.status !== 206) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
      .catch(() => caches.match(req).then(cached => cached || new Response('', { status: 503 })))
  )
})

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return

  let data = {}
  try { data = e.data.json() } catch { data = { title: 'TakeasyGO', body: e.data.text() } }

  const {
    title = 'TakeasyGO',
    body = '',
    icon = '/tgo192.png',
    badge = '/tgo192.png',
    url = '/explore',
  } = data

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/explore'

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        return existing.navigate(url)
      }
      return self.clients.openWindow(url)
    })
  )
})
