// ============================================================================
// Reproductor de pantallas
// ============================================================================
// · Manifiesto cada ~60 s con ETag (304 = sin cambios). La hora del servidor
//   corrige la del equipo (también sirve sin internet: queda guardada).
// · Caché de medios: opción B (descarga completa a Cache Storage y
//   reproducción desde blob). Se baja una sola vez; lo que sale del
//   manifiesto se borra. Sin internet se reproduce lo guardado.
// · Solo se muestra lo vigente (endsAt con hora corregida) y en su franja.
// · Una pieza que falla se saltea; con 3 errores seguidos queda 30 min afuera.
// · Sin sonido. Pantalla completa con el primer toque o tecla. Bloqueo de
//   suspensión (o video mínimo en bucle si el equipo no lo tiene).
// · Se actualiza sola: versión nueva publicada, memoria alta (> 80 %) o
//   recarga diaria a las 4:00 → recarga al terminar la pieza en curso.
// · Latido cada 5 min y estadísticas cada 15 min (lotes pendientes guardados).
// ============================================================================
import { ensureCached, cachedObjectUrl, removeCached, MEDIA_CACHE, MediaCacheError } from '../shared/media-cache'
import { computeOffset, correctedNow, saveOffset } from '../shared/clock'
import { getManifest, postJson } from './api'
import { store, StatsAccumulator, type StatsBatch } from './store'
import { playableItems, chooseQuality, canDecode1080Smooth, urlFor, localParts, type Manifest, type ManifestItem } from './schedule'
import { CURRENT_BUILD } from '../build'

const HEARTBEAT_MS = 5 * 60_000
const STATS_MS = 15 * 60_000
const CHECKS_MS = 60_000
const VERSION_CHECK_MS = 30 * 60_000
const PENALTY_MS = 30 * 60_000
const MAX_ERROR_STREAK = 3
const IDLE_RETRY_MS = 5_000
const DAILY_RELOAD_HOUR = 4

export function mountPlayer(root: HTMLElement, onRevoked: () => void): () => void {
  let stopped = false
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const later = (fn: () => void, ms: number) => { if (!stopped) timers.push(setTimeout(fn, ms)) }

  let manifest: Manifest | null = store.manifest()
  let etag: string | null = manifest?.version ?? null
  // Se ajusta al arrancar si el navegador dice que 1080p no es fluido.
  let quality = chooseQuality(screen.width, screen.height, window.devicePixelRatio)
  const cached = new Set<string>()
  const penaltyUntil = new Map<string, number>()
  const errorStreak = new Map<string, number>()
  const stats = new StatsAccumulator()
  let currentId: string | null = null
  let reloadReason: string | null = null
  let downloading = false

  // ── Escena ──────────────────────────────────────────────────────────────
  root.innerHTML = ''
  const stage = document.createElement('div')
  stage.style.cssText = 'position:fixed;inset:0;background:#000;overflow:hidden;cursor:none'
  const idle = document.createElement('div')
  idle.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#666;font-size:clamp(14px,2.4vmin,28px);text-align:center'
  const fsBtn = document.createElement('button')
  fsBtn.type = 'button'
  fsBtn.textContent = 'Pantalla completa'
  fsBtn.style.cssText = 'position:fixed;right:2vmin;bottom:2vmin;z-index:5;min-height:48px;padding:0 18px;border-radius:12px;border:0;background:rgba(255,255,255,.9);color:#000;font-weight:700;cursor:pointer'
  root.append(stage, fsBtn)

  function reportError(code: string, message: string) { store.setLastError(code, message) }
  window.addEventListener('error', (e) => reportError('js_error', `${e.message}`))
  window.addEventListener('unhandledrejection', (e) => reportError('promise_rejection', String((e.reason as Error)?.message ?? e.reason)))

  // ── Pantalla completa y suspensión ──────────────────────────────────────
  const goFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}) }
  fsBtn.addEventListener('click', goFullscreen)
  let fsHide: ReturnType<typeof setTimeout> | null = null
  const showFsButton = () => {
    if (document.fullscreenElement) { fsBtn.style.display = 'none'; return }
    fsBtn.style.display = 'block'
    if (fsHide) clearTimeout(fsHide)
    fsHide = setTimeout(() => { fsBtn.style.display = 'none' }, 8000)
  }
  window.addEventListener('pointermove', showFsButton)
  window.addEventListener('keydown', () => { goFullscreen(); showFsButton() }, { once: true })
  document.addEventListener('fullscreenchange', showFsButton)
  showFsButton()

  type WakeLockSentinel = { released: boolean; release: () => Promise<void> }
  let wakeLock: WakeLockSentinel | null = null
  async function keepAwake() {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock
    if (wl) {
      try { if (!wakeLock || wakeLock.released) wakeLock = await wl.request('screen') } catch { /* sin permiso */ }
      return
    }
    // Sin Wake Lock: un video mínimo en bucle mantiene la pantalla encendida en muchos equipos.
    if (!document.getElementById('tgd-keepalive')) {
      const v = document.createElement('video')
      v.id = 'tgd-keepalive'; v.src = '/keepalive.mp4'; v.muted = true; v.loop = true; v.playsInline = true
      v.setAttribute('playsinline', '')
      v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0'
      document.body.append(v)
      v.play().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void keepAwake() })
  void keepAwake()

  // ── Almacenamiento persistente ──────────────────────────────────────────
  // Chrome no pregunta: concede persist() solo (página instalada como app,
  // en favoritos, con mucho uso o con notificaciones permitidas). Se pide al
  // arrancar y otra vez con el primer toque o tecla. Sin persistencia el
  // navegador puede borrar lo guardado si le falta espacio: se detecta
  // (caché vacía cuando había archivos), se informa en el latido y se vuelve
  // a bajar lo que falte sin cortar la reproducción.
  let persisted = false
  async function askPersist() {
    try { persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false } catch { /* */ }
  }
  const persistOnInteraction = () => { if (!persisted) void askPersist() }
  window.addEventListener('pointerdown', persistOnInteraction, { once: true })
  window.addEventListener('keydown', persistOnInteraction, { once: true })

  // ── Caché ───────────────────────────────────────────────────────────────
  async function refreshCachedSet() {
    const before = cached.size
    cached.clear()
    if (typeof caches === 'undefined') return
    for (const req of await (await caches.open(MEDIA_CACHE)).keys()) cached.add(req.url)
    const expected = Math.max(before, store.expectedMedia())
    if (expected > 0 && cached.size === 0) {
      reportError('storage_evicted', `El navegador borró los ${expected} archivos guardados (almacenamiento ${persisted ? 'persistente' : 'no persistente'}); se vuelven a bajar`)
    }
  }

  async function syncMedia() {
    if (downloading || !manifest) return
    downloading = true
    try {
      // Se relee la caché: si el navegador borró archivos, se vuelven a bajar.
      await refreshCachedSet()
      const now = correctedNow()
      const wanted = manifest.items.filter((i) => !i.endsAt || Date.parse(i.endsAt) > now).map((i) => urlFor(i, quality))
      // Lo que ya no está en el manifiesto se borra del equipo.
      for (const url of [...cached]) if (!wanted.includes(url)) { await removeCached(url); cached.delete(url) }
      for (const url of wanted) {
        if (stopped || cached.has(url)) continue
        try {
          await ensureCached(url)
          cached.add(url)
        } catch (e) {
          const code = e instanceof MediaCacheError ? `download_${e.code}` : 'download_error'
          reportError(code, (e as Error).message)
          if (e instanceof MediaCacheError && e.code === 'quota') break
        }
      }
      store.setExpectedMedia(cached.size)
    } finally {
      downloading = false
    }
  }

  // ── Manifiesto ──────────────────────────────────────────────────────────
  async function pollManifest() {
    let next = (manifest?.pollAfterS ?? 60) * 1000
    try {
      const r = await getManifest(etag)
      if (r.status === 401) { stop(); store.clearDevice(); onRevoked(); return }
      if (r.status === 200 && r.data) {
        manifest = r.data as Manifest
        etag = r.etag ?? manifest.version
        store.setManifest(manifest)
        const serverMs = Date.parse(manifest.serverTime)
        if (Number.isFinite(serverMs)) saveOffset({ offsetMs: computeOffset(serverMs, r.sentAt, r.receivedAt), measuredAt: Date.now() })
        next = (manifest.pollAfterS || 60) * 1000
      }
      // También con 304: repone lo que el navegador haya borrado.
      if (r.status === 200 || r.status === 304) void syncMedia()
    } catch {
      next = 30_000 // sin internet: se sigue con lo guardado y se reintenta
    }
    later(pollManifest, next + Math.floor(Math.random() * 10_000))
  }

  // ── Reproducción ────────────────────────────────────────────────────────
  function pickNext(): ManifestItem | null {
    if (!manifest) return null
    const list = playableItems(manifest.items, {
      nowMs: correctedNow(),
      timeZone: manifest.timezone,
      isCached: (i) => cached.has(urlFor(i, quality)),
      penaltyUntil,
    })
    if (!list.length) return null
    const idx = currentId ? list.findIndex((i) => i.id === currentId) : -1
    return list[(idx + 1) % list.length]
  }

  function showIdle() {
    idle.innerHTML = `<div><div style="font-weight:700;color:#999">${escapeHtml(manifest?.device.name ?? 'Pantalla')}</div><div>Sin contenido para mostrar ahora</div></div>`
    stage.replaceChildren(idle)
  }

  async function playNext() {
    if (stopped) return
    if (reloadReason) { await flushStats(true); location.reload(); return }
    const item = pickNext()
    if (!item) { currentId = null; showIdle(); later(playNext, IDLE_RETRY_MS); return }
    currentId = item.id
    const objUrl = await cachedObjectUrl(urlFor(item, quality))
    if (!objUrl) { cached.delete(urlFor(item, quality)); void syncMedia(); later(playNext, 0); return }

    const el = item.kind === 'video' ? document.createElement('video') : document.createElement('img')
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s'
    let shownAt = 0
    let finished = false
    const done = (ok: boolean, reason?: string) => {
      if (finished) return
      finished = true
      if (shownAt) stats.addTime(item.id, performance.now() - shownAt)
      if (ok) { stats.addPlay(item.id); errorStreak.delete(item.id) }
      else {
        stats.addError(item.id)
        reportError('playback', `${item.id}: ${reason ?? 'error'}`)
        const streak = (errorStreak.get(item.id) ?? 0) + 1
        errorStreak.set(item.id, streak)
        if (streak >= MAX_ERROR_STREAK) { penaltyUntil.set(item.id, correctedNow() + PENALTY_MS); errorStreak.delete(item.id) }
      }
      if (el instanceof HTMLVideoElement) { el.pause(); el.removeAttribute('src'); el.load() }
      setTimeout(() => { URL.revokeObjectURL(objUrl); el.remove() }, 600)
      void playNext()
    }
    const onShown = () => {
      shownAt = performance.now()
      el.style.opacity = '1'
      for (const old of [...stage.children]) if (old !== el) setTimeout(() => old.remove(), 450)
    }

    if (el instanceof HTMLVideoElement) {
      el.muted = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto'
      el.addEventListener('playing', () => { if (!shownAt) onShown() }, { once: true })
      el.addEventListener('ended', () => done(true))
      el.addEventListener('error', () => done(false, `MEDIA_ERR_${el.error?.code ?? 0}`))
      // Tope: duración informada + 3 s (un video trabado no frena la pantalla).
      setTimeout(() => { if (!finished) done(!!shownAt, 'tiempo excedido') }, item.durationMs + 3000)
      setTimeout(() => { if (!shownAt && !finished) done(false, 'no arrancó en 10 s') }, 10_000)
      el.src = objUrl
      stage.append(el)
      el.play().catch((e) => done(false, `play: ${(e as Error).message}`))
    } else {
      el.alt = ''
      el.addEventListener('load', () => { onShown(); setTimeout(() => done(true), item.durationMs) }, { once: true })
      el.addEventListener('error', () => done(false, 'imagen ilegible'), { once: true })
      el.src = objUrl
      stage.append(el)
    }
  }

  // ── Latido y estadísticas ───────────────────────────────────────────────
  async function heartbeat() {
    let quotaBytes = 0
    try { quotaBytes = (await navigator.storage?.estimate?.())?.quota ?? 0 } catch { /* */ }
    try { persisted = (await navigator.storage?.persisted?.()) ?? false } catch { /* */ }
    let bytes = 0
    for (const url of cached) {
      const r = await (await caches.open(MEDIA_CACHE)).match(url)
      bytes += Number(r?.headers.get('content-length')) || 0
    }
    const err = store.lastError()
    try {
      const { status } = await postJson('/api/display/heartbeat', {
        appVersion: CURRENT_BUILD.version,
        manifestVersion: etag,
        screen: { width: Math.round(screen.width * (window.devicePixelRatio || 1)), height: Math.round(screen.height * (window.devicePixelRatio || 1)) },
        cache: { items: cached.size, bytes, quotaBytes, persisted },
        lastError: err ? { code: err.code.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 40), message: err.message, at: err.at } : null,
      })
      if (status === 401) { stop(); store.clearDevice(); onRevoked(); return }
    } catch { /* sin internet */ }
    later(heartbeat, HEARTBEAT_MS)
  }

  async function flushStats(final = false) {
    const batch = stats.cut()
    const pending: StatsBatch[] = [...store.pendingStats(), ...(batch ? [batch] : [])]
    store.setPendingStats(pending)
    if (final) return
    const keep: StatsBatch[] = []
    for (const b of pending) {
      try {
        const { status } = await postJson('/api/display/stats', b)
        // 200 = registrado o repetido; 422/400 = descartado por el servidor: no se reintenta.
        if (status >= 500 || status === 429) keep.push(b)
      } catch { keep.push(b) }
    }
    store.setPendingStats(keep)
  }
  const statsLoop = () => { void flushStats().finally(() => later(statsLoop, STATS_MS)) }

  // ── Actualización sin intervención ──────────────────────────────────────
  function checks() {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
    if (mem && mem.jsHeapSizeLimit > 0 && mem.usedJSHeapSize / mem.jsHeapSizeLimit > 0.8) reloadReason = 'memoria'
    // Recarga diaria a las 4:00 de la sede (la zona del equipo puede estar mal).
    const nowMs = correctedNow()
    const { minutes } = localParts(nowMs, manifest?.timezone)
    const today = new Date(nowMs).toISOString().slice(0, 10)
    if (Math.floor(minutes / 60) === DAILY_RELOAD_HOUR && store.lastDailyReload() !== today) { store.setLastDailyReload(today); reloadReason = 'diaria' }
    later(checks, CHECKS_MS)
  }
  async function versionCheck() {
    try {
      const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const v = (await res.json()) as { version?: string }
        if (v.version && CURRENT_BUILD.version !== 'dev' && v.version !== CURRENT_BUILD.version) reloadReason = 'versión nueva'
      }
    } catch { /* sin internet */ }
    later(versionCheck, VERSION_CHECK_MS)
  }

  function stop() {
    stopped = true
    for (const t of timers) clearTimeout(t)
    void wakeLock?.release().catch(() => {})
  }

  // ── Arranque ────────────────────────────────────────────────────────────
  void (async () => {
    await askPersist()
    if (quality === '1080' && (await canDecode1080Smooth()) === false) quality = '720'
    await refreshCachedSet()
    void syncMedia()
    void pollManifest()
    void playNext()
    later(heartbeat, 10_000)
    later(statsLoop, STATS_MS)
    later(checks, CHECKS_MS)
    later(versionCheck, VERSION_CHECK_MS)
  })()

  return stop
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
