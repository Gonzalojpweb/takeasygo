import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { listReservations, type PosReservation } from "../services/reservations"
import { playOrderNotification } from "../services/notification-sound"

// ============================================================================
// Reservas del día en el POS (observación 24/10)
// ============================================================================
// Sondeo cada minuto: lista de hoy + `unseen` (reservas nuevas sin ver, de
// hoy en adelante). Si el número de nuevas sube, suena el aviso: el badge de
// «Reservaciones» y la mesa reservada en el salón son la señal visual.
// `byTable`: reserva confirmada por mesa reservada (para el mapa del salón).
// ============================================================================

const POLL_MS = 60_000

export function useReservations(tenantId: string | undefined) {
  const [reservations, setReservations] = useState<PosReservation[]>([])
  const [unseen, setUnseen] = useState(0)
  const lastUnseen = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!tenantId) return
    try {
      const res = await listReservations(tenantId)
      setReservations(res.reservations)
      setUnseen(res.unseen)
      if (lastUnseen.current !== null && res.unseen > lastUnseen.current) {
        void playOrderNotification()
      }
      lastUnseen.current = res.unseen
    } catch (err) {
      // Sin reservas habilitadas o sin red: el resto del POS sigue igual.
      console.warn("[reservations] no se pudo actualizar:", err)
    }
  }, [tenantId])

  useEffect(() => {
    // Primera carga en el próximo tick (no setState sincrónico en el efecto).
    const first = setTimeout(() => { void refresh() }, 0)
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [refresh])

  const byTable = useMemo(() => {
    const map = new Map<string, PosReservation>()
    for (const r of reservations) {
      if (r.status === "confirmed" && r.tablePosId) map.set(r.tablePosId, r)
    }
    return map
  }, [reservations])

  const clearUnseen = useCallback(() => {
    lastUnseen.current = 0
    setUnseen(0)
  }, [])

  return { reservations, unseen, byTable, refresh, clearUnseen }
}
