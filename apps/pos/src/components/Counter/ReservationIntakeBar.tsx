import { useEffect, useState } from "react"
import { isApproverRole } from "@takeasygo/business/browser"
import { useAuth } from "../../hooks/useAuth"
import { loadSalon, setReservationIntake, type PosReservationIntake } from "../../services/reservations"
import { PosApiError } from "../../services/pos-api"
import { currentPosUser } from "../../services/offline/offline-auth"

// ============================================================================
// Reservas online: abrir / pausar desde la vista Reservas (14/11/2026)
// ============================================================================
// Un finde lleno: el encargado corta las reservas online en un toque, sin salir
// del POS. Solo administrador y encargado (el server exige config.manage) y
// solo si el comercio tiene el módulo de reservas. Las ya hechas no cambian.
// ============================================================================

export function ReservationIntakeBar() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const canManage = isApproverRole(currentPosUser().role)
  const [intake, setIntake] = useState<PosReservationIntake | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId || !canManage) return
    let alive = true
    loadSalon(tenantId).then((r) => alive && setIntake(r.reservations)).catch(() => alive && setIntake(null))
    return () => { alive = false }
  }, [tenantId, canManage])

  if (!canManage || !intake?.available) return null

  const toggle = async () => {
    if (!tenantId) return
    setBusy(true)
    setError(null)
    try {
      setIntake({ ...intake, enabled: await setReservationIntake(tenantId, !intake.enabled) })
    } catch (err) {
      setError(err instanceof PosApiError ? err.message : "No se pudo cambiar. Reintentá.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`salon-intake${intake.enabled ? " is-on" : ""}`} role="region" aria-label="Reservas online">
      <div>
        <strong>{intake.enabled ? "Recibiendo reservas online" : "Reservas online pausadas"}</strong>
        <div className="text-sm text-muted">{error ?? (intake.enabled ? "Los clientes pueden reservar en esta sede." : "Nadie puede reservar online. Las ya hechas siguen igual.")}</div>
      </div>
      <button type="button" className={`btn ${intake.enabled ? "btn-secondary" : "btn-primary"}`} disabled={busy} onClick={toggle}>
        {busy ? "Guardando…" : intake.enabled ? "Pausar reservas" : "Abrir reservas"}
      </button>
    </div>
  )
}
