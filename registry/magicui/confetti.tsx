'use client'

import { useCallback, useImperativeHandle, forwardRef } from 'react'
import confetti from 'canvas-confetti'

export interface ConfettiRef {
  fire: (options?: confetti.Options) => void
}

interface ConfettiProps {
  className?: string
}

export const Confetti = forwardRef<ConfettiRef, ConfettiProps>(
  function Confetti({ className }, ref) {
    const fire = useCallback((options?: confetti.Options) => {
      const defaults: confetti.Options = {
        particleCount: 80,
        spread: 100,
        origin: { y: 0.4 },
        colors: ['#f54500', '#10b981', '#3b82f6', '#f59e0b', '#e11d48'],
      }
      confetti({ ...defaults, ...options })
    }, [])

    useImperativeHandle(ref, () => ({ fire }), [fire])

    return <div className={className} aria-hidden="true" />
  }
)
