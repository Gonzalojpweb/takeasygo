'use client'

import { useCallback, useImperativeHandle, forwardRef, useRef } from 'react'
import confetti from 'canvas-confetti'

export interface ConfettiRef {
  fire: (options?: confetti.Options) => void
}

interface ConfettiProps {
  className?: string
}

export const Confetti = forwardRef<ConfettiRef, ConfettiProps>(
  function Confetti({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const instanceRef = useRef<confetti.CreateTypes | null>(null)

    const fire = useCallback((options?: confetti.Options) => {
      const canvas = canvasRef.current
      if (!canvas) return

      if (!instanceRef.current) {
        instanceRef.current = confetti.create(canvas, { resize: true })
      }

      instanceRef.current({
        particleCount: 80,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#f54500', '#10b981', '#3b82f6', '#f59e0b', '#e11d48'],
        ...options,
      })
    }, [])

    useImperativeHandle(ref, () => ({ fire }), [fire])

    return (
      <canvas
        ref={canvasRef}
        className={className}
        aria-hidden="true"
      />
    )
  }
)
