'use client'

import { useCallback } from 'react'

/**
 * useHaptic — Hook para feedback háptico en dispositivos móviles.
 *
 * Usa la vibration API del navegador. En desktop no hace nada (silencioso).
 * Patrón: impact ligero para tap, selection para toggle, success/error para resultados.
 *
 * @example
 * const haptic = useHaptic()
 * haptic.impact('light')  // tap en botón
 * haptic.selection()      // toggle/filtro
 * haptic.success()        // operación exitosa
 */

type ImpactStyle = 'light' | 'medium' | 'heavy'

const DURATIONS = {
  light: 10,
  medium: 20,
  heavy: 30,
} as const

export function useHaptic() {
  const vibrate = useCallback((duration: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  }, [])

  const impact = useCallback(
    (style: ImpactStyle = 'light') => {
      vibrate(DURATIONS[style])
    },
    [vibrate]
  )

  const selection = useCallback(() => {
    vibrate(5)
  }, [vibrate])

  const success = useCallback(() => {
    vibrate([10, 30, 10])
  }, [vibrate])

  const error = useCallback(() => {
    vibrate([30, 50, 30, 50, 30])
  }, [vibrate])

  const warning = useCallback(() => {
    vibrate([20, 40, 20])
  }, [vibrate])

  return { impact, selection, success, error, warning }
}
