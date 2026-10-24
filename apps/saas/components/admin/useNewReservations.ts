'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ============================================================================
// Reservas nuevas en el menú del SaaS (observación 24/10)
// ============================================================================
// Badge en «Reservaciones» con las reservas que el local todavía no vio
// (lib/reservations/unseen). Arranca con el número del layout (SSR), se
// actualiza cada minuto y, si entra una nueva, muestra un aviso con acceso
// directo. Al abrir el panel de reservas se marcan vistas (evento
// `takeasygo:reservations-seen`) y el badge vuelve a 0 sin esperar.
// ============================================================================

const POLL_MS = 60_000

export function useNewReservations(tenantSlug: string, initial: number, enabled: boolean): number {
  const [count, setCount] = useState(initial)
  const lastRef = useRef(initial)
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch(`/api/${tenantSlug}/reservas/unseen`, { cache: 'no-store' })
        if (!res.ok) return
        const { count: next } = (await res.json()) as { count: number }
        if (!alive) return
        if (next > lastRef.current) {
          const fresh = next - lastRef.current
          toast(fresh === 1 ? 'Nueva reserva' : `${fresh} reservas nuevas`, {
            description: 'Entró una reserva en el sistema. La mesa se puede asignar desde Reservaciones o desde el POS.',
            action: { label: 'Ver', onClick: () => router.push(`/${tenantSlug}/admin/reservas`) },
            duration: 10_000,
          })
        }
        lastRef.current = next
        setCount(next)
      } catch {
        // Sin red: se reintenta en el próximo ciclo.
      }
    }
    const id = setInterval(poll, POLL_MS)
    const onSeen = () => { lastRef.current = 0; setCount(0) }
    window.addEventListener('takeasygo:reservations-seen', onSeen)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('takeasygo:reservations-seen', onSeen)
    }
  }, [tenantSlug, enabled, router])

  return count
}
