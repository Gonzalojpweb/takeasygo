// ============================================================================
// Registro y clasificación de cortes de reproducción (diagnóstico)
// ============================================================================
// Qué es cada cosa:
// · «waiting»: el <video> se quedó sin cuadros para mostrar y se detuvo
//   esperando datos o decodificación. Es lo que el público ve como un corte.
//   Su duración es el tiempo hasta el siguiente «playing».
// · «stalled»: el navegador no recibió datos del archivo durante ~3 s. Con un
//   blob local puede aparecer sin que la imagen se detenga: se informa aparte
//   y no cuenta como corte.
// · «pause»: pausa de verdad (la pidió el sistema o el usuario; el video queda
//   en paused = true). Un corte no es una pausa: durante un waiting el video
//   sigue en paused = false.
// · Salto («seeking» → «seeked»): la prueba salta al 50 % del video y el bucle
//   de la prueba larga vuelve al inicio. Un waiting dentro de un salto (o en el
//   segundo siguiente) lo provocó la PRUEBA, no el equipo.
// · Pantalla oculta: un waiting con la pestaña oculta (o en el segundo
//   siguiente a volver) lo provocó el navegador al pausar lo que no se ve.
// Solo los cortes con motivo «equipo» cuentan para el veredicto.
// ============================================================================

export type EventType = 'playing' | 'waiting' | 'stalled' | 'seeking' | 'seeked' | 'hidden' | 'visible' | 'pause'
export interface PlaybackEvent { t: number; type: EventType }
export type CutCause = 'equipo' | 'salto' | 'pantalla_oculta'
export interface Cut { at: number; kind: 'waiting' | 'stalled'; ms: number | null; cause: CutCause }
export interface CutSummary {
  cuts: Cut[]
  /** Cortes reales del equipo (waiting con motivo «equipo») y su duración total. */
  device: number
  deviceMs: number
  bySeek: number
  byHidden: number
  /** stalled (sin datos ~3 s), cualquiera sea el motivo: informativo. */
  stalled: number
  pauses: number
}

/** Margen después de un salto o de volver a mostrar la pestaña. */
export const GRACE_MS = 1000

export const CAUSE_LABEL: Record<CutCause, string> = { equipo: 'equipo', salto: 'salto de la prueba', pantalla_oculta: 'pantalla oculta' }

/** Clasifica los eventos (ordenados por t, en ms) de una reproducción que terminó en endT. */
export function classifyEvents(events: PlaybackEvent[], endT: number): CutSummary {
  const cuts: Cut[] = []
  let seeking = false
  let lastSeekedAt = -Infinity
  let hidden = false
  let lastVisibleAt = -Infinity
  let pauses = 0
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    switch (e.type) {
      case 'seeking': seeking = true; break
      case 'seeked': seeking = false; lastSeekedAt = e.t; break
      case 'hidden': hidden = true; break
      case 'visible': hidden = false; lastVisibleAt = e.t; break
      case 'pause': pauses++; break
      case 'waiting':
      case 'stalled': {
        const cause: CutCause = seeking || e.t - lastSeekedAt <= GRACE_MS
          ? 'salto'
          : hidden || e.t - lastVisibleAt <= GRACE_MS ? 'pantalla_oculta' : 'equipo'
        let ms: number | null = null
        if (e.type === 'waiting') {
          const resumed = events.slice(i + 1).find((x) => x.type === 'playing')
          ms = Math.max(0, Math.round((resumed ? resumed.t : endT) - e.t))
        }
        cuts.push({ at: Math.round(e.t), kind: e.type, ms, cause })
        break
      }
      default: break
    }
  }
  const waits = cuts.filter((c) => c.kind === 'waiting')
  const device = waits.filter((c) => c.cause === 'equipo')
  return {
    cuts,
    device: device.length,
    deviceMs: device.reduce((a, c) => a + (c.ms ?? 0), 0),
    bySeek: waits.filter((c) => c.cause === 'salto').length,
    byHidden: waits.filter((c) => c.cause === 'pantalla_oculta').length,
    stalled: cuts.filter((c) => c.kind === 'stalled').length,
    pauses,
  }
}

/** Registra en `events` los eventos del <video> y de visibilidad; devuelve la función para dejar de escuchar. */
export function recordEvents(v: HTMLVideoElement, events: PlaybackEvent[], t0: number, opts: { ignorePauseWhile?: () => boolean } = {}): () => void {
  const push = (type: EventType) => events.push({ t: performance.now() - t0, type })
  const handlers: Array<[EventTarget, string, () => void]> = [
    [v, 'playing', () => push('playing')],
    [v, 'waiting', () => push('waiting')],
    [v, 'stalled', () => push('stalled')],
    [v, 'seeking', () => push('seeking')],
    [v, 'seeked', () => push('seeked')],
    [v, 'pause', () => { if (!opts.ignorePauseWhile?.()) push('pause') }],
    [document, 'visibilitychange', () => push(document.visibilityState === 'hidden' ? 'hidden' : 'visible')],
  ]
  if (document.visibilityState === 'hidden') push('hidden')
  for (const [t, n, h] of handlers) t.addEventListener(n, h)
  return () => { for (const [t, n, h] of handlers) t.removeEventListener(n, h) }
}

