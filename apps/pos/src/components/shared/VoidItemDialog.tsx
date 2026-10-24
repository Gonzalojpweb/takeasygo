import { useEffect, useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import { ITEM_VOID_REASONS, type ItemVoidReason } from "../../services/order"

// ============================================================================
// Quitar un plato ya enviado a cocina (Fase C, 2026-10)
// ============================================================================
// Cuántos (si la línea tiene varios) + POR QUÉ, en un solo paso. El motivo
// decide si los insumos vuelven al stock o van a merma, y queda en la orden
// para los reportes de anulaciones. Si el operador es cajero, al confirmar
// el server pide el PIN del encargado (ManagerApprovalDialog).
// ============================================================================

interface VoidItemDialogProps {
  name: string
  quantity: number
  busy?: boolean
  onConfirm: (removeQuantity: number, reason: ItemVoidReason) => void
  onCancel: () => void
}

export function VoidItemDialog({ name, quantity, busy, onConfirm, onCancel }: VoidItemDialogProps) {
  const [remove, setRemove] = useState(quantity)
  const [reason, setReason] = useState<ItemVoidReason | null>(null)
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  const selected = ITEM_VOID_REASONS.find((r) => r.id === reason)

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="void-title">
      <div className="customer-modal approval-modal void-modal">
        <div className="approval-body">
          <Trash2 size={28} className="approval-icon" aria-hidden />
          <div id="void-title" className="approval-title">Quitar {name}</div>

          {quantity > 1 && (
            <div className="void-qty" role="group" aria-label="Cantidad a quitar">
              <button type="button" className="btn btn-secondary guests-step" aria-label="Quitar uno menos" disabled={busy || remove <= 1}
                onClick={() => setRemove((n) => Math.max(1, n - 1))}>−</button>
              <span className="guests-typed-value" aria-live="polite">{remove}</span>
              <button type="button" className="btn btn-secondary guests-step" aria-label="Quitar uno más" disabled={busy || remove >= quantity}
                onClick={() => setRemove((n) => Math.min(quantity, n + 1))}>+</button>
              <span className="text-sm text-muted">de {quantity}</span>
            </div>
          )}

          <p className="approval-message">¿Por qué se quita?</p>
          <div className="void-reasons" role="radiogroup" aria-label="Motivo">
            {ITEM_VOID_REASONS.map((r, i) => (
              <button
                key={r.id}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                role="radio"
                aria-checked={reason === r.id}
                className={`void-reason${reason === r.id ? " active" : ""}`}
                disabled={busy}
                onClick={() => setReason(r.id)}
              >
                <span>{r.label}</span>
                <span className={`void-reason-hint${r.wasted ? " waste" : ""}`}>{r.wasted ? "va a merma" : "vuelve al stock"}</span>
              </button>
            ))}
          </div>

          <div className="void-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!reason || busy}
              onClick={() => reason && onConfirm(remove, reason)}
            >
              {busy ? "Quitando…" : `Quitar ${remove}${selected?.wasted ? " (merma)" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
