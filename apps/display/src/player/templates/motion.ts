// ============================================================================
// Librería de movimiento de Display Studio (Proximo_Nivel §4)
// ============================================================================
// Presets reutilizables, solo transform y opacity (rápidos en Android de gama
// media: RK3568/RK3588). Las plantillas arman su línea de tiempo y el preset
// del comercio la ajusta:
//   · calm     — salón tranquilo: 25 % más lento, loops más suaves.
//   · standard — el diseño tal cual.
//   · impact   — vidriera / tótem exterior: 20 % más rápido y un «respiro»
//                de cámara (zoom muy leve) en loop.
// Transiciones de secuencia: fundido, barrido, zoom y deslizar.
// ============================================================================

import { gsap } from 'gsap'

export type MotionPreset = 'calm' | 'standard' | 'impact'
export type StepTransition = 'fade' | 'wipe' | 'scale' | 'slide'

export function applyMotion(preset: MotionPreset | undefined, tl: gsap.core.Timeline | null, loops: gsap.core.Animation[], canvas: HTMLElement, reduced: boolean): gsap.core.Animation[] {
  const extra: gsap.core.Animation[] = []
  if (preset === 'calm') {
    tl?.timeScale(0.75)
    for (const l of loops) l.timeScale(0.7)
  } else if (preset === 'impact') {
    tl?.timeScale(1.2)
    for (const l of loops) l.timeScale(1.15)
    if (!reduced) extra.push(gsap.to(canvas, { scale: 1.015, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.5, transformOrigin: '50% 50%' }))
  }
  return extra
}

/** Ken Burns controlado sobre una foto grande. */
export const kenBurns = (el: Element, seconds: number, amount = 1.08) =>
  gsap.fromTo(el, { scale: 1, xPercent: 0 }, { scale: amount, xPercent: -1.5, duration: Math.max(4, seconds), ease: 'none' })

/** Cascada de filas (listas, precios). */
export const staggerIn = (tl: gsap.core.Timeline, els: Element[] | NodeListOf<Element>, at: number, distance: number) =>
  tl.from(els, { y: distance, opacity: 0, stagger: 0.08, duration: 0.45, ease: 'power3.out' }, at)

/** Precio que entra con rebote. */
export const priceIn = (tl: gsap.core.Timeline, el: Element, at: number, elastic = false) =>
  tl.from(el, { scale: 0.4, opacity: 0, duration: elastic ? 1 : 0.7, ease: elastic ? 'elastic.out(1, 0.55)' : 'back.out(2)' }, at)

/** Entrada de un paso de secuencia según su transición. */
export function stepIn(el: HTMLElement, t: StepTransition, reduced: boolean): gsap.core.Tween | null {
  if (reduced) { el.style.opacity = '1'; return null }
  switch (t) {
    case 'wipe': return gsap.fromTo(el, { xPercent: -100, opacity: 1 }, { xPercent: 0, duration: 0.7, ease: 'power3.inOut' })
    case 'scale': return gsap.fromTo(el, { scale: 1.12, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'power3.out' })
    case 'slide': return gsap.fromTo(el, { xPercent: 100, opacity: 1 }, { xPercent: 0, duration: 0.65, ease: 'power3.out' })
    default: return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' })
  }
}

/** Salida del paso anterior (acompaña a la entrada del siguiente). */
export function stepOut(el: HTMLElement, t: StepTransition, reduced: boolean, done: () => void) {
  if (reduced) { done(); return }
  const v = t === 'wipe' ? { xPercent: 100 } : t === 'slide' ? { xPercent: -100 } : t === 'scale' ? { scale: 0.92, opacity: 0 } : { opacity: 0 }
  gsap.to(el, { ...v, duration: t === 'fade' ? 0.6 : 0.65, ease: 'power3.inOut', onComplete: done })
}
