import { useEffect, useRef, type ReactNode } from "react"
import { Check } from "lucide-react"
import type { CheckoutPart } from "@takeasygo/business/browser"
import { cashChange } from "@takeasygo/business/browser"
import { formatCurrency } from "../../utils/format"
import { formatPaymentMethod } from "../../services/payment"

// ============================================================================
// SaleDoneModal — «Venta completada» / «Mesa cerrada»
// ============================================================================
// Obs. UX 30/10: el cierre quedaba como un texto chico en el centro del
// workspace vacío. Ahora es un modal: check grande, total, cómo pagó, vuelto
// (si fue en efectivo) y una sola acción principal. Enter o Esc la ejecutan.
// ============================================================================

interface SaleDoneModalProps {
  title: string
  subtitle?: string
  sale: { total: number; parts?: CheckoutPart[]; cashReceivedCents?: number | null } | null
  actionLabel: string
  onDone: () => void
  /** Avisos extra: enviado a cocina, resultado de la factura. */
  children?: ReactNode
}

export function SaleDoneModal({ title, subtitle, sale, actionLabel, onDone, children }: SaleDoneModalProps) {
  const actionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    actionRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDone])

  const parts = sale?.parts ?? []
  const cashDue = parts.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0)
  const received = sale?.cashReceivedCents ?? null
  const change = cashDue > 0 && received !== null && received >= cashDue ? cashChange(cashDue, received) : null

  return (
    <div className="sale-done-overlay" role="dialog" aria-modal="true" aria-labelledby="sale-done-title">
      <div className="sale-done">
        <div className="sale-done-hero">
          <span className="sale-done-check" aria-hidden>
            <Check size={36} strokeWidth={3} />
          </span>
          <h2 id="sale-done-title" className="sale-done-title">{title}</h2>
          {subtitle && <span className="sale-done-subtitle">{subtitle}</span>}
          <strong className="sale-done-total">{formatCurrency(sale?.total ?? 0)}</strong>
        </div>

        {parts.length > 0 && (
          <ul className="sale-done-parts" aria-label="Cómo pagó">
            {parts.map((p) => {
              const info = formatPaymentMethod(p.method)
              return (
                <li key={p.id}>
                  <span><span aria-hidden>{info.icon}</span> {info.name}</span>
                  <strong>{formatCurrency(p.amount)}</strong>
                </li>
              )
            })}
          </ul>
        )}

        {change !== null && (
          <div className="sale-done-change">
            <span>Vuelto</span>
            <strong>{formatCurrency(change)}</strong>
          </div>
        )}

        {children}

        <button ref={actionRef} type="button" className="btn btn-primary btn-lg sale-done-action" onClick={onDone}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
