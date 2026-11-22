// ============================================================================
// Chequeos del diagnóstico de pantallas
// ============================================================================
// Todo corre en el navegador del equipo y queda en un informe local para
// copiar: nada se envía a ningún servidor.
// ============================================================================

import { ensureCached, cachedObjectUrl, removeCached, MediaCacheError } from '../shared/media-cache'
import { computeOffset, isActiveAt } from '../shared/clock'
import type { Sample } from './samples'
import {
  classifyEvents, recordEvents, measureMemory, summarizeSoak, soakVerdict, formatCut, MEMORY_SOURCE_LABEL,
  type PlaybackEvent, type CutSummary, type SoakMinute, type MemorySource,
} from './monitor'

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

// ── Memoria (solo heap de JS, redondeado; ver monitor.ts) ───────────────────
export function memorySnapshot(): { usedMB: number | null; limitMB: number | null } {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  if (!m) return { usedMB: null, limitMB: null }
  return { usedMB: Math.round(m.usedJSHeapSize / 1048576), limitMB: Math.round(m.jsHeapSizeLimit / 1048576) }
}

const INSTALLED_QUERY = '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)'
const isInstalled = () => { try { return matchMedia(INSTALLED_QUERY).matches } catch { return false } }

// ── Service worker ──────────────────────────────────────────────────────────
function swState(): string {
  if (!('serviceWorker' in navigator)) return 'no disponible'
  if (navigator.serviceWorker.controller) return 'controla la página'
  const err = window.__tgdSwError
  return err ? `error: ${err}` : 'todavía no controla la página'
}

/**
 * Espera a que el service worker controle la página sin pedirle nada a quien
 * prueba: 1) espera a que se active (instalación de la primera visita);
 * 2) si está activo pero no controla (p. ej. recarga forzada), le pide que
 * tome el control (clients.claim). Devuelve null si controla, o el motivo.
 */
