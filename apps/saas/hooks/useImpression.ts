'use client'

import { useEffect, useRef, type RefObject } from 'react'

// ============================================================================
// useImpression — «se vio» = 50 % visible durante 1 s seguido (20/11/2026)
// ============================================================================
// IntersectionObserver al 50 % (mismo umbral que combos) + permanencia de 1 s.
// Si el elemento sale de pantalla o la pestaña se oculta antes, se cancela.
// Dispara una sola vez por montaje; la deduplicación por sesión la hace quien
// llama (trackPlacementOnce).
// ============================================================================

export function useImpression(
  ref: RefObject<Element | null>,
  onImpression: () => void,
  { threshold = 0.5, dwellMs = 1000, enabled = true }: { threshold?: number; dwellMs?: number; enabled?: boolean } = {},
): void {
  const cb = useRef(onImpression)
  cb.current = onImpression

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    let visible = false
    let done = false

    const cancel = () => { if (timer) { clearTimeout(timer); timer = null } }
    const arm = () => {
      if (done || timer || !visible || document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        timer = null
        if (done || !visible) return
        done = true
        obs.disconnect()
        document.removeEventListener('visibilitychange', onVis)
        cb.current()
      }, dwellMs)
    }
    const onVis = () => { if (document.visibilityState === 'visible') arm(); else cancel() }

    const obs = new IntersectionObserver(([entry]) => {
      visible = !!entry && entry.isIntersecting && entry.intersectionRatio >= threshold
      if (visible) arm()
      else cancel()
    }, { threshold })
    obs.observe(el)
    document.addEventListener('visibilitychange', onVis)
    return () => { done = true; cancel(); obs.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [ref, threshold, dwellMs, enabled])
}
