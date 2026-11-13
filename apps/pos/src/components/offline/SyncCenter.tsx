import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CloudOff, RefreshCw, Send, Trash2, X } from "lucide-react"
import { useOfflineStatus } from "../../hooks/useOfflineStatus"
import { isPosApiError } from "../../services/pos-api"
import { dependentsOf, discardOps, listSyncOps, retryConflicts, sendNow, type SyncOpView } from "../../services/offline/sync-center"

// ============================================================================
// Centro de sincronización (POS offline V2, etapa 6)
// ============================================================================
// Se abre desde el aviso del encabezado («Sin internet · 3 por enviar»,
// «2 para revisar») y desde Configuración › Sin internet.
//   · Con conflicto: lo que el server rechazó, con su motivo. Reintentar o
//     descartar (PIN de encargado).
//   · Por sincronizar: lo que espera, y a quién espera si está frenado.
// ============================================================================

const fmt = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

function errorText(err: unknown, fallback: string): string {
  if (isPosApiError(err) && err.code === "approval_cancelled") return "Descarte cancelado: falta el PIN del encargado"
  return err instanceof Error && err.message ? err.message : fallback
}

export function SyncCenter({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const status = useOfflineStatus()
  const [ops, setOps] = useState<SyncOpView[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [confirming, setConfirming] = useState<SyncOpView | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => setOps(await listSyncOps(tenantId)), [tenantId])

  // Se recarga cada vez que cambia el estado de la cola (envío, conflicto…).
  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(id)
  }, [load, status.pending, status.conflicts, status.syncing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, busy])

  const run = async (fn: () => Promise<string>, fallback: string) => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice({ kind: "ok", text: await fn() })
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err, fallback) })
    } finally {
      setBusy(false)
      await load()
    }
  }

  const conflicts = ops.filter((o) => o.status === "conflict")
  const pending = ops.filter((o) => o.status === "pending")
  const deps = confirming ? dependentsOf(ops, confirming.id) : []

  const discard = (withDependents: boolean) => {
    const target = confirming
    if (!target) return
    void run(async () => {
      const res = await discardOps(tenantId, target.id, { withDependents, reason })
      setConfirming(null)
      setReason("")
      return `${res.discarded === 1 ? "Se descartó 1 operación" : `Se descartaron ${res.discarded} operaciones`}${res.approverName ? ` (aprobó ${res.approverName})` : ""}. El equipo vuelve a leer lo del sistema.`
    }, "No se pudo descartar")
  }

  return (
    <div className="customer-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="sync-center-title">
      <div className="customer-modal sync-center">
        <header className="sync-center-head">
          {status.online ? <RefreshCw size={20} aria-hidden /> : <CloudOff size={20} aria-hidden />}
          <div>
            <h2 id="sync-center-title">Sincronización</h2>
            <p>
              {status.online ? "Con conexión" : "Sin internet"}
              {status.syncing ? " · enviando…" : ""}
              {status.lastSyncAt ? ` · último envío ${new Date(status.lastSyncAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={18} aria-hidden /></button>
        </header>

        <div className="sync-center-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !status.online || pending.length === 0} onClick={() => void run(async () => {
            const r = await sendNow(tenantId)
            return r.conflicts > 0 ? `Enviadas ${r.sent}; ${r.conflicts} con conflicto` : r.retryLater ? `Enviadas ${r.sent}; el resto se reintenta solo` : `Enviadas ${r.sent}`
          }, "No se pudo enviar")}>
            <Send size={14} aria-hidden /> Enviar ahora
          </button>
          {conflicts.length > 1 && (
            <button type="button" className="btn btn-sm" disabled={busy || !status.online} onClick={() => void run(async () => {
              const r = await retryConflicts(tenantId)
              return r.conflicts > 0 ? `Siguen ${r.conflicts} con conflicto` : "Listo: se enviaron"
            }, "No se pudo reintentar")}>
              <RefreshCw size={14} aria-hidden /> Reintentar todas
            </button>
          )}
        </div>

        {notice && <p className={`sync-center-notice is-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

        {ops.length === 0 && <p className="sync-center-empty">Todo lo que se hizo en este equipo ya está en el sistema.</p>}

        {conflicts.length > 0 && (
          <section aria-labelledby="sync-conflicts">
            <h3 id="sync-conflicts" className="sync-center-group is-conflict"><AlertTriangle size={16} aria-hidden /> Con conflicto ({conflicts.length})</h3>
            <p className="cash-help">El sistema no las aceptó. Lo que depende de ellas espera. Reintentá si ya se corrigió la causa (por ejemplo, abriste la caja) o descartalas con el PIN del encargado.</p>
            <ul className="sync-center-list">
              {conflicts.map((op) => (
                <li key={op.id} className="is-conflict">
                  <div>
                    <b>{op.label}</b>
                    <small>{fmt(op.occurredAt)} · {op.attempts} {op.attempts === 1 ? "intento" : "intentos"}</small>
                    {op.lastError && <span className="sync-center-error">{op.lastError.message}</span>}
                    {op.hasCaeaInvoice && <span className="sync-center-error">Tiene una factura CAEA entregada: no se puede descartar.</span>}
                  </div>
                  <div className="sync-center-row-actions">
                    <button type="button" className="btn btn-sm" disabled={busy || !status.online} onClick={() => void run(async () => {
                      const r = await retryConflicts(tenantId, op.id)
                      return r.conflicts > 0 ? "El sistema la volvió a rechazar" : "Enviada"
                    }, "No se pudo reintentar")}>
                      <RefreshCw size={14} aria-hidden /> Reintentar
                    </button>
                    <button type="button" className="btn btn-sm" disabled={busy || op.hasCaeaInvoice} onClick={() => { setConfirming(op); setNotice(null) }}>
                      <Trash2 size={14} aria-hidden /> Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pending.length > 0 && (
          <section aria-labelledby="sync-pending">
            <h3 id="sync-pending" className="sync-center-group">Por sincronizar ({pending.length})</h3>
            <ul className="sync-center-list">
              {pending.map((op) => (
                <li key={op.id}>
                  <div>
                    <b>{op.label}</b>
                    <small>
                      {fmt(op.occurredAt)}
                      {op.blockedBy ? ` · espera a «${op.blockedBy.label}»` : op.attempts > 0 ? ` · ${op.attempts} ${op.attempts === 1 ? "intento" : "intentos"}` : ""}
                    </small>
                    {!op.blockedBy && op.lastError && <span className="sync-center-hint">Último intento: {op.lastError.message}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {confirming && (
          <div className="sync-center-confirm" role="alertdialog" aria-labelledby="sync-confirm-title">
            <h3 id="sync-confirm-title">¿Descartar «{confirming.label}»?</h3>
            <p>Se borra de este equipo y no llega al sistema. Pide el PIN de un encargado y queda registrado.</p>
            {deps.length > 0 && (
              <>
                <p><b>Dependen de ella ({deps.length}):</b></p>
                <ul>{deps.map((d) => <li key={d.id}>{d.label}</li>)}</ul>
                <p className="cash-help">Si la descartás sola, lo que depende de ella probablemente también sea rechazado.</p>
              </>
            )}
            <label htmlFor="sync-discard-reason">Motivo (opcional)</label>
            <input id="sync-discard-reason" className="search-input" value={reason} maxLength={200} placeholder="Ej. la mesa la cobró otra caja" onChange={(e) => setReason(e.target.value)} />
            <div className="sync-center-row-actions">
              {deps.length > 0 && (
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => discard(true)}>
                  Descartar esta y las {deps.length} que dependen
                </button>
              )}
              <button type="button" className={`btn btn-sm ${deps.length === 0 ? "btn-danger" : ""}`} disabled={busy} onClick={() => discard(false)}>
                {deps.length > 0 ? "Solo esta" : "Descartar"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
