'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// useStoryPlayer — reproductor compartido de los visores de stories (20/11/2026)
// ============================================================================
// Lo usan AppStoryViewer (stories TGO) y PromotionStories (promos del menú).
//  · Avance por tiempo; el tiempo transcurrido se ACUMULA al pausar (antes
//    reanudar volvía la pieza a cero).
//  · Mantener apretado (≥ 200 ms, dedo o mouse) pausa; soltar reanuda sin
//    navegar. Toque corto: 30 % izquierdo atrás, resto adelante. Deslizar
//    > 50 px también navega.
//  · Pausa con la app en segundo plano.
//  · Callbacks para métricas: vista (1 s en pantalla), completada (la barra
//    llegó sola al 100 %) y salida (cerrar, saltar o deslizar desde la última
//    pieza, o pasar a segundo plano), una salida por apertura.
// ============================================================================

export type StoryExitReason = 'close' | 'skip' | 'swipe' | 'background'

export const HOLD_MS = 200
export const SWIPE_PX = 50
export const VIEW_MS = 1000

/**
 * Reloj de una pieza: acumula el tiempo al pausar (antes, reanudar volvía la
 * pieza a cero). `now` inyectable para tests.
 */
export class StoryClock {
  private elapsed = 0
  private segStart: number | null
  constructor(private now: () => number = () => performance.now(), running = true) {
    this.segStart = running ? now() : null
  }
  get running() { return this.segStart !== null }
  read(): number { return this.elapsed + (this.segStart === null ? 0 : this.now() - this.segStart) }
  pause(): void { if (this.segStart !== null) { this.elapsed += this.now() - this.segStart; this.segStart = null } }
  resume(): void { if (this.segStart === null) this.segStart = this.now() }
  reset(running: boolean): void { this.elapsed = 0; this.segStart = running ? this.now() : null }
}

/** Qué hace un gesto al soltar: reanudar (fue mantener), deslizar o nada (lo resuelve el click). */
export function classifyRelease(startX: number | null, endX: number | null, held: boolean): 'resume' | 'prev' | 'next' | 'none' {
  if (held) return 'resume'
  if (startX !== null && endX !== null && Math.abs(endX - startX) > SWIPE_PX) return endX > startX ? 'prev' : 'next'
  return 'none'
}

/** Toque corto: 30 % izquierdo atrás, el resto adelante. */
export function tapDirection(offsetX: number, width: number): 'prev' | 'next' {
  return offsetX < width * 0.3 ? 'prev' : 'next'
}

