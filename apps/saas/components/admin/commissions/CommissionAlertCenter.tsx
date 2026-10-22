'use client'

// ============================================================================
// Centro de avisos de comisiones (solo el administrador del comercio)
// ============================================================================
// · Barra fija arriba del contenido: roja si hay semanas vencidas, ámbar si
//   hay una liquidación pendiente, discreta si solo hay comisión acumulada.
// · "Golpe" en pantalla (como un pedido nuevo): popup con sacudida, golpe
//   sintetizado + sonido y vibración. Vencida: se repite cada 2 h; pendiente:
//   una vez por día; también si cambia el monto. Respeta movimiento reducido.
// · Se actualiza solo: cada 5 minutos, al volver a la pestaña y al volver de
//   pagar en MercadoPago.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, BellRing, Coins, Hand, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useKnockSound } from '@/hooks/useKnockSound'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { useHaptic } from '@/components/tgo/useHaptic'
import type { CommissionAlerts } from '@/lib/commission-weeks'
import { alertCopy, shouldPopup, type LastPopup } from '@/lib/commissions-ui'

const REFRESH_MS = 5 * 60_000

function storageKey(slug: string) {
  return `tgo:commission-popup:${slug}`
}
function readLast(slug: string): LastPopup | null {
  try {
    const raw = localStorage.getItem(storageKey(slug))
    return raw ? (JSON.parse(raw) as LastPopup) : null
  } catch {
    return null
  }
}
function writeLast(slug: string, v: LastPopup) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(v))
  } catch {
    // Sin almacenamiento: el aviso puede repetirse antes; no es grave.
  }
}

export default function CommissionAlertCenter({ tenantSlug, initial, canPay }: { tenantSlug: string; initial: CommissionAlerts; canPay: boolean }) {
  const [alerts, setAlerts] = useState<CommissionAlerts>(initial)
  const [popupOpen, setPopupOpen] = useState(false)
  // Reloj del aviso: con el panel abierto, vuelve a evaluar cada 5 minutos
  // (el martes empieza a avisar y una semana vencida se repite cada 2 h
  // aunque el monto no cambie).
  const [tick, setTick] = useState(0)
  const pathname = usePathname()
  const onCommissionsPage = pathname?.includes('/admin/commissions') ?? false
  const { knock, stop: stopKnock } = useKnockSound()
  const { play: playRing, stop: stopRing } = useNotificationSound('/LLAMADA.mp3')
  const { warning: hapticWarning } = useHaptic()
  const dialogRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/commissions/alerts`, { cache: 'no-store' })
      if (res.ok) setAlerts(await res.json())
    } catch {
      // Sin conexión: se mantiene el último estado conocido.
    }
  }, [tenantSlug])

  useEffect(() => {
    const id = setInterval(() => {
      refresh()
      setTick((t) => t + 1)
    }, REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const owedCents = alerts.level === 'vencida' ? alerts.overdue.cents : alerts.pending.cents

  // ¿Golpear la pantalla? (no en la propia página de comisiones: ya está ahí)
  // La decisión depende del navegador (último aviso guardado): se toma fuera
  // del render, en el próximo tick, y se cancela si cambia antes.
  useEffect(() => {
    if (onCommissionsPage) return
    const id = window.setTimeout(() => {
      if (!shouldPopup(alerts.level, owedCents, readLast(tenantSlug), Date.now(), alerts.pending.notifyFrom)) return
      writeLast(tenantSlug, { level: alerts.level, cents: owedCents, at: Date.now() })
      lastFocus.current = document.activeElement as HTMLElement | null
      setPopupOpen(true)
      knock()
      playRing(false)
      hapticWarning()
    }, 0)
    return () => window.clearTimeout(id)
  }, [alerts.level, alerts.pending.notifyFrom, owedCents, tenantSlug, onCommissionsPage, knock, playRing, hapticWarning, tick])

  const close = useCallback(() => {
    stopKnock()
    stopRing()
    setPopupOpen(false)
    lastFocus.current?.focus?.()
  }, [stopKnock, stopRing])

  // Foco al abrir y Escape para cerrar (alertdialog accesible).
  useEffect(() => {
    if (!popupOpen) return
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popupOpen, close])

  const copy = alertCopy(alerts)
  if (!copy) return null
  const overdue = alerts.level === 'vencida'
  const pending = alerts.level === 'pendiente'
  const href = `/${tenantSlug}/admin/commissions`

  return (
    <>
      {/* Barra persistente */}
      <div
        role={overdue ? 'alert' : 'status'}
        className={cn(
          'flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-sm md:px-8',
          overdue && 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
          pending && 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100',
          !overdue && !pending && 'border-border bg-muted/40 text-foreground',
        )}
      >
        {overdue ? <AlertTriangle size={18} aria-hidden className="shrink-0" /> : <Coins size={18} aria-hidden className="shrink-0" />}
        <p className="min-w-0 flex-1 font-semibold">
          {copy.title}
          {(overdue || pending) && <span className="hidden font-normal sm:inline"> · Pedidos por transferencia (delivery)</span>}
        </p>
        {!onCommissionsPage && (
          <Link
            href={href}
            className={cn(
              'inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-bold',
              overdue ? 'bg-red-600 text-white hover:bg-red-700' : pending ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border border-border bg-background hover:bg-muted',
            )}
          >
            {(overdue || pending) && canPay ? 'Ver detalle y pagar' : 'Ver detalle'}
          </Link>
        )}
      </div>

      {/* Golpe en pantalla */}
      <AnimatePresence>
        {popupOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={close} />
            <motion.div
              ref={dialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="commission-alert-title"
              aria-describedby="commission-alert-body"
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', damping: 22, stiffness: 340 }}
              className="relative w-full max-w-[420px]"
            >
              <div className={cn('animate-nudge overflow-hidden rounded-2xl border bg-background shadow-[0_24px_70px_rgba(0,0,0,0.45)]', overdue ? 'border-red-300' : 'border-amber-300')}>
                <div className={cn('flex items-center gap-3 px-5 py-4 text-white', overdue ? 'bg-gradient-to-r from-red-600 to-rose-600' : 'bg-gradient-to-r from-amber-500 to-orange-500')}>
                  <div className="animate-knock-fist flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20" aria-hidden>
                    <Hand size={22} className="rotate-[-20deg]" />
                  </div>
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wide">
                    <BellRing size={14} aria-hidden />
                    {overdue ? 'Comisiones vencidas' : 'Liquidación semanal'}
                  </p>
                  <button type="button" onClick={close} className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/15" aria-label="Cerrar aviso">
                    <X size={18} aria-hidden />
                  </button>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <h2 id="commission-alert-title" className="text-lg font-black text-foreground">
                    {copy.title}
                  </h2>
                  <p id="commission-alert-body" className="text-sm text-muted-foreground">
                    {copy.body}
                  </p>
                  <p className="rounded-xl bg-muted/60 p-3 text-sm text-foreground">
                    La comisión la pagó el cliente como cargo por usar la app y te llegó dentro de su transferencia: no sale de tu precio de carta ni de tu margen. Adentro tenés el ticket de cada pedido explicado.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={href}
                      data-autofocus
                      onClick={close}
                      className={cn('inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-bold text-white', overdue ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600')}
                    >
                      {canPay ? 'Ver detalle y pagar' : 'Ver detalle'}
                    </Link>
                    <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted">
                      Más tarde
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
