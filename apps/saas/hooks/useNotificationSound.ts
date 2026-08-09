'use client'

import { useCallback, useRef } from 'react'

export function useNotificationSound(src = '/LLAMADA.mp3') {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = useCallback((loop = false) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(src)
        audioRef.current.volume = 0.8
      }
      audioRef.current.loop = loop
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        // Autoplay blocked — ignore silently
      })
    } catch {
      // SSR or unsupported environment
    }
  }, [src])

  const stop = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.loop = false
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    } catch {
      // SSR or unsupported environment
    }
  }, [])

  const playOnce = useCallback(() => {
    try {
      const once = new Audio(src)
      once.volume = 0.8
      once.play().catch(() => {})
    } catch {
      // SSR or unsupported environment
    }
  }, [src])

  return { play, stop, playOnce }
}
