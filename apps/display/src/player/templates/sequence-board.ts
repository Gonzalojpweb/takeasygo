// ============================================================================
// Secuencia de marca (Proximo_Nivel §3): 2 a 5 pasos de Studio encadenados
// ============================================================================
// Cada paso se dibuja con el mismo motor de Studio (su diseño, su animación,
// la carta vinculada) durante su duración; al terminar entra el siguiente con
// la transición elegida (fundido, barrido, zoom o deslizar). La secuencia se
// repite `loops` veces y después termina (la pantalla pasa a la pieza
// siguiente). Un paso que no se puede dibujar se saltea. Cada paso que se
// mostró se informa (onStep) para el proof of play.
// ============================================================================

import { playStudioBoard } from './studio-board'
import { stepIn, stepOut } from './motion'
import { studioSupported, type Freshness, type SequenceBoard } from '../board'

export interface PlaySequenceOptions {
  host: HTMLElement
  board: SequenceBoard
  nowMs: () => number
  timeZone?: string | null
  freshness: Freshness
  objectUrl: (url: string) => Promise<string | null>
  orderUrl?: string | null
  onShown: () => void
  onDone: (ok: boolean, reason?: string) => void
  /** Paso mostrado: índice, inicio y fin (performance.now()). */
  onStep?: (step: number, startMs: number, endMs: number) => void
}

export function playSequenceBoard(o: PlaySequenceOptions): () => void {
  const steps = o.board.steps.map((s, i) => ({ ...s, index: i })).filter((s) => studioSupported(s.board))
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  o.host.style.cssText = 'position:absolute;inset:0;overflow:hidden'
  let cancelled = false
  let stopStep: (() => void) | null = null
  let shown = false
  let current: HTMLElement | null = null
  if (!steps.length) { setTimeout(() => o.onDone(false, 'sin pasos'), 0); return () => {} }
  const total = steps.length * Math.max(1, o.board.loops)

  const run = (n: number) => {
    if (cancelled) return
    if (n >= total) { o.onDone(true); return }
    const s = steps[n % steps.length]
    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;will-change:transform,opacity'
    const inner = document.createElement('div')
    wrap.append(inner)
    o.host.append(wrap)
    const prev = current
    current = wrap
    let started = 0
    // El paso dura lo suyo; el fundido propio de Studio se reemplaza por la transición de la secuencia.
    const board = { ...s.board, pageMs: s.durationMs, pages: 1 }
    stopStep = playStudioBoard({
      host: inner,
      board,
      nowMs: o.nowMs,
      timeZone: o.timeZone,
      freshness: o.freshness,
      objectUrl: o.objectUrl,
      orderUrl: o.orderUrl,
      inSequence: true,
      onShown: () => {
        started = performance.now()
        if (!shown) { shown = true; o.onShown() }
        stepIn(wrap, s.transition, reduced)
        if (prev) stepOut(prev, s.transition, reduced, () => prev.remove())
      },
      onDone: (ok, reason) => {
        if (cancelled || reason === 'cancelada') return
        if (started) o.onStep?.(s.index, started, performance.now())
        if (!ok && !started) { wrap.remove(); current = prev }
        run(n + 1)
      },
    })
  }
  run(0)
  return () => { cancelled = true; stopStep?.(); o.onDone(false, 'cancelada') }
}
