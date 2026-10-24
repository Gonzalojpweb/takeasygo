import { useEffect, useMemo, useState } from "react"
import { Percent } from "lucide-react"
import { DISCOUNT_REASONS, type DiscountReason, type DiscountRequest } from "../../services/order"
import { formatCurrency, parsePesosInput } from "../../utils/format"

// ============================================================================
// Descuento (Fase D, 2026-10) — por plato o a toda la cuenta
// ============================================================================
// Un paso: % o monto (con atajos), motivo y, si hace falta, nota. Muestra el
// total resultante ANTES de confirmar. El importe real lo decide el server
// (y si el operador es cajero, pide el PIN del encargado al confirmar).
// ============================================================================

const QUICK_PERCENTS = [5, 10, 15, 20, 25, 50, 100]

interface DiscountDialogProps {
  /** «Mesa 4 — toda la cuenta» o «Milanesa». */
  target: string
  /** Importe sobre el que se descuenta (centavos, sin descuento previo). */
  base: number
  /** Hay descuentos aplicados ⇒ ofrece quitarlos. */
  hasDiscount?: boolean
  busy?: boolean
  onConfirm: (discount: DiscountRequest) => void
  onRemove?: () => void
  onCancel: () => void
}

export function DiscountDialog({ target, base, hasDiscount, busy, onConfirm, onRemove, onCancel }: DiscountDialogProps) {
  const [kind, setKind] = useState<"percent" | "amount">("percent")
  const [percent, setPercent] = useState<number | null>(null)
  const [amountText, setAmountText] = useState("")
  const [reason, setReason] = useState<DiscountReason | null>(null)
  const [note, setNote] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  const value = kind === "percent" ? percent : parsePesosInput(amountText)
  const off = useMemo(() => {
    if (!value || value <= 0) return 0
    return kind === "percent" ? Math.min(base, Math.round((base * value) / 100)) : Math.min(base, value)
  }, [kind, value, base])
  const valid =
    Boolean(value && value > 0) &&
    (kind === "amount" || (value ?? 0) <= 100) &&
    reason !== null &&
    (reason !== "other" || note.trim().length > 0)

  const confirm = () => {
    if (!valid || !value || !reason) return
    onConfirm({ kind, value, reason, ...(note.trim() ? { note: note.trim() } : {}) })
  }

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="discount-title">
      <div className="customer-modal approval-modal void-modal">
        <div className="approval-body">
          <Percent size={28} className="approval-icon" aria-hidden />
          <div id="discount-title" className="approval-title">Descuento — {target}</div>

          <div className="discount-kind" role="radiogroup" aria-label="Tipo de descuento">
            <button type="button" role="radio" aria-checked={kind === "percent"} className={`note-chip${kind === "percent" ? " active" : ""}`} onClick={() => setKind("percent")}>
              Porcentaje
            </button>
            <button type="button" role="radio" aria-checked={kind === "amount"} className={`note-chip${kind === "amount" ? " active" : ""}`} onClick={() => setKind("amount")}>
              Monto fijo
            </button>
          </div>

          {kind === "percent" ? (
            <div className="discount-quick" role="group" aria-label="Porcentaje">
              {QUICK_PERCENTS.map((p) => (
                <button key={p} type="button" aria-pressed={percent === p} className={`guests-btn${percent === p ? " active" : ""}`} onClick={() => setPercent(p)}>
                  {p === 100 ? "Invita la casa" : `${p}%`}
                </button>
              ))}
            </div>
          ) : (
            <input
              className="search-input discount-amount"
              inputMode="decimal"
              placeholder="Monto a descontar ($)"
              aria-label="Monto a descontar en pesos"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              autoFocus
            />
          )}

          <div className="void-reasons discount-reasons" role="radiogroup" aria-label="Motivo">
            {DISCOUNT_REASONS.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={`void-reason${reason === r.id ? " active" : ""}`} onClick={() => setReason(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          {reason === "other" && (
            <input className="search-input" maxLength={140} placeholder="¿Por qué? (obligatorio)" aria-label="Motivo del descuento" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          )}

          <div className="discount-preview" aria-live="polite">
            <span>{formatCurrency(base)}</span>
            <span className="text-error">− {formatCurrency(off)}</span>
            <strong>= {formatCurrency(base - off)}</strong>
          </div>

          <div className="void-actions">
            {hasDiscount && onRemove && (
              <button type="button" className="btn btn-ghost" onClick={onRemove} disabled={busy} style={{ marginRight: "auto" }}>
                Quitar descuentos
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={confirm}>
              {busy ? "Aplicando…" : `Descontar ${formatCurrency(off)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
