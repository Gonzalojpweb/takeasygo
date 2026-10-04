/**
 * hooks/useCelebrate.ts
 * Hook que orquesta la recompensa por completar un paso del onboarding.
 * Efectos:
 *   - Haptic success (via components/tgo/useHaptic.ts)
 *   - Sonido corto (/sfx/reward-chime.mp3, sprite "ding")
 *   - Confetti anclado al origen (botón/elemento)
 *   - Throttle 1.2 s para no spammear si el usuario hace clic rápido.
 *   - Respeto a reduced‑motion (disableForReducedMotion).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { useHaptic } from '@/components/tgo/useHaptic'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { Confetti } from '@/registry/magicui/confetti'
import { useEvent } from '@/hooks/useEvent'

// — config ---------------------------------------------------------
const THROTTLE_MS = 1200 // para evitar doble‑fire en clicks rápidos
const PARTICLE_COUNT = 50
const COLORS = ['#F74211', '#FAB300', '#12B76A', '#7A5AF8', '#3B82F6']

// — hook ---------------------------------------------------------
export function useCelebrate() {
  const [lastFire, setLastFire] = useState<number>(0)
  const haptic = useHaptic()
  const play = useNotificationSound('/sfx/reward-chime.mp3') // sprite "ding" [0,600]

  const fire = useCallback(
    (origin?: { x: number; y: number }) => {
      const now = Date.now()
      if (now - lastFire < THROTTLE_MS) return
      setLastFire(now)

      // 1️⃣ Haptic
      haptic.success()

      // 2️⃣ Sonido
      play() // .mp3 ~9.7 KB, sprite "ding" [0,600]

      // 3️⃣ Confetti (solo en client)
      if (typeof window !== 'undefined' && !window.navigator?.userAgent?.includes('Crawler')) {
        // origin opcional: rect del elemento que disparó el evento
        const opts = {
          particleCount: PARTICLE_COUNT,
          spread: 100,
          origin,
          colors: COLORS,
          disableForReducedMotion: true,
        }
        // Usar canvas-confetti de forma dinámica (4.25 KB) y evitaremos importarlo en el test
        ;(async () => {
          try {
            const { default: confetti } = await import('canvas-confetti')
            confetti(opts)
          } catch {
            // silent – el resto de la recompensa ya se jugó
          }
        })()
      }
    },
    [lastFire, haptic, play]
  )

  return { fire }
}