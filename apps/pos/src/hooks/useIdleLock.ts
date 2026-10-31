import { useEffect, useState } from "react"

// ============================================================================
// Bloqueo por inactividad (auditoría 30/10/2026, A6)
// ============================================================================
// Terminal compartida: después de IDLE_LOCK_MS sin tocar el POS, la pantalla
// se bloquea y pide el PIN. NO cierra la sesión: los pedidos de la App siguen
// entrando y sonando (useAppOrderAlert) mientras está bloqueada. Si vuelve
// otro cajero, entra con SU PIN y queda su sesión (el token cambia).
// El bloqueo queda atado al token vigente: al reingresar (token nuevo) se
// desbloquea solo.
// ============================================================================

export const IDLE_LOCK_MS = 10 * 60 * 1000
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const

/** true = la pantalla está bloqueada para este token. */
export function useIdleLock(token: string | undefined, enabled: boolean, idleMs = IDLE_LOCK_MS): boolean {
  const [lockedToken, setLockedToken] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !token) return
    let timer = window.setTimeout(() => setLockedToken(token), idleMs)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setLockedToken(token), idleMs)
    }
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [token, enabled, idleMs])

  return Boolean(token) && lockedToken === token
}
