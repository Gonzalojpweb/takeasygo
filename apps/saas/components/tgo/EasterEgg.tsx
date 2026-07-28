'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * useEasterEgg — Hook para detectar secuencias de konami code o taps rápidos.
 *
 * Patrón: detecta 5 taps rápidos en el logo de TGO.
 * Cuando se activa, muestra un mensaje playfule por 3 segundos.
 *
 * @example
 * const { show, trigger } = useEasterEgg()
 * <div onClick={trigger}>Logo</div>
 * {show && <EasterEggToast message="Easter egg encontrado!" />}
 */

export function useEasterEgg(tapsRequired = 5, timeoutMs = 2000) {
  const [tapCount, setTapCount] = useState(0)
  const [show, setShow] = useState(false)
  const [lastTap, setLastTap] = useState(0)

  const trigger = useCallback(() => {
    const now = Date.now()
    if (now - lastTap > timeoutMs) {
      setTapCount(1)
    } else {
      setTapCount((prev) => prev + 1)
    }
    setLastTap(now)
  }, [lastTap, timeoutMs])

  useEffect(() => {
    if (tapCount >= tapsRequired) {
      setShow(true)
      setTapCount(0)
      if ('vibrate' in navigator) navigator.vibrate([50, 30, 50])
      const timer = setTimeout(() => setShow(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [tapCount, tapsRequired])

  return { show, trigger }
}

interface EasterEggToastProps {
  message: string
}

export function EasterEggToast({ message }: EasterEggToastProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-lg max-w-[280px] text-center"
        style={{
          backgroundColor: 'var(--tgo-card)',
          border: '1px solid var(--tgo-brand-primary)',
          color: 'var(--tgo-text-primary)',
        }}
      >
        <span className="text-sm font-bold">{message}</span>
      </motion.div>
    </AnimatePresence>
  )
}
