'use client'

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BellRing, Clock, X, Hand, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useKnockSound } from '@/hooks/useKnockSound'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { useHaptic } from '@/components/tgo/useHaptic'
import type { OrderAlertItem } from './types'

interface OrderAlertPopupProps {
  /** Cola de alertas pendientes — se muestra la primera; el resto espera. */
  queue: OrderAlertItem[]
  /** Sonido habilitado (toggle del toolbar). El popup se muestra igual; solo silencia knock+ring. */
  soundEnabled?: boolean
  /** Atender: selecciona el pedido en el board y quita la alerta de la cola. */
  onAttend: (item: OrderAlertItem) => void
  /** Cerrar sin atender: quita la alerta de la cola (no se repite). */
  onDismiss: (item: OrderAlertItem) => void
}

/**
 * OrderAlertPopup — alerta total estilo Rappi/PedidosYa:
 * - Pedidos NUEVOS al board (cualquier tipo: transferencia, MP, efectivo,
 *   inmediato o programado) — headline '¡Nuevo pedido!'.
 * - Pedidos programados que alcanzan el T-lead de impresión.
 *
 * - Popup modal centrado con backdrop (spring de entrada).
 * - Sacudida `animate-nudge` + puño `knock-fist-anim` (se desactivan con
 *   prefers-reduced-motion vía CSS; popup + sonido se mantienen).
 * - Knock sintetizado (Web Audio) al entrar un alert nuevo + LLAMADA.mp3 en
 *   loop como refuerzo mientras haya cola.
 * - Parpadeo del document.title para atraer atención si la pestaña está en
 *   segundo plano. Se restaura al vaciarse la cola.
 * - Cierre exactly-once: atender/cerrar saca el item de la cola; el hook
 *   detector (padre) se encarga de no re-disparar.
 */
export function OrderAlertPopup({ queue, soundEnabled = true, onAttend, onDismiss }: OrderAlertPopupProps) {
  const current = queue[0]
  const { knock, stop: stopKnock } = useKnockSound()
  const { play: playRing, stop: stopRing } = useNotificationSound('/LLAMADA.mp3')
  const { warning: hapticWarning } = useHaptic()
  const seenIdsRef = useRef<Set<string>>(new Set())
  const originalTitleRef = useRef<string | null>(null)

  // Nuevos alert en cola → knock + haptic + ring loop (respeta toggle de sonido)
  useEffect(() => {
    if (queue.length === 0) {
      seenIdsRef.current = new Set()
      stopKnock()
      stopRing()
      return
    }
    const fresh = queue.filter(item => !seenIdsRef.current.has(item.id))
    if (fresh.length > 0) {
      fresh.forEach(item => seenIdsRef.current.add(item.id))
      if (soundEnabled) {
        knock()
        playRing(true)
      }
      hapticWarning()
    }
  }, [queue, knock, hapticWarning, playRing, stopRing, stopKnock, soundEnabled])

  // Flash del document.title mientras haya alertas
  useEffect(() => {
    if (queue.length === 0) {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current
        originalTitleRef.current = null
      }
      return
    }
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title
    }
    let flip = false
    const interval = setInterval(() => {
      flip = !flip
      document.title = flip
        ? `🔔 (${queue.length}) ¡Pedido por atender!`
        : originalTitleRef.current ?? ''
    }, 1500)
    return () => clearInterval(interval)
  }, [queue.length])

  // Cerrar todo al desmontar (restaura título, corta audio)
  useEffect(() => {
    return () => {
      stopKnock()
      stopRing()
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current
        originalTitleRef.current = null
      }
    }
  }, [stopKnock, stopRing])

  const handleAttend = useCallback(() => {
    if (!current) return
    stopKnock()
    stopRing()
    onAttend(current)
  }, [current, onAttend, stopKnock, stopRing])

  const handleDismiss = useCallback(() => {
    if (!current) return
    stopKnock()
    stopRing()
    onDismiss(current)
  }, [current, onDismiss, stopKnock, stopRing])

  return (
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={handleDismiss}
          />

          {/* Popup card */}
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={current.headline ?? 'Pedido programado por atender'}
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: 'spring', damping: 22, stiffness: 340 }}
            className="relative w-full max-w-[400px]"
          >
            {/* Shake Messenger — wrapper interno para no pisar el transform de framer-motion */}
            <div className="animate-nudge overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-b from-amber-50 to-white shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
              {/* Header ámbar */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-white">
                <div className="animate-knock-fist flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Hand size={22} className="rotate-[-20deg]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wide">
                    <BellRing size={14} />
                    {current.headline ?? '¡Es hora de prepararlo!'}
                  </p>
                  <p className="truncate text-[12.5px] font-medium text-white/90">
                    {current.subline ?? 'Pedido programado alcanzó el tiempo de impresión'}
                  </p>
                </div>
                {queue.length > 1 && (
                  <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                    {queue.length}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                <p className="text-[15px] font-extrabold text-foreground">{current.title}</p>
                {current.description && (
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Clock size={13} className="shrink-0" />
                    {current.description}
                  </p>
                )}

                <div className="mt-4 flex gap-2.5">
                  <button
                    onClick={handleAttend}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5',
                      'text-[13.5px] font-bold text-white shadow-sm transition-all hover:bg-amber-600 active:scale-[0.97]'
                    )}
                  >
                    <Check size={15} />
                    Atender
                  </button>
                  <button
                    onClick={handleDismiss}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5',
                      'text-[13.5px] font-semibold text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]'
                    )}
                  >
                    <X size={15} />
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
