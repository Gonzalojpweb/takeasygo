import { useState } from "react"
import { CloudOff, RefreshCw, AlertTriangle, Printer } from "lucide-react"
import { useOfflineStatus } from "../../hooks/useOfflineStatus"
import { useAuth } from "../../hooks/useAuth"
import { SyncCenter } from "../offline/SyncCenter"

// ============================================================================
// Estado sin internet en el encabezado (POS offline V2)
// ============================================================================
// Solo aparece cuando hay algo que contar:
//   · sin internet (habilitado)   → «Sin internet · 3 por enviar» (ámbar)
//   · sin internet (no habilitado)→ «Sin internet» (rojo: no se puede operar)
//   · con red y cola pendiente    → «Enviando 3…»
//   · conflictos                  → «2 para revisar» (rojo)
//   · sin internet y una comanda que no salió → ícono de impresora (etapa 4)
// Etapa 6: con algo en la cola, el aviso es un botón que abre el centro de
// sincronización (qué falta mandar, qué rechazó el sistema y cómo resolverlo).
// ============================================================================

export function OfflineBadge() {
  const s = useOfflineStatus()
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const [open, setOpen] = useState(false)

  return (
    <>
      <StatusBadge onOpen={tenantId ? () => setOpen(true) : undefined} />
      {s.printIssue && !s.online && (
        <div className="offline-badge is-offline" role="alert" title={s.printIssue}>
          <Printer size={14} aria-hidden />
          <span>Revisar impresión</span>
        </div>
      )}
      {open && tenantId && <SyncCenter tenantId={tenantId} onClose={() => setOpen(false)} />}
    </>
  )
}

function StatusBadge({ onOpen }: { onOpen?: () => void }) {
  const s = useOfflineStatus()
  const hasQueue = s.pending > 0 || s.conflicts > 0

  let className: string
  let title: string
  let content: React.ReactNode
  if (s.conflicts > 0) {
    className = "is-conflict"
    title = "Operaciones que el sistema no aceptó al sincronizar. Tocá para revisarlas."
    content = (<><AlertTriangle size={14} aria-hidden /><span>{s.conflicts} para revisar</span></>)
  } else if (!s.online) {
    className = s.enabled ? "is-offline" : "is-blocked"
    title = s.enabled ? "Este equipo sigue operando: lo que hagas se envía solo cuando vuelva la conexión." : "Este equipo no está habilitado para operar sin internet."
    content = (<><CloudOff size={14} aria-hidden /><span>Sin internet{s.enabled && s.pending > 0 ? ` · ${s.pending} por enviar` : ""}</span></>)
  } else if (s.pending > 0 || s.syncing) {
    className = "is-syncing"
    title = "Enviando lo que se hizo sin internet. Tocá para ver el detalle."
    content = (<><RefreshCw size={14} aria-hidden className="offline-badge-spin" /><span>Enviando{s.pending > 0 ? ` ${s.pending}` : ""}…</span></>)
  } else {
    return null
  }

  if (hasQueue && onOpen) {
    return (
      <button type="button" className={`offline-badge offline-badge-btn ${className}`} title={title} onClick={onOpen}>
        {content}
      </button>
    )
  }
  return (
    <div className={`offline-badge ${className}`} role="status" title={title}>
      {content}
    </div>
  )
}