export function useStoryPlayer({
  count,
  durationMs,
  initialIndex = 0,
  onClose,
  onView,
  onComplete,
  onExit,
}: {
  count: number
  /** Duración por pieza (ms): fija o según el índice (video = duración real). */
  durationMs: number | ((index: number) => number)
  initialIndex?: number
  onClose: () => void
  onView?: (index: number) => void
  onComplete?: (index: number) => void
  onExit?: (reason: StoryExitReason, index: number) => void
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, count - 1)))
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  /** Motivos de pausa activos (hold, hidden, loading, saveData…). */
  const [pauseList, setPauseList] = useState<string[]>([])

  const indexRef = useRef(index)
  indexRef.current = index
  const clockRef = useRef<StoryClock | null>(null)
  if (!clockRef.current) clockRef.current = new StoryClock(() => performance.now(), false)
  const pauseReasons = useRef(new Set<string>())
  const viewedRef = useRef(new Set<number>())
  const exitedRef = useRef(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heldRef = useRef(false)
  const pointerX = useRef<number | null>(null)
  const suppressClickUntil = useRef(0)

  const cbs = useRef({ onClose, onView, onComplete, onExit })
  cbs.current = { onClose, onView, onComplete, onExit }
  const durRef = useRef(durationMs)
  durRef.current = durationMs
  const durationOf = (i: number) => {
    const d = typeof durRef.current === 'function' ? durRef.current(i) : durRef.current
    return Number.isFinite(d) && d > 0 ? d : 7000
  }

  const elapsedNow = () => clockRef.current!.read()

  const addPause = useCallback((reason: string) => {
    if (pauseReasons.current.has(reason)) return
    pauseReasons.current.add(reason)
    clockRef.current!.pause()
    setPaused(true)
    setPauseList([...pauseReasons.current])
  }, [])

  const removePause = useCallback((reason: string) => {
    if (!pauseReasons.current.delete(reason)) return
    setPauseList([...pauseReasons.current])
    if (pauseReasons.current.size === 0) {
      clockRef.current!.resume()
      setPaused(false)
    }
  }, [])

  const exit = useCallback((reason: StoryExitReason) => {
    if (exitedRef.current) return
    exitedRef.current = true
    cbs.current.onExit?.(reason, indexRef.current)
  }, [])

  const goTo = useCallback((i: number) => {
    if (i < 0 || i >= count) return
    clockRef.current!.reset(pauseReasons.current.size === 0)
    setProgress(0)
    setIndex(i)
  }, [count])

  const close = useCallback((reason: StoryExitReason = 'close') => {
    exit(reason)
    cbs.current.onClose()
  }, [exit])

  /** Avanzar a mano (toque o deslizar); desde la última pieza cierra. */
  const next = useCallback((reason: 'skip' | 'swipe' = 'skip') => {
    if (indexRef.current < count - 1) goTo(indexRef.current + 1)
    else close(reason)
  }, [count, goTo, close])

  const prev = useCallback(() => goTo(indexRef.current - 1), [goTo])

  // Reloj
  useEffect(() => {
    if (count === 0) return
    if (pauseReasons.current.size === 0) clockRef.current!.resume()
    let raf = 0
    const tick = () => {
      const i = indexRef.current
      const elapsed = elapsedNow()
      if (elapsed >= VIEW_MS && !viewedRef.current.has(i)) {
        viewedRef.current.add(i)
        cbs.current.onView?.(i)
      }
      const pct = Math.min(elapsed / durationOf(i), 1)
      setProgress(pct)
      if (pct >= 1) {
        cbs.current.onComplete?.(i)
        if (i < count - 1) goTo(i + 1)
        else { exitedRef.current = true; cbs.current.onClose() } // terminó sola: no es salida
        return
      }
      raf = requestAnimationFrame(tick)
    }
    if (!paused) raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, count, goTo])

  // Segundo plano: pausa y cuenta como salida (una vez por apertura).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') { addPause('hidden'); exit('background') }
      else removePause('hidden')
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [addPause, removePause, exit])

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current) }, [])

  // ── Gestos ────────────────────────────────────────────────────────────────
  const pressStart = (x: number) => {
    pointerX.current = x
    heldRef.current = false
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => { heldRef.current = true; addPause('hold') }, HOLD_MS)
  }

  /** true = el gesto ya se resolvió (pausa o deslizar); el click no navega. */
  const pressEnd = (x: number | null): boolean => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    const startX = pointerX.current
    pointerX.current = null
    const action = classifyRelease(startX, x, heldRef.current)
    heldRef.current = false
    if (action === 'none') return false
    if (action === 'resume') removePause('hold')
    else if (action === 'prev') prev()
    else next('swipe')
    suppressClickUntil.current = Date.now() + 400
    return true
  }

  const handlers = {
    onTouchStart: (e: React.TouchEvent) => pressStart(e.touches[0]?.clientX ?? 0),
    onTouchEnd: (e: React.TouchEvent) => { pressEnd(e.changedTouches[0]?.clientX ?? null) },
    onTouchCancel: () => { pressEnd(null) },
    onMouseDown: (e: React.MouseEvent) => pressStart(e.clientX),
    onMouseUp: (e: React.MouseEvent) => { pressEnd(e.clientX) },
    onMouseLeave: () => { if (pointerX.current !== null) pressEnd(null) },
    onClick: (e: React.MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (tapDirection(e.clientX - rect.left, rect.width) === 'prev') prev()
      else next('skip')
    },
  }

  /** Pausa externa (p. ej., el video está cargando). */
  const hold = useCallback((reason: string, on: boolean) => { if (on) addPause(reason); else removePause(reason) }, [addPause, removePause])

  return { index, progress, paused, pauseReasons: pauseList, goTo, close, handlers, hold }
}
