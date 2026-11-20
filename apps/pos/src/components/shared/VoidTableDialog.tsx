import { useEffect, useRef, useState } from "react"
import { Ban } from "lucide-react"
import {
  TABLE_VOID_NOTE_MAX,
  TABLE_VOID_REASONS,
  TABLE_VOID_REASON_INFO,
  tableVoidNeedsNote,
  type TableVoidReason,
} from "@takeasygo/business/browser"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Anular la mesa entera (19/11/2026)
// ============================================================================
// Un solo paso: POR QUÉ + qué pasa con lo que ya se mandó a cocina. Al
// confirmar, si quien opera no es admin/encargado, el server pide el PIN de
// uno (ManagerApprovalDialog) — sin cerrar la sesión del mozo/cajero.
// Inventario: «no se preparó» devuelve los insumos al stock; «se preparó y
// se pierde» los registra como merma. Cada motivo propone una respuesta.
// ============================================================================

export interface VoidTableSummary {
  rounds: number
  units: number
  /** Importe que se anula (centavos). */
  total: number
  /** ¿Alguna ronda ya salió a cocina? (define si se pregunta por el inventario). */
  sentToKitchen: boolean
}

interface VoidTableDialogProps {
  tableNumber: number
  summary: VoidTableSummary
  /** El operador ya es admin/encargado (no hará falta PIN). */
  canAuthorize: boolean
  busy?: boolean
  onConfirm: (input: { reason: TableVoidReason; note?: string; wasted: boolean }) => void
  onCancel: () => void
}

export function VoidTableDialog({ tableNumber, summary, canAuthorize, busy, onConfirm, onCancel }: VoidTableDialogProps) {
  const [reason, setReason] = useState<TableVoidReason | null>(null)
  const [note, setNote] = useState("")
  const [wasted, setWasted] = useState(false)
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  const pick = (r: TableVoidReason) => {
    setReason(r)
    setWasted(TABLE_VOID_REASON_INFO[r].wastedDefault)
  }

  const needsNote = reason ? tableVoidNeedsNote(reason) : false
  const valid = Boolean(reason) && (!needsNote || note.trim().length > 0)

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="void-table-title">
      <div className="customer-modal approval-modal void-modal void-table-modal">
        <div className="approval-body">
          <Ban size={28} className="approval-icon void-table-icon" aria-hidden />
          <div id="void-table-title" className="approval-title">Anular mesa {tableNumber}</div>
          <p className="approval-message">
            Se anulan {summary.rounds} {summary.rounds === 1 ? "ronda" : "rondas"} ({summary.units} {summary.units === 1 ? "producto" : "productos"}) por{" "}
            <strong>{formatCurrency(summary.total)}</strong> y la mesa queda libre. No se cobra nada.
          </p>

          <p className="approval-message void-table-label">¿Por qué se anula?</p>
          <div className="void-reasons" role="radiogroup" aria-label="Motivo">
            {TABLE_VOID_REASONS.map((r, i) => (
              <button
                key={r}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                role="radio"
                aria-checked={reason === r}
                className={`void-reason${reason === r ? " active" : ""}`}
                disabled={busy}
                onClick={() => pick(r)}
              >
                <span>{TABLE_VOID_REASON_INFO[r].label}</span>
                <span className="void-reason-hint">{TABLE_VOID_REASON_INFO[r].hint}</span>
              </button>
            ))}
          </div>

          {reason && (
            <textarea
              className="search-input void-table-note"
              rows={2}
              maxLength={TABLE_VOID_NOTE_MAX}
              placeholder={needsNote ? "Escribí el motivo (obligatorio)" : "Detalle (opcional): queda en el registro"}
              aria-label="Detalle del motivo"
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          )}

          {reason && summary.sentToKitchen && (
            <div className="void-table-stock" role="radiogroup" aria-label="Qué pasa con lo que se mandó a cocina">
              <p className="approval-message void-table-label">Lo que ya se mandó a cocina…</p>
              <button type="button" role="radio" aria-checked={!wasted} className={`void-reason${!wasted ? " active-stock" : ""}`} disabled={busy} onClick={() => setWasted(false)}>
                <span>No se llegó a preparar</span>
                <span className="void-reason-hint">los insumos vuelven al stock</span>
              </button>
              <button type="button" role="radio" aria-checked={wasted} className={`void-reason${wasted ? " active" : ""}`} disabled={busy} onClick={() => setWasted(true)}>
                <span>Se preparó y se pierde</span>
                <span className="void-reason-hint waste">va a merma</span>
              </button>
            </div>
          )}

          {summary.sentToKitchen && <p className="text-sm text-muted">Cocina y barra reciben un aviso «ANULADA · NO PREPARAR».</p>}
          {!canAuthorize && <p className="text-sm text-muted">La autoriza un admin o encargado con su PIN en este equipo.</p>}

          <div className="void-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Volver</button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!valid || busy}
              onClick={() => reason && onConfirm({ reason, note: note.trim() || undefined, wasted: summary.sentToKitchen ? wasted : false })}
            >
              {busy ? "Anulando…" : `Anular mesa${wasted && summary.sentToKitchen ? " (merma)" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