export async function ensureSwControl(timeoutMs = 20_000): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return 'el navegador no tiene service worker'
  const sw = navigator.serviceWorker
  if (sw.controller) return null
  const controlled = new Promise<void>((res) => sw.addEventListener('controllerchange', () => res(), { once: true }))
  const wait = <T>(ms: number, v: T) => new Promise<T>((res) => setTimeout(() => res(v), ms))
  const reg = await Promise.race([sw.ready, wait<ServiceWorkerRegistration | null>(timeoutMs, null)])
  if (!reg) return window.__tgdSwError ?? `el service worker no se activó en ${timeoutMs / 1000} s`
  if (sw.controller) return null
  reg.active?.postMessage({ type: 'claim' })
  await Promise.race([controlled, wait(5000, undefined)])
  return sw.controller ? null : 'el service worker está activo pero no tomó el control'
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
  const perf = performance as Performance & { memory?: unknown; measureUserAgentSpecificMemory?: unknown }
  const memSource: MemorySource = window.crossOriginIsolated && typeof perf.measureUserAgentSpecificMemory === 'function'
    ? 'pagina' : perf.memory ? 'heap_js' : 'no_disponible'
  const data = {
    navegador: brands || '(sin userAgentData)',
    userAgent: navigator.userAgent,
    plataforma: nav.userAgentData?.platform ?? navigator.platform,
    movil: nav.userAgentData?.mobile ?? null,
    'memoriaDelEquipoGB (tope del navegador por privacidad: NO sirve para decidir)': nav.deviceMemory ?? null,
    nucleos: navigator.hardwareConcurrency ?? null,
    pantalla: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    pantallaPixelesReales: `${Math.round(screen.width * (window.devicePixelRatio || 1))}×${Math.round(screen.height * (window.devicePixelRatio || 1))}`,
    ventana: `${window.innerWidth}×${window.innerHeight}`,
    memoriaMedible: MEMORY_SOURCE_LABEL[memSource],
    heapLimiteMB: mem.limitMB,
    red: nav.connection ? `${nav.connection.effectiveType ?? '?'} · ${nav.connection.downlink ?? '?'} Mbps · ahorro=${nav.connection.saveData ?? false}` : '(sin Network Information)',
    serviceWorker: 'serviceWorker' in navigator,
    serviceWorkerEstado: swState(),
    cacheStorage: typeof caches !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    wakeLock: 'wakeLock' in navigator,
    fullscreen: !!document.documentElement.requestFullscreen,
    contextoSeguro: window.isSecureContext,
    instaladaComoApp: isInstalled(),
  }
  const missing = (['serviceWorker', 'cacheStorage', 'contextoSeguro'] as const).filter((k) => !data[k])
  return {
    id: 'device', title: 'Equipo y navegador',
    status: missing.length ? 'fail' : 'ok',
    detail: missing.length
      ? `Falta: ${missing.join(', ')}`
      : `${data.navegador} · ${data.pantalla} (${data.pantallaPixelesReales} reales) · ${data.nucleos ?? '?'} núcleos · service worker: ${data.serviceWorkerEstado}`,
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
  // Condiciones que Chrome mira para conceder persist() sin preguntar.
  const installed = isInstalled()
  let notifications = 'no disponible'
  try { if (typeof Notification !== 'undefined') notifications = Notification.permission } catch { /* */ }
  const ok = !!(granted || persisted)
  const hint = ok ? '' : ' · Chrome la concede solo si la página está instalada como app (menú ⋮ → «Instalar»), está en favoritos o se usa seguido. Sin persistencia el reproductor funciona igual: si el navegador borra lo guardado, lo vuelve a bajar y lo informa en el latido.'
  return {
    id: 'storage', title: 'Almacenamiento persistente',
    status: ok ? 'ok' : 'warn',
    detail: `persistente: ${granted ?? persisted ?? 'desconocido'} · instalada como app: ${installed ? 'sí' : 'no'} · espacio ${gb(quota)} · usado ${gb(usage)}${previousMarker ? ` · datos de la corrida anterior (${previousMarker}) siguen presentes` : ''}${hint}`,
    data: { persistedAntes: persisted, persistConcedido: granted, instaladaComoApp: installed, notificaciones: notifications, cuotaBytes: quota, usoBytes: usage, marcadorAnterior: previousMarker },
  }
}

// ── Reproducción ────────────────────────────────────────────────────────────
interface PlaybackStats {
  ttffMs: number | null
  playedS: number
  dropped: number | null
  total: number | null
  droppedPct: number | null
  /** Cortes con su motivo (ver monitor.ts). */
  cuts: CutSummary
  /** Tiempo del salto al 50 % (informativo: el reproductor real no salta). */
  seekMs: number | null
  mediaError: string | null
}

/**
 * Reproduce `src` en un <video> visible durante `seconds`: primer cuadro,
 * cuadros perdidos, cortes con su motivo y un salto al 50 % (informativo).
 */
