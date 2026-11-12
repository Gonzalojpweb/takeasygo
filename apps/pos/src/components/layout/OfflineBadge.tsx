import { CloudOff, RefreshCw, AlertTriangle, Printer } from "lucide-react"
import { useOfflineStatus } from "../../hooks/useOfflineStatus"

// ============================================================================
// Estado sin internet en el encabezado (POS offline V2)
// ============================================================================
// Solo aparece cuando hay algo que contar:
//   · sin internet (habilitado)   → «Sin internet · 3 por enviar» (ámbar)
//   · sin internet (no habilitado)→ «Sin internet» (rojo: no se puede operar)
//   · con red y cola pendiente    → «Enviando 3…»
//   · conflictos                  → «2 para revisar» (rojo)
//   · sin internet y una comanda que no salió → ícono de impresora (etapa 4)
// ============================================================================

export function OfflineBadge() {
  const s = useOfflineStatus()
  const badge = <StatusBadge />
  if (!s.printIssue || s.online) return badge
  return (
    <>
      {badge}
      <div className="offline-badge is-offline" role="alert" title={s.printIssue}>
        <Printer size={14} aria-hidden />
        <span>Revisar impresión</span>
      </div>
    </>
  )
}

function StatusBadge() {
  const s = useOfflineStatus()

  if (s.conflicts > 0) {
    return (
      <div className="offline-badge is-conflict" role="status" title="Operaciones que el sistema no aceptó al sincronizar. Revisalas en Configuración › Sin internet.">
        <AlertTriangle size={14} aria-hidden />
        <span>{s.conflicts} para revisar</span>
      </div>
    )
  }
  if (!s.online) {
    return (
      <div
        className={`offline-badge ${s.enabled ? "is-offline" : "is-blocked"}`}
        role="status"
        title={s.enabled ? "Este equipo sigue operando: lo que hagas se envía solo cuando vuelva la conexión." : "Este equipo no está habilitado para operar sin internet."}
      >
        <CloudOff size={14} aria-hidden />
        <span>Sin internet{s.enabled && s.pending > 0 ? ` · ${s.pending} por enviar` : ""}</span>
      </div>
    )
  }
  if (s.pending > 0 || s.syncing) {
    return (
      <div className="offline-badge is-syncing" role="status" title="Enviando lo que se hizo sin internet">
        <RefreshCw size={14} aria-hidden className="offline-badge-spin" />
        <span>Enviando{s.pending > 0 ? ` ${s.pending}` : ""}…</span>
      </div>
    )
  }
  return null
}
