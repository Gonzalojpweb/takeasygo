'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * useKnockSound — knock sintetizado con Web Audio API (sin assets externos).
 *
 * Reproduce 3 golpes graves (~90Hz + ráfaga de ruido) sincronizados con el
 * keyframe `knock-fist` de globals.css (golpes a ~0.2s / 0.5s / 0.8s dentro
 * de una animación de 1.4s). El popup y este sonido se mantienen activos
 * aunque `prefers-reduced-motion` esté activo (solo shake/puño se desactivan).
 *
 * Política de autoplay: si el AudioContext está suspendido se intenta resume()
 * silenciosamente; en el peor caso no suena pero nunca lanza error.
 */

const KNOCK_TIMES = [0.2, 0.5, 0.8] // s — alineados con knock-fist (14%, 36%, 58% de 1.4s)
const KNOCK_FREQ = 90 // Hz — golpe grave
const KNOCK_DURATION = 0.14 // s — decaimiento de cada golpe
const NOISE_DURATION = 0.06 // s — componente de "madera"

export function useKnockSound() {
  const ctxRef = useRef<AudioContext | null>(null)
  const sequenceRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const getContext = useCallback(() => {
    try {
      if (!ctxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioCtx) return null
        ctxRef.current = new AudioCtx()
      }
      if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume().catch(() => {})
      }
      return ctxRef.current
    } catch {
      return null
    }
  }, [])

  const hit = useCallback(
    (ctx: AudioContext, when: number) => {
      // Tono grave del golpe
      const osc = ctx.createOscillator()
      const oscGain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(KNOCK_FREQ, when)
      osc.frequency.exponentialRampToValueAtTime(KNOCK_FREQ * 0.6, when + KNOCK_DURATION)
      oscGain.gain.setValueAtTime(0.9, when)
      oscGain.gain.exponentialRampToValueAtTime(0.001, when + KNOCK_DURATION)
      osc.connect(oscGain).connect(ctx.destination)
      osc.start(when)
      osc.stop(when + KNOCK_DURATION + 0.02)

      // Ráfaga de ruido (textura de madera)
      const frames = Math.floor(ctx.sampleRate * NOISE_DURATION)
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i++) {
        // eslint-disable-next-line security/detect-object-injection
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
      }
      const noise = ctx.createBufferSource()
      const noiseGain = ctx.createGain()
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1200
      noise.buffer = buffer
      noiseGain.gain.setValueAtTime(0.5, when)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, when + NOISE_DURATION)
      noise.connect(filter).connect(noiseGain).connect(ctx.destination)
      noise.start(when)
    },
    []
  )

  const knock = useCallback(() => {
    const ctx = getContext()
    if (!ctx) return
    // Evita solapar secuencias (exactly-once por disparo)
    if (sequenceRef.current.length > 0) return
    const now = ctx.currentTime + 0.05
    KNOCK_TIMES.forEach(t => hit(ctx, now + t))
    // Referencias para poder cancelar si llega un stop() inmediato
    sequenceRef.current = KNOCK_TIMES.map(t =>
      setTimeout(() => {}, t * 1000 + 300)
    )
    setTimeout(() => {
      sequenceRef.current = []
    }, (KNOCK_TIMES[KNOCK_TIMES.length - 1] + KNOCK_DURATION) * 1000 + 300)
  }, [getContext, hit])

  const stop = useCallback(() => {
    sequenceRef.current.forEach(id => clearTimeout(id))
    sequenceRef.current = []
    // Corta todo el audio pendiente del contexto (golpes en curso)
    const ctx = ctxRef.current
    if (ctx && ctx.state === 'running') {
      ctx.suspend().catch(() => {})
      // Reanudar diferido para el próximo knock
      setTimeout(() => ctx.resume().catch(() => {}), 100)
    }
  }, [])

  useEffect(() => {
    return () => {
      sequenceRef.current.forEach(id => clearTimeout(id))
      sequenceRef.current = []
      const ctx = ctxRef.current
      ctxRef.current = null
      ctx?.close().catch(() => {})
    }
  }, [])

  return { knock, stop }
}