export function measurePlayback(host: HTMLElement, src: string, seconds: number): Promise<PlaybackStats> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.preload = 'auto'
    v.style.cssText = 'width:100%;max-height:40vh;background:#000;border-radius:12px'
    host.replaceChildren(v)
    const t0 = performance.now()
    const events: PlaybackEvent[] = []
    let firstFrameAt: number | null = null
    let seekMs: number | null = null
    let done = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const stopRecording = recordEvents(v, events, t0)
    const finish = (mediaError: string | null) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      const endT = performance.now() - t0
      stopRecording() // antes de pausar: la pausa del final no es del equipo
      const q = v.getVideoPlaybackQuality?.()
      // Los cortes se cuentan desde el primer cuadro (antes es la carga inicial).
      const since = firstFrameAt
      const fromFirst = since === null ? [] : events.filter((e) => e.t >= since)
      const stats: PlaybackStats = {
        ttffMs: since === null ? null : Math.round(since),
        playedS: Math.round(v.currentTime * 10) / 10,
        dropped: q?.droppedVideoFrames ?? null,
        total: q?.totalVideoFrames ?? null,
        droppedPct: q && q.totalVideoFrames > 0 ? Math.round((q.droppedVideoFrames / q.totalVideoFrames) * 1000) / 10 : null,
        cuts: classifyEvents(fromFirst, endT),
        seekMs,
        mediaError,
      }
      v.pause()
      v.removeAttribute('src')
      v.load()
      host.replaceChildren()
      resolve(stats)
    }
    v.addEventListener('playing', () => {
      if (firstFrameAt === null) {
        firstFrameAt = performance.now() - t0
        // Mitad de la prueba: salto al 50 % del video. El navegador decodifica
        // desde el cuadro clave anterior (en las muestras de 720p hay ~6 s de
        // video entre ese cuadro clave y el 50 %), así que mide potencia de
        // decodificación, no la caché. El reproductor real nunca salta.
        setTimeout(() => {
          if (done || !Number.isFinite(v.duration)) return
          const s0 = performance.now()
          v.addEventListener('seeked', () => { seekMs = Math.round(performance.now() - s0) }, { once: true })
          v.currentTime = v.duration * 0.5
        }, (seconds * 1000) / 2)
        timer = setTimeout(() => finish(null), seconds * 1000)
      }
    })
    v.addEventListener('error', () => {
      const code = v.error?.code ?? 0
      const name = MEDIA_ERROR[code] ?? `MEDIA_ERR_${code}`
      captureError(name, v.error?.message || 'error de reproducción')
      finish(name)
    })
    setTimeout(() => { if (firstFrameAt === null) { captureError('ttff_timeout', 'No arrancó en 20 s'); finish('no_arranco_20s') } }, 20_000)
    v.src = src
    v.play().catch((e) => { captureError('play_rejected', (e as Error).message) })
  })
}

function playbackStatus(p: PlaybackStats): Status {
  if (p.mediaError) return 'fail'
  // Solo cuentan los cortes del equipo; los del salto o de la pantalla oculta no.
  if ((p.droppedPct ?? 0) > 5 || p.cuts.device > 0 || p.cuts.pauses > 0) return 'warn'
  return 'ok'
}
function playbackDetail(p: PlaybackStats, extra = ''): string {
  if (p.mediaError) return `error ${p.mediaError}${extra}`
  const c = p.cuts
  const others = [
    c.bySeek ? `${c.bySeek} por el salto` : '',
    c.byHidden ? `${c.byHidden} con pantalla oculta` : '',
    c.stalled ? `stalled ${c.stalled}` : '',
  ].filter(Boolean).join(', ')
  return `primer cuadro ${p.ttffMs ?? '?'} ms · cuadros perdidos ${p.droppedPct ?? '?'} % · cortes del equipo ${c.device}${c.device ? ` (${c.deviceMs} ms)` : ''}${c.pauses ? ` · pausas ${c.pauses}` : ''}${others ? ` · no cuentan: ${others}` : ''} · salto al 50 % ${p.seekMs ?? '?'} ms (informativo)${extra}`
}

/** Cada corte con su motivo, para el informe. */
export function cutLines(data: Record<string, unknown> | undefined): string[] {
  const cuts = (data?.cuts as CutSummary | undefined)?.cuts
  return cuts?.length ? cuts.map(formatCut) : []
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
  // Con addEventListener los mensajes del SW quedan en cola hasta startMessages():
  // sin esto los contadores 200/206 daban siempre 0.
  navigator.serviceWorker?.startMessages?.()
}

function swCall(msg: Record<string, unknown>): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  return new Promise((resolve) => {
    const ctrl = navigator.serviceWorker?.controller
    if (!ctrl) { resolve({ ok: false, error: 'el service worker no controla la página' }); return }
    const ch = new MessageChannel()
    ch.port1.onmessage = (e) => resolve(e.data)
    ctrl.postMessage(msg, [ch.port2])
    setTimeout(() => resolve({ ok: false, error: 'timeout del service worker (120 s)' }), 120_000)
  })
}