/** «+12,3 s waiting 840 ms → equipo» */
export function formatCut(c: Cut): string {
  const at = `+${(c.at / 1000).toFixed(1).replace('.', ',')} s`
  return `${at} ${c.kind}${c.ms !== null ? ` ${c.ms} ms` : ''} → ${CAUSE_LABEL[c.cause]}`
}

// ── Memoria ─────────────────────────────────────────────────────────────────
// performance.memory es SOLO el heap de JavaScript de la página, redondeado
// por el navegador: no incluye el video (decodificador y búferes viven en
// otro proceso). Con aislamiento de origen (/diagnostico manda COOP/COEP),
// Chrome ofrece measureUserAgentSpecificMemory(): JS + DOM de la página,
// más preciso, pero TAMPOCO incluye el video. Ninguna API web mide la memoria
// del decodificador; en la prueba larga lo que delata falta de memoria es que
// la página se recargue sola, el video se congele o aparezcan errores.
export type MemorySource = 'pagina' | 'heap_js' | 'no_disponible'
export const MEMORY_SOURCE_LABEL: Record<MemorySource, string> = {
  pagina: 'memoria de la página (JS + DOM, sin el video)',
  heap_js: 'solo heap de JavaScript (aproximado, sin el video)',
  no_disponible: 'el navegador no informa memoria',
}

export async function measureMemory(timeoutMs = 30_000): Promise<{ mb: number | null; source: MemorySource }> {
  const p = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
    memory?: { usedJSHeapSize: number }
  }
  if (window.crossOriginIsolated && typeof p.measureUserAgentSpecificMemory === 'function') {
    try {
      const r = await Promise.race([
        p.measureUserAgentSpecificMemory(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ])
      return { mb: Math.round((r.bytes / 1048576) * 10) / 10, source: 'pagina' }
    } catch { /* se usa el heap */ }
  }
  if (p.memory) return { mb: Math.round(p.memory.usedJSHeapSize / 1048576), source: 'heap_js' }
  return { mb: null, source: 'no_disponible' }
}

// ── Prueba larga: resumen comparable entre equipos ──────────────────────────
export interface SoakMinute {
  min: number
  memMB: number | null
  /** Cuadros perdidos y totales EN ese minuto. */
  dropped: number | null
  frames: number | null
  /** Cortes del equipo en ese minuto y su duración. */
  cuts: number
  cutMs: number
  /** El video no avanzó ≥ 10 s seguidos sin estar en pausa ni oculto. */
  frozen: boolean
  hidden: boolean
}
export interface SoakSummary {
  minutes: number
  plannedMinutes: number
  cutsPerHour: number
  stuckSeconds: number
  droppedPct: number | null
  frozenMinutes: number
  memStartMB: number | null
  memPeakMB: number | null
  memEndMB: number | null
  /** Pendiente de memoria (MB por hora) entre el promedio de los primeros y los últimos 10 min. */
  memSlopeMBh: number | null
  hiddenMinutes: number
}

export function summarizeSoak(timeline: SoakMinute[], plannedMinutes: number): SoakSummary {
  const n = timeline.length
  const cuts = timeline.reduce((a, m) => a + m.cuts, 0)
  const cutMs = timeline.reduce((a, m) => a + m.cutMs, 0)
  const frames = timeline.reduce((a, m) => a + (m.frames ?? 0), 0)
  const dropped = timeline.reduce((a, m) => a + (m.dropped ?? 0), 0)
  const mems = timeline.map((m) => m.memMB).filter((x): x is number => x !== null)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  let slope: number | null = null
  if (n >= 30) {
    const head = avg(timeline.slice(0, 10).map((m) => m.memMB).filter((x): x is number => x !== null))
    const tail = avg(timeline.slice(-10).map((m) => m.memMB).filter((x): x is number => x !== null))
    if (head !== null && tail !== null) slope = Math.round(((tail - head) / ((n - 10) / 60)) * 10) / 10
  }
  return {
    minutes: n,
    plannedMinutes,
    cutsPerHour: n ? Math.round((cuts / (n / 60)) * 10) / 10 : 0,
    stuckSeconds: Math.round(cutMs / 1000),
    droppedPct: frames > 0 ? Math.round((dropped / frames) * 1000) / 10 : null,
    frozenMinutes: timeline.filter((m) => m.frozen).length,
    memStartMB: mems[0] ?? null,
    memPeakMB: mems.length ? Math.max(...mems) : null,
    memEndMB: mems.length ? mems[mems.length - 1] : null,
    memSlopeMBh: slope,
    hiddenMinutes: timeline.filter((m) => m.hidden).length,
  }
}

/** Criterio de aprobación de la prueba larga (el mismo en todos los equipos). */
export function soakVerdict(s: SoakSummary, interrupted: boolean, errors: number): 'ok' | 'warn' | 'fail' {
  if (interrupted || errors > 0 || s.frozenMinutes > 0) return 'fail'
  if (s.minutes < s.plannedMinutes) return 'warn'
  if (s.cutsPerHour > 1 || (s.droppedPct ?? 0) > 1 || (s.memSlopeMBh ?? 0) > 50 || s.hiddenMinutes > 0) return 'warn'
  return 'ok'
}
