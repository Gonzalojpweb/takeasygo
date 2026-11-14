import { useEffect, useMemo, useState } from "react"
import { Percent, ShieldCheck, ShieldAlert, Ban } from "lucide-react"
import {
  DEFAULT_DISCOUNT_POLICY,
  discountForFinalAmount,
  reasonNeedsNote,
  type DiscountDecision,
  type DiscountPolicy,
} from "@takeasygo/business/browser"
import { DISCOUNT_REASONS, type DiscountReason, type DiscountRequest } from "../../services/order"
import { formatCurrency, parsePesosInput } from "../../utils/format"

// ============================================================================
// Descuento (Fase D, 2026-10) — por plato o a toda la cuenta
// ============================================================================
// Un paso: % , monto a descontar o IMPORTE FINAL a cobrar (14/11/2026), motivo
// y observación. Muestra el total resultante ANTES de confirmar y, con la
// política del comercio, si va a hacer falta el PIN de un encargado o si
// supera el máximo del rol. El importe real y la autorización los decide
// siempre el server.
//
// «Importe final» no es otro mecanismo: se manda como monto fijo
// (base − final) con `finalCents` para que el server verifique que el total
// que queda es exactamente ese. Los precios del catálogo no cambian.
//
// Producto que no está: se QUITA de la cuenta (repone stock y queda bien en
// los reportes), no se simula con un descuento.
// ============================================================================

const QUICK_PERCENTS = [5, 10, 15, 20, 25, 50, 100]
const NOTE_MAX = 140

type Mode = "percent" | "amount" | "final"

interface DiscountDialogProps {
  /** «Mesa 4 — toda la cuenta» o «Milanesa». */
  target: string
  /** Importe sobre el que se descuenta (centavos, sin descuento previo). */
  base: number
  /** Hay descuentos aplicados ⇒ ofrece quitarlos. */
  hasDiscount?: boolean
  busy?: boolean
  /** Modo «importe final» (solo para toda la cuenta, no para un plato). */
  allowFinal?: boolean
  /** Política del comercio (motivos habilitados, observación obligatoria). */
  policy?: DiscountPolicy
  /** Qué pasaría con este descuento (centavos) para quien opera. */
  evaluate?: (offCents: number) => DiscountDecision | null
  onConfirm: (discount: DiscountRequest) => void
  onRemove?: () => void
  onCancel: () => void
}