export async function playbackA(host: HTMLElement, sample: Sample, seconds: number): Promise<CheckResult> {
  const id = `a-${sample.id}`
  const title = `Opción A (SW + 206) · ${sample.label}`
  const notControlled = await ensureSwControl()
  if (notControlled) {
    captureError('a_sw', notControlled)
    return { id, title, status: 'fail', detail: `Service worker: ${notControlled}` }
  }
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

// ── Prueba larga ────────────────────────────────────────────────────────────
// Registra por minuto: memoria (con su fuente), cuadros perdidos, cortes del
// equipo y su duración, congelamientos (el video no avanza ≥ 10 s sin estar
// en pausa ni oculto) y si la pantalla estuvo oculta. Guarda un punto de
// control por minuto: si la página se recarga o se cierra en el medio (falta
// de memoria, reinicio del navegador), al volver a abrir /diagnostico el
// informe dice en qué minuto se interrumpió.
export const SOAK_KEY = 'tgd:diag-soak'
interface SoakCheckpoint {
  label: string
  plannedMinutes: number
  startedAt: string
  timeline: SoakMinute[]
  memSource: MemorySource
  errors: number
  finished: boolean
}

function saveSoak(c: SoakCheckpoint) { try { localStorage.setItem(SOAK_KEY, JSON.stringify(c)) } catch { /* */ } }

function soakResult(c: SoakCheckpoint, interrupted: boolean, extra: Record<string, unknown> = {}): CheckResult {
  const s = summarizeSoak(c.timeline, c.plannedMinutes)
  const mem = s.memStartMB === null
    ? 'memoria: el navegador no la informa'
    : `memoria ${s.memStartMB}→${s.memEndMB} MB (pico ${s.memPeakMB}${s.memSlopeMBh !== null ? `, ${s.memSlopeMBh >= 0 ? '+' : ''}${s.memSlopeMBh} MB/h` : ''}; ${MEMORY_SOURCE_LABEL[c.memSource]})`
  return {
    id: 'soak',
    title: `Prueba larga (${c.label})`,
    status: soakVerdict(s, interrupted, c.errors),
    detail: `${interrupted ? `INTERRUMPIDA después del minuto ${s.minutes} (la página se recargó o se cerró) · ` : ''}${s.minutes} de ${c.plannedMinutes} min · cortes del equipo ${s.cutsPerHour}/h (${s.stuckSeconds} s trabado) · cuadros perdidos ${s.droppedPct ?? '?'} % · congelado ${s.frozenMinutes} min · oculta ${s.hiddenMinutes} min · errores ${c.errors} · ${mem}`,
    data: { timeline: c.timeline, summary: s, interrupted, errors: c.errors, startedAt: c.startedAt, memSource: c.memSource, ...extra },
  }
}

/** Si quedó una prueba larga sin terminar (la página se recargó o se cerró), su resultado como interrumpida. */
export function interruptedSoak(): CheckResult | null {
  try {
    const raw = localStorage.getItem(SOAK_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as SoakCheckpoint
    if (c.finished) return null
    c.finished = true
    saveSoak(c)
    return soakResult(c, true)
  } catch { return null }
}

export async function soakTest(host: HTMLElement, sample: Sample, minutes: number, onTick: (msg: string) => void): Promise<CheckResult> {
  const objUrl = await cachedObjectUrl(sample.url)
  if (!objUrl) return { id: 'soak', title: 'Prueba larga', status: 'fail', detail: `Primero corré el diagnóstico (no está guardado ${sample.label}).` }
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.loop = true; v.src = objUrl
  v.setAttribute('playsinline', '')
  v.style.cssText = 'width:100%;max-height:40vh;background:#000;border-radius:12px'
  host.replaceChildren(v)

  const checkpoint: SoakCheckpoint = {
    label: `${minutes} min, ${sample.label}`, plannedMinutes: minutes, startedAt: new Date().toISOString(),
    timeline: [], memSource: 'no_disponible', errors: 0, finished: false,
  }
  v.addEventListener('error', () => { checkpoint.errors++; captureError(MEDIA_ERROR[v.error?.code ?? 0] ?? 'media_error', 'en prueba larga') })
  const t0 = performance.now()
  const events: PlaybackEvent[] = []
  const stopRecording = recordEvents(v, events, t0)
  saveSoak(checkpoint)
  await v.play().catch((e) => captureError('play_rejected', (e as Error).message))

  // Congelamiento: cada 2 s se mira si currentTime avanzó.
  let lastTime = -1
  let stillSince: number | null = null
  let frozenThisMinute = false
  const freezeTimer = setInterval(() => {
    const now = performance.now()
    const moving = v.currentTime !== lastTime
    lastTime = v.currentTime
    if (moving || v.paused || document.visibilityState === 'hidden') { stillSince = null; return }
    if (stillSince === null) stillSince = now
    else if (now - stillSince >= 10_000) frozenThisMinute = true
  }, 2000)

  let prevDropped = 0
  let prevFrames = 0
  for (let m = 1; m <= minutes; m++) {
    const minuteStart = performance.now() - t0
    let hiddenThisMinute = document.visibilityState === 'hidden'
    const onVis = () => { if (document.visibilityState === 'hidden') hiddenThisMinute = true }
    document.addEventListener('visibilitychange', onVis)
    await new Promise((r) => setTimeout(r, 60_000))
    document.removeEventListener('visibilitychange', onVis)
    const q = v.getVideoPlaybackQuality?.()
    // Se clasifica con todo el historial (un salto o una pantalla oculta del minuto anterior cuentan).
    const all = classifyEvents(events, performance.now() - t0)
    const own = all.cuts.filter((c) => c.at >= minuteStart && c.kind === 'waiting' && c.cause === 'equipo')
    const mem = await measureMemory()
    checkpoint.memSource = mem.source
    checkpoint.timeline.push({
      min: m,
      memMB: mem.mb,
      dropped: q ? q.droppedVideoFrames - prevDropped : null,
      frames: q ? q.totalVideoFrames - prevFrames : null,
      cuts: own.length,
      cutMs: own.reduce((a, c) => a + (c.ms ?? 0), 0),
      frozen: frozenThisMinute,
      hidden: hiddenThisMinute,
    })
    if (q) { prevDropped = q.droppedVideoFrames; prevFrames = q.totalVideoFrames }
    frozenThisMinute = false
    // Los eventos viejos ya clasificados se recortan (2 h de bucles son muchos).
    if (events.length > 2000) events.splice(0, events.length - 200)
    saveSoak(checkpoint)
    const sum = summarizeSoak(checkpoint.timeline, minutes)
    onTick(`Prueba larga: minuto ${m} de ${minutes} · cortes del equipo ${sum.cutsPerHour}/h · congelado ${sum.frozenMinutes} min · memoria ${mem.mb ?? '?'} MB (${MEMORY_SOURCE_LABEL[mem.source]})`)
  }
  clearInterval(freezeTimer)
  stopRecording()
  v.pause(); host.replaceChildren(); URL.revokeObjectURL(objUrl)
  checkpoint.finished = true
  saveSoak(checkpoint)
  return soakResult(checkpoint, false, { wakeLock: wakeLock && !wakeLock.released ? 'activo' : 'no' })
}

/** Borra los videos guardados por el diagnóstico (opciones A y B). */
export async function clearDiagnosticCaches(urls: string[]) {
  for (const u of urls) await removeCached(u)
  await swCall({ type: 'clear-a' }).catch(() => {})
}
