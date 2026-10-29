import { CURRENT_BUILD } from "../../services/app-update"

// ============================================================================
// R0 — Arranque (obs. UX 25/10)
// ============================================================================
// Cubre la restauración de la sesión (sessionStorage / Dexie) con la marca:
// nunca una pantalla en blanco, aunque no haya red. El contenido aparece
// recién a los 300 ms (decisión §15.4): si la restauración es instantánea, no
// «aparece y desaparece». Con sesión válida pasa directo al shell.
// ============================================================================

export function BootScreen() {
  return (
    <div className="root-boot" role="status" aria-live="polite">
      <div className="root-bootbox">
        <div className="root-boot-logo" aria-hidden>T</div>
        <b>TakeasyGO</b>
        <span>Preparando la terminal…</span>
        <div className="root-boot-bar" aria-hidden><i /></div>
        <small>{typeof window !== "undefined" ? window.location.host : ""} · versión {CURRENT_BUILD.version.slice(0, 7)} · caché local activa</small>
      </div>
    </div>
  )
}