export function DiscountDialog({ target, base, hasDiscount, busy, allowFinal = false, policy = DEFAULT_DISCOUNT_POLICY, evaluate, onConfirm, onRemove, onCancel }: DiscountDialogProps) {
  const [mode, setMode] = useState<Mode>("percent")
  const [percent, setPercent] = useState<number | null>(null)
  const [amountText, setAmountText] = useState("")
  const [finalText, setFinalText] = useState("")
  const [reason, setReason] = useState<DiscountReason | null>(null)
  const [note, setNote] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  const reasons = useMemo(() => DISCOUNT_REASONS.filter((r) => policy.allowedReasons.includes(r.id)), [policy])
  const noteRequired = reason !== null && reasonNeedsNote(policy, reason)

  const finalCents = mode === "final" ? parsePesosInput(finalText) : null
  const finalError =
    mode === "final" && finalText.trim() !== ""
      ? finalCents === null
        ? "Importe inválido"
        : finalCents >= base
          ? `Tiene que ser menor que ${formatCurrency(base)}`
          : null
      : null

  const off = useMemo(() => {
    if (mode === "final") return finalCents === null ? 0 : discountForFinalAmount(base, finalCents) ?? 0
    const value = mode === "percent" ? percent : parsePesosInput(amountText)
    if (!value || value <= 0) return 0
    return mode === "percent" ? Math.min(base, Math.round((base * value) / 100)) : Math.min(base, value)
  }, [mode, percent, amountText, finalCents, base])

  const decision = off > 0 && evaluate ? evaluate(off) : null
  const valid =
    off > 0 &&
    (mode !== "percent" || (percent ?? 0) <= 100) &&
    reason !== null &&
    (!noteRequired || note.trim().length > 0) &&
    decision?.kind !== "deny"

  const confirm = () => {
    if (!valid || !reason) return
    const trimmed = note.trim() ? { note: note.trim() } : {}
    if (mode === "final" && finalCents !== null) {
      onConfirm({ kind: "amount", value: off, reason, finalCents, ...trimmed })
    } else if (mode === "percent" && percent) {
      onConfirm({ kind: "percent", value: percent, reason, ...trimmed })
    } else {
      onConfirm({ kind: "amount", value: off, reason, ...trimmed })
    }
  }

  const modes: { id: Mode; label: string }[] = [
    { id: "percent", label: "Porcentaje" },
    { id: "amount", label: "Monto a descontar" },
    ...(allowFinal ? [{ id: "final" as const, label: "Importe final" }] : []),
  ]

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="discount-title">
      <div className="customer-modal approval-modal void-modal">
        <div className="approval-body">
          <Percent size={28} className="approval-icon" aria-hidden />
          <div id="discount-title" className="approval-title">Descuento — {target}</div>

          <div className="discount-kind" role="radiogroup" aria-label="Tipo de descuento">
            {modes.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`note-chip${mode === m.id ? " active" : ""}`} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          {mode === "percent" && (
            <div className="discount-quick" role="group" aria-label="Porcentaje">
              {QUICK_PERCENTS.map((p) => (
                <button key={p} type="button" aria-pressed={percent === p} className={`guests-btn${percent === p ? " active" : ""}`} onClick={() => setPercent(p)}>
                  {p === 100 ? "Invita la casa" : `${p}%`}
                </button>
              ))}
            </div>
          )}
          {mode === "amount" && (
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
          {mode === "final" && (
            <>
              <input
                className="search-input discount-amount"
                inputMode="decimal"
                placeholder="Importe a cobrar ($)"
                aria-label="Importe final a cobrar en pesos"
                aria-invalid={Boolean(finalError)}
                value={finalText}
                onChange={(e) => setFinalText(e.target.value)}
                autoFocus
              />
              <p className="discount-hint">Total de la cuenta: {formatCurrency(base)}. El descuento se calcula solo.</p>
              {finalError && <p className="discount-hint text-error" role="alert">{finalError}</p>}
            </>
          )}

          <div className="void-reasons discount-reasons" role="radiogroup" aria-label="Motivo">
            {reasons.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={`void-reason${reason === r.id ? " active" : ""}`} onClick={() => setReason(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            maxLength={NOTE_MAX}
            placeholder={noteRequired ? "Observación (obligatoria)" : "Observación (opcional)"}
            aria-label="Observación del descuento"
            aria-required={noteRequired}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="discount-hint">¿Falta un producto? Quitalo de la cuenta en vez de descontarlo: así vuelve al stock.</p>

          <div className="discount-preview" aria-live="polite">
            <span>{formatCurrency(base)}</span>
            <span className="text-error">− {formatCurrency(off)}</span>
            <strong>= {formatCurrency(base - off)}</strong>
          </div>
          {off > 0 && off === base && <p className="discount-hint">La cuenta queda en $0: se registra como venta sin cobro.</p>}

          {decision && decision.kind !== "allow" && (
            <p className={`discount-policy discount-policy--${decision.kind}`} role="status">
              {decision.kind === "deny" ? <Ban size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
              {decision.message}
            </p>
          )}
          {decision?.kind === "allow" && evaluate && (
            <p className="discount-policy discount-policy--allow" role="status">
              <ShieldCheck size={16} aria-hidden /> Dentro de tu límite: no necesita autorización.
            </p>
          )}

          <div className="void-actions">
            {hasDiscount && onRemove && (
              <button type="button" className="btn btn-ghost" onClick={onRemove} disabled={busy} style={{ marginRight: "auto" }}>
                Quitar descuentos
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={confirm}>
              {busy ? "Aplicando…" : mode === "final" && finalCents !== null && off > 0 ? `Cobrar ${formatCurrency(finalCents)}` : `Descontar ${formatCurrency(off)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
