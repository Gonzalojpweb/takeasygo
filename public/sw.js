// TakeasyGO Service Worker
// Strategy: cache-first for static assets, network-first for HTML pages, skip API routes

const CACHE = 'tgo-v2'

const PRECACHE = [
  '/real192.jpg',
  '/real512.jpg',
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

  // Only handle GET requests from our own origin
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Skip Next.js API routes and internal routes — always network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data/')) return

  // Cache-first for static build assets and images
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2|woff|ttf)$/)

  if (isStaticAsset) {
    e.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone()
              caches.open(CACHE).then((c) => c.put(req, clone))
            }
            return res
          })
      )
    )
    return
  }

  // Network-first for menu HTML pages — fall back to cache when offline
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})
