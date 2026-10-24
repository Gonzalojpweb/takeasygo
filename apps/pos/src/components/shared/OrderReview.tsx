import type { OrderItem } from "@takeasygo/types"
import { Plus, Send, Wallet } from "lucide-react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Revisión del pedido (observación UI/UX 24/10)
// ============================================================================
// Antes: una tarjeta angosta arriba a la izquierda, mucho blanco y «Agregar
// más» perdido en la barra. Ahora la revisión ocupa el centro del workspace:
// platos a la izquierda, resumen y decisiones a la derecha con botones
// grandes. «+ Agregar más» es un botón grande y visible: en pleno servicio
// el operador no tiene que buscarlo.
// ============================================================================

const COURSE_LABEL: Record<string, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }

interface OrderReviewProps {
  title: string
  subtitle?: string
  items: OrderItem[]
  cartTotal: number
  /** Rondas ya enviadas y sin cobrar (salón). */
  sentTotal: number
  busy?: boolean
  onAddMore: () => void
  /** Salón: mandar la ronda a cocina sin cobrar (acción principal). */
  onSendToKitchen?: () => void
  onCharge: () => void
}

export function OrderReview({ title, subtitle, items, cartTotal, sentTotal, busy, onAddMore, onSendToKitchen, onCharge }: OrderReviewProps) {
  const units = items.reduce((n, i) => n + i.quantity, 0)
  const chargeTotal = cartTotal + sentTotal

  return (
    <div className="review">
      <section className="review-items" aria-label="Platos de la ronda">
        <header className="review-items-head">
          <span>Nueva ronda</span>
          <span className="text-muted">{units} {units === 1 ? "producto" : "productos"}</span>
        </header>
        <ul className="review-list">
          {items.map((item, idx) => (
            <li key={`${item.productId}-${idx}`} className="review-line">
              <span className="review-qty">{item.quantity}</span>
              <div className="review-line-main">
                <span className="review-name">
                  {item.course && <span className="order-item-course">{COURSE_LABEL[item.course]}</span>}
                  {item.name}
                </span>
                {item.modifiers && item.modifiers.length > 0 && (
                  <span className="review-mods">{item.modifiers.map((m) => m.name).join(" · ")}</span>
                )}
                {item.notes && <span className="review-note">{item.notes}</span>}
              </div>
              <span className="review-price">{formatCurrency(item.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside className="review-summary" aria-label="Resumen">
        <div className="review-target">
          <div className="review-title">{title}</div>
          {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
        </div>
        <dl className="review-totals">
          <div><dt>Esta ronda</dt><dd>{formatCurrency(cartTotal)}</dd></div>
          {sentTotal > 0 && <div><dt>Ya enviado a cocina</dt><dd>{formatCurrency(sentTotal)}</dd></div>}
          <div className="review-grand"><dt>Total de la cuenta</dt><dd>{formatCurrency(chargeTotal)}</dd></div>
        </dl>

        <button type="button" className="btn review-add" onClick={onAddMore} disabled={busy}>
          <Plus size={22} aria-hidden /> Agregar más
        </button>
        {onSendToKitchen && (
          <button type="button" className="btn btn-primary review-main" onClick={onSendToKitchen} disabled={busy || items.length === 0}>
            <Send size={20} aria-hidden /> {busy ? "Enviando…" : "Enviar a cocina"}
          </button>
        )}
        <button
          type="button"
          className={`btn ${onSendToKitchen ? "btn-secondary" : "btn-primary review-main"} review-charge`}
          onClick={onCharge}
          disabled={busy || chargeTotal === 0}
        >
          <Wallet size={20} aria-hidden /> Cobrar {formatCurrency(chargeTotal)}
        </button>
      </aside>
    </div>
  )
}
