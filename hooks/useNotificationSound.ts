'use client'

import { useCallback, useRef } from 'react'

export function useNotificationSound(src = '/LLAMADA.mp3') {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(src)
        audioRef.current.volume = 0.8
      }
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        // Autoplay blocked — ignore silently
      })
    } catch {
      // SSR or unsupported environment
    }
  }, [src])

  return play
}
