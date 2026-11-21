// ============================================================================
// Chequeos del diagnóstico de pantallas
// ============================================================================
// Todo corre en el navegador del equipo y queda en un informe local para
// copiar: nada se envía a ningún servidor.
// ============================================================================

import { ensureCached, cachedObjectUrl, removeCached, MediaCacheError } from '../shared/media-cache'
import { computeOffset, isActiveAt } from '../shared/clock'
import type { Sample } from './samples'

export type Status = 'ok' | 'warn' | 'fail' | 'skip'
export interface CheckResult { id: string; title: string; status: Status; detail: string; data?: Record<string, unknown> }

// ── Errores capturados (con código) ─────────────────────────────────────────
export const capturedErrors: Array<{ at: string; code: string; message: string }> = []
export function captureError(code: string, message: string) {
  capturedErrors.push({ at: new Date().toISOString(), code, message: String(message).slice(0, 300) })
}
export function installErrorCapture() {
  window.addEventListener('error', (e) => captureError('js_error', `${e.message} @ ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => captureError('promise_rejection', String((e.reason as Error)?.message ?? e.reason)))
}

const MEDIA_ERROR: Record<number, string> = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK', 3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }

// ── Memoria ─────────────────────────────────────────────────────────────────
export function memorySnapshot(): { usedMB: number | null; limitMB: number | null } {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  if (!m) return { usedMB: null, limitMB: null }
  return { usedMB: Math.round(m.usedJSHeapSize / 1048576), limitMB: Math.round(m.jsHeapSizeLimit / 1048576) }
}

// ── Equipo y navegador ──────────────────────────────────────────────────────
export function deviceInfo(): CheckResult {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string; mobile?: boolean }
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number }
  }
  const brands = nav.userAgentData?.brands?.filter((b) => !/Not.?A.?Brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(', ')
  const mem = memorySnapshot()
  const data = {
    navegador: brands || '(sin userAgentData)',
    userAgent: navigator.userAgent,
    plataforma: nav.userAgentData?.platform ?? navigator.platform,
    movil: nav.userAgentData?.mobile ?? null,
    memoriaDelEquipoGB: nav.deviceMemory ?? null,
    nucleos: navigator.hardwareConcurrency ?? null,
    pantalla: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    ventana: `${window.innerWidth}×${window.innerHeight}`,
    heapLimiteMB: mem.limitMB,
    red: nav.connection ? `${nav.connection.effectiveType ?? '?'} · ${nav.connection.downlink ?? '?'} Mbps · ahorro=${nav.connection.saveData ?? false}` : '(sin Network Information)',
    serviceWorker: 'serviceWorker' in navigator,
    cacheStorage: typeof caches !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    wakeLock: 'wakeLock' in navigator,
    fullscreen: !!document.documentElement.requestFullscreen,
    contextoSeguro: window.isSecureContext,
  }
  const missing = (['serviceWorker', 'cacheStorage', 'contextoSeguro'] as const).filter((k) => !data[k])
  return {
    id: 'device', title: 'Equipo y navegador',
    status: missing.length ? 'fail' : 'ok',
    detail: missing.length ? `Falta: ${missing.join(', ')}` : `${data.navegador} · ${data.pantalla} · ${data.memoriaDelEquipoGB ?? '?'} GB`,
    data,
  }
}

// ── Códecs ──────────────────────────────────────────────────────────────────
export async function codecSupport(): Promise<CheckResult> {
  const v = document.createElement('video')
  const can720 = v.canPlayType('video/mp4; codecs="avc1.4d401f"') // Main 3.1
  const can1080 = v.canPlayType('video/mp4; codecs="avc1.640028"') // High 4.0
  const caps: Record<string, unknown> = {}
  const mc = (navigator as Navigator & { mediaCapabilities?: MediaCapabilities }).mediaCapabilities
  if (mc?.decodingInfo) {
    for (const [name, w, h, br] of [['720p', 1280, 720, 4_000_000], ['1080p', 1920, 1080, 8_000_000]] as const) {
      try {
        const r = await mc.decodingInfo({ type: 'file', video: { contentType: 'video/mp4; codecs="avc1.640028"', width: w, height: h, bitrate: br, framerate: 30 } })
        caps[name] = { soportado: r.supported, fluido: r.smooth, eficiente: r.powerEfficient }
      } catch (e) {
        caps[name] = `error: ${(e as Error).message}`
      }
    }
  }
  const ok720 = can720 !== ''
  const ok1080 = can1080 !== ''
  return {
    id: 'codecs', title: 'H.264 720p y 1080p',
    status: ok720 && ok1080 ? 'ok' : ok720 ? 'warn' : 'fail',
    detail: `720p: ${can720 || 'no'} · 1080p: ${can1080 || 'no'}`,
    data: { canPlay720: can720, canPlay1080: can1080, mediaCapabilities: Object.keys(caps).length ? caps : '(no disponible)' },
  }
}

// ── Almacenamiento ──────────────────────────────────────────────────────────
const MARKER_KEY = 'tgd:diag-marker'
export async function storageCheck(): Promise<CheckResult> {
  const s = navigator.storage
  let persisted: boolean | null = null
  let granted: boolean | null = null
  let quota: number | null = null
  let usage: number | null = null
  try { persisted = (await s?.persisted?.()) ?? null } catch { /* */ }
  try { granted = (await s?.persist?.()) ?? null } catch (e) { captureError('persist', (e as Error).message) }
  try { const est = await s?.estimate?.(); quota = est?.quota ?? null; usage = est?.usage ?? null } catch { /* */ }
  let previousMarker: string | null = null
  try { previousMarker = localStorage.getItem(MARKER_KEY); localStorage.setItem(MARKER_KEY, new Date().toISOString()) } catch { /* */ }
  const gb = (n: number | null) => (n === null ? '?' : `${(n / 1073741824).toFixed(2)} GB`)
  return {
    id: 'storage', title: 'Almacenamiento persistente',
    status: granted || persisted ? 'ok' : 'warn',
    detail: `persistente: ${granted ?? persisted ?? 'desconocido'} · espacio ${gb(quota)} · usado ${gb(usage)}${previousMarker ? ` · datos de la corrida anterior (${previousMarker}) siguen presentes` : ''}`,
    data: { persistedAntes: persisted, persistConcedido: granted, cuotaBytes: quota, usoBytes: usage, marcadorAnterior: previousMarker },
  }
}

// ── Reproducción ────────────────────────────────────────────────────────────
interface PlaybackStats {
  ttffMs: number | null
  playedS: number
  dropped: number | null
  total: number | null
  droppedPct: number | null
  stalls: number
  seekMs: number | null
  mediaError: string | null
  memBeforeMB: number | null
  memAfterMB: number | null
}

/** Reproduce `src` en un <video> visible durante `seconds`, mide primer cuadro, cuadros perdidos, cortes y un salto al 50 %. */
export function measurePlayback(host: HTMLElement, src: string, seconds: number): Promise<PlaybackStats> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.preload = 'auto'
    v.style.cssText = 'width:100%;max-height:40vh;background:#000;border-radius:12px'
    host.replaceChildren(v)
    const memBefore = memorySnapshot().usedMB
    const t0 = performance.now()
    let ttff: number | null = null
    let stalls = 0
    let seekMs: number | null = null
    let done = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (mediaError: string | null) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      const q = v.getVideoPlaybackQuality?.()
      const stats: PlaybackStats = {
        ttffMs: ttff,
        playedS: Math.round(v.currentTime * 10) / 10,
        dropped: q?.droppedVideoFrames ?? null,
        total: q?.totalVideoFrames ?? null,
        droppedPct: q && q.totalVideoFrames > 0 ? Math.round((q.droppedVideoFrames / q.totalVideoFrames) * 1000) / 10 : null,
        stalls,
        seekMs,
        mediaError,
        memBeforeMB: memBefore,
        memAfterMB: memorySnapshot().usedMB,
      }
      v.pause()
      v.removeAttribute('src')
      v.load()
      host.replaceChildren()
      resolve(stats)
    }
    v.addEventListener('playing', () => {
      if (ttff === null) {
        ttff = Math.round(performance.now() - t0)
        // Mitad de la prueba: salto al 50 % del video (mide Range / blob).
        setTimeout(() => {
          if (done || !Number.isFinite(v.duration)) return
          const s0 = performance.now()
          v.addEventListener('seeked', () => { seekMs = Math.round(performance.now() - s0) }, { once: true })
          v.currentTime = v.duration * 0.5
        }, (seconds * 1000) / 2)
        timer = setTimeout(() => finish(null), seconds * 1000)
      }
    })
    v.addEventListener('waiting', () => { if (ttff !== null) stalls++ })
    v.addEventListener('error', () => {
      const code = v.error?.code ?? 0
      const name = MEDIA_ERROR[code] ?? `MEDIA_ERR_${code}`
      captureError(name, v.error?.message || 'error de reproducción')
      finish(name)
    })
    setTimeout(() => { if (ttff === null) { captureError('ttff_timeout', 'No arrancó en 20 s'); finish('no_arranco_20s') } }, 20_000)
    v.src = src
    v.play().catch((e) => { captureError('play_rejected', (e as Error).message) })
  })
}

function playbackStatus(p: PlaybackStats): Status {
  if (p.mediaError) return 'fail'
  if ((p.droppedPct ?? 0) > 5 || p.stalls > 1) return 'warn'
  return 'ok'
}
function playbackDetail(p: PlaybackStats, extra = ''): string {
  if (p.mediaError) return `error ${p.mediaError}${extra}`
  return `primer cuadro ${p.ttffMs ?? '?'} ms · cuadros perdidos ${p.droppedPct ?? '?'} % · cortes ${p.stalls} · salto ${p.seekMs ?? '?'} ms · memoria ${p.memBeforeMB ?? '?'}→${p.memAfterMB ?? '?'} MB${extra}`
}

/** Opción B: descarga completa, Cache Storage, reproducción desde blob. */
export async function playbackB(host: HTMLElement, sample: Sample, seconds: number): Promise<CheckResult> {
  const id = `b-${sample.id}`
  const title = `Opción B (blob) · ${sample.label}`
  try {
    const dl = await ensureCached(sample.url)
    const objUrl = await cachedObjectUrl(sample.url)
    if (!objUrl) return { id, title, status: 'fail', detail: 'Guardado pero no se pudo leer de la caché' }
    const p = await measurePlayback(host, objUrl, seconds)
    URL.revokeObjectURL(objUrl)
    const mbps = dl.ms > 0 ? ` · descarga ${((dl.bytes * 8) / 1e6 / (dl.ms / 1000)).toFixed(1)} Mbps` : ' · ya estaba guardado'
    return { id, title, status: playbackStatus(p), detail: playbackDetail(p, mbps), data: { ...p, descarga: dl } }
  } catch (e) {
    const code = e instanceof MediaCacheError ? e.code : 'error'
    captureError(`b_${code}`, (e as Error).message)
    return { id, title, status: 'fail', detail: `${code}: ${(e as Error).message}` }
  }
}

// ── Opción A: service worker + Range/206 ────────────────────────────────────
let swMediaCounts = { s200: 0, s206: 0, s416: 0 }
export function listenSwMedia() {
  navigator.serviceWorker?.addEventListener('message', (e) => {
    const d = e.data as { type?: string; status?: number }
    if (d?.type !== 'sw-media') return
    if (d.status === 206) swMediaCounts.s206++
    else if (d.status === 416) swMediaCounts.s416++
    else swMediaCounts.s200++
  })
}

function swCall(msg: Record<string, unknown>): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  return new Promise((resolve) => {
    const ctrl = navigator.serviceWorker?.controller
    if (!ctrl) { resolve({ ok: false, error: 'el service worker todavía no controla la página (recargá una vez)' }); return }
    const ch = new MessageChannel()
    ch.port1.onmessage = (e) => resolve(e.data)
    ctrl.postMessage(msg, [ch.port2])
    setTimeout(() => resolve({ ok: false, error: 'timeout del service worker (120 s)' }), 120_000)
  })
}

export async function playbackA(host: HTMLElement, sample: Sample, seconds: number): Promise<CheckResult> {
  const id = `a-${sample.id}`
  const title = `Opción A (SW + 206) · ${sample.label}`
  const saved = await swCall({ type: 'cache-a', url: sample.url })
  if (!saved.ok) {
    captureError('a_cache', saved.error ?? 'error')
    return { id, title, status: 'fail', detail: `No se pudo guardar con el SW: ${saved.error}` }
  }
  swMediaCounts = { s200: 0, s206: 0, s416: 0 }
  const p = await measurePlayback(host, sample.url, seconds)
  const served = ` · SW respondió 200×${swMediaCounts.s200} 206×${swMediaCounts.s206} 416×${swMediaCounts.s416}`
  let status = playbackStatus(p)
  if (status === 'ok' && swMediaCounts.s200 + swMediaCounts.s206 === 0) status = 'warn' // reprodujo sin pasar por el SW
  return { id, title, status, detail: playbackDetail(p, served), data: { ...p, sw: { ...swMediaCounts } } }
}

// ── Sin internet ────────────────────────────────────────────────────────────
export async function offlineCheck(host: HTMLElement, sample: Sample): Promise<CheckResult> {
  const id = 'offline'
  const title = 'Sin internet'
  if (navigator.onLine) {
    return { id, title, status: 'skip', detail: 'El equipo tiene conexión: desconectá internet (Wi-Fi o cable) y volvé a tocar «Probar sin internet».' }
  }
  const objUrl = await cachedObjectUrl(sample.url)
  if (!objUrl) return { id, title, status: 'fail', detail: `No está guardado ${sample.label}: corré antes el diagnóstico con internet.` }
  const p = await measurePlayback(host, objUrl, 10)
  URL.revokeObjectURL(objUrl)
  return {
    id, title, status: p.mediaError ? 'fail' : 'ok',
    detail: p.mediaError ? `No reprodujo sin internet: ${p.mediaError}` : `Reprodujo lo guardado sin internet (${sample.label}). Para la app: recargá la página sin internet; si vuelve a abrir, el SW funciona.`,
    data: p as unknown as Record<string, unknown>,
  }
}

// ── Vencimiento por endsAt con hora corregida ──────────────────────────────
export async function expiryCheck(): Promise<CheckResult> {
  let offsetMs: number | null = null
  try {
    const sent = Date.now()
    const res = await fetch(`/version.json?ts=${sent}`, { cache: 'no-store' })
    const received = Date.now()
    const date = res.headers.get('date')
    if (date) offsetMs = computeOffset(Date.parse(date), sent, received)
  } catch { /* sin red: se usa la hora del equipo */ }
  const now = Date.now() + (offsetMs ?? 0)
  const iso = (d: number) => new Date(d).toISOString()
  const items = [
    { id: 'vencida', endsAt: iso(now - 60_000) },
    { id: 'vigente', startsAt: iso(now - 60_000), endsAt: iso(now + 3_600_000) },
    { id: 'futura', startsAt: iso(now + 3_600_000) },
    { id: 'sin-fechas' },
  ]
  const shown = items.filter((i) => isActiveAt(i, now)).map((i) => i.id)
  const ok = shown.join(',') === 'vigente,sin-fechas'
  const skew = offsetMs === null ? 'sin hora del servidor (sin internet)' : `reloj del equipo ${offsetMs >= 0 ? 'atrasado' : 'adelantado'} ${Math.abs(Math.round(offsetMs / 1000))} s`
  return { id: 'expiry', title: 'Vencimiento por endsAt', status: ok ? 'ok' : 'fail', detail: `muestra: ${shown.join(', ')} · ${skew}`, data: { offsetMs, shown } }
}

// ── Pantalla completa y suspensión ──────────────────────────────────────────
let wakeLock: { release: () => Promise<void>; released?: boolean } | null = null
export async function fullscreenAndWakeLock(): Promise<CheckResult> {
  let fs = 'no disponible'
  let wl = 'no disponible'
  try {
    if (document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen(); fs = 'sí' }
  } catch (e) { fs = `rechazada (${(e as Error).name})`; captureError('fullscreen', (e as Error).message) }
  try {
    const w = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof wakeLock> } }).wakeLock
    if (w) { wakeLock = await w.request('screen'); wl = 'sí' }
  } catch (e) { wl = `rechazado (${(e as Error).name})`; captureError('wake_lock', (e as Error).message) }
  return {
    id: 'fullscreen', title: 'Pantalla completa y suspensión',
    status: fs === 'sí' && wl === 'sí' ? 'ok' : fs === 'sí' || wl === 'sí' ? 'warn' : 'fail',
    detail: `pantalla completa: ${fs} · bloqueo de suspensión: ${wl}${wl !== 'sí' ? ' (se usará un video en bucle para mantenerla encendida)' : ''}`,
  }
}

// ── Prueba larga: bucle con memoria por minuto ──────────────────────────────
export async function soakTest(host: HTMLElement, sample: Sample, minutes: number, onTick: (msg: string) => void): Promise<CheckResult> {
  const objUrl = await cachedObjectUrl(sample.url)
  if (!objUrl) return { id: 'soak', title: 'Prueba larga', status: 'fail', detail: `Primero corré el diagnóstico (no está guardado ${sample.label}).` }
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.loop = true; v.src = objUrl
  v.style.cssText = 'width:100%;max-height:40vh;background:#000;border-radius:12px'
  host.replaceChildren(v)
  let stalls = 0; let errors = 0; let hidden = 0
  v.addEventListener('waiting', () => stalls++)
  v.addEventListener('error', () => { errors++; captureError(MEDIA_ERROR[v.error?.code ?? 0] ?? 'media_error', 'en prueba larga') })
  const onVis = () => { if (document.visibilityState === 'hidden') hidden++ }
  document.addEventListener('visibilitychange', onVis)
  await v.play().catch((e) => captureError('play_rejected', (e as Error).message))
  const timeline: Array<{ min: number; usedMB: number | null; dropped: number | null }> = []
  for (let m = 1; m <= minutes; m++) {
    await new Promise((r) => setTimeout(r, 60_000))
    const q = v.getVideoPlaybackQuality?.()
    timeline.push({ min: m, usedMB: memorySnapshot().usedMB, dropped: q?.droppedVideoFrames ?? null })
    onTick(`Prueba larga: minuto ${m} de ${minutes} · memoria ${memorySnapshot().usedMB ?? '?'} MB · cortes ${stalls}`)
  }
  document.removeEventListener('visibilitychange', onVis)
  v.pause(); host.replaceChildren(); URL.revokeObjectURL(objUrl)
  const first = timeline[0]?.usedMB ?? null
  const last = timeline[timeline.length - 1]?.usedMB ?? null
  const growth = first !== null && last !== null ? last - first : null
  return {
    id: 'soak', title: `Prueba larga (${minutes} min, ${sample.label})`,
    status: errors > 0 || (growth ?? 0) > 150 ? 'fail' : stalls > 3 || hidden > 0 ? 'warn' : 'ok',
    detail: `memoria ${first ?? '?'}→${last ?? '?'} MB · cortes ${stalls} · errores ${errors} · pantalla oculta ${hidden} veces · bloqueo de suspensión ${wakeLock && !wakeLock.released ? 'activo' : 'no'}`,
    data: { timeline, stalls, errors, hidden },
  }
}

/** Borra los videos guardados por el diagnóstico (opciones A y B). */
export async function clearDiagnosticCaches(urls: string[]) {
  for (const u of urls) await removeCached(u)
  await swCall({ type: 'clear-a' }).catch(() => {})
}
