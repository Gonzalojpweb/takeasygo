import { useEffect } from "react"
import { getFiscalHealth } from "../services/fiscal"

// ============================================================================
// Pulso de recuperación fiscal — orden de ejecución 31/10 (P1.3)
// ============================================================================
// Con Vercel Hobby el cron del server es diario. Mientras el POS de caja está
// abierto, cada 3 minutos consulta la salud fiscal: eso le permite al server
// emitir las facturas pendientes del comercio (a lo sumo cada 2 min, con
// candado en la base). El agente de impresión hace lo mismo desde su poll;
// este pulso cubre los locales sin agente. Silencioso: un error no molesta.
// ============================================================================

const PULSE_MS = 3 * 60_000
const HUB_ROLES = new Set(["admin", "manager", "cashier"])

export function useFiscalRecoveryPulse(tenantId: string | undefined, role: string | undefined): void {
  useEffect(() => {
    if (!tenantId || !role || !HUB_ROLES.has(role)) return
    const tick = () => {
      if (document.visibilityState === "hidden") return
      void getFiscalHealth(tenantId).catch(() => undefined)
    }
    const id = setInterval(tick, PULSE_MS)
    return () => clearInterval(id)
  }, [tenantId, role])
}
