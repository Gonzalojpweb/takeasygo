import type { ItemCourse, OrderItem } from "@takeasygo/types"
import { Percent, Plus, Send, Wallet } from "lucide-react"
import { formatCurrency } from "../../utils/format"
import { CourseChip, CourseGroupHeader, CourseHoldControl, groupByCourse, hasCourses } from "./Courses"
import type { CartPromo } from "../../utils/menu-promos"

// ============================================================================
// Revisión del pedido (observación UI/UX 24/10)
// ============================================================================
// Antes: una tarjeta angosta arriba a la izquierda, mucho blanco y «Agregar
// más» perdido en la barra. Ahora la revisión ocupa el centro del workspace:
// platos a la izquierda, resumen y decisiones a la derecha con botones
// grandes. «+ Agregar más» es un botón grande y visible: en pleno servicio
// el operador no tiene que buscarlo.
// ============================================================================

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
  /** Piloto 06/11: tiempos que esperan la marcha (solo salón). */
  courseHold?: { holdable: ItemCourse[]; held: ItemCourse[]; onToggle: (c: ItemCourse) => void }
  /** Cambiar el tiempo de una línea con un toque. */
  onSetCourse?: (index: number, course: ItemCourse | undefined) => void
  /**
   * 20/11/2026 (Mostrador): descuento por plato antes de cobrar. total = lo
   * que se descuenta en la venta (por plato o general); general = hay un
   * descuento a toda la venta (cargar uno por plato lo reemplaza).
   */
  lineDiscount?: {
    amountOf: (index: number) => number
    labelOf: (index: number) => string | undefined
    onEdit: (index: number) => void
    total: number
    general: boolean
  }
  /**
   * 21/11/2026: promo «Descuento %» de cada línea. `cartTotal` llega YA neto
   * de promos; acá solo se muestra el detalle.
   */
  promoOf?: (index: number) => CartPromo | null
}

export function OrderReview({ title, subtitle, items, cartTotal, sentTotal, busy, onAddMore, onSendToKitchen, onCharge, courseHold, onSetCourse, lineDiscount, promoOf }: OrderReviewProps) {
  const promoTotal = promoOf ? items.reduce((s, _i, idx) => s + (promoOf(idx)?.cents ?? 0), 0) : 0
  const units = items.reduce((n, i) => n + i.quantity, 0)
  const discountTotal = lineDiscount?.total ?? 0
  const chargeTotal = cartTotal + sentTotal - discountTotal

  return (
    <div className="review">
      <section className="review-items" aria-label="Platos de la ronda">
        <header className="review-items-head">
          <span>Nueva ronda</span>
          <span className="text-muted">{units} {units === 1 ? "producto" : "productos"}</span>
        </header>
        {(hasCourses(items) ? groupByCourse(items) : [{ course: null, entries: items.map((item, idx) => ({ item, idx })) }]).map((group) => (
        <div key={group.course ?? "none"} className="review-course-group">
        {hasCourses(items) && <CourseGroupHeader course={group.course} held={group.course ? Boolean(courseHold?.held.includes(group.course)) : false} />}
        <ul className="review-list">
          {group.entries.map(({ item, idx }) => (
            <li key={`${item.productId}-${idx}`} className={`review-line${lineDiscount ? " review-line--discount" : ""}`}>
              <span className="review-qty">{item.quantity}</span>
              <div className="review-line-main">
                <span className="review-name">
                  <CourseChip course={item.course} onChange={onSetCourse && (!item.comboInstanceId || item.comboComponent) ? (next) => onSetCourse(idx, next) : undefined} />
                  {item.name}
                </span>
                {item.modifiers && item.modifiers.length > 0 && (
                  <span className="review-mods">{item.modifiers.map((m) => m.name).join(" · ")}</span>
                )}
                {item.notes && <span className="review-note">{item.notes}</span>}
                {promoOf?.(idx) && (
                  <span className="review-discount text-success">
                    🏷️ {promoOf(idx)!.label} −{formatCurrency(promoOf(idx)!.cents)}
                  </span>
                )}
                {lineDiscount && lineDiscount.amountOf(idx) > 0 && (
                  <span className="review-discount text-success">
                    Desc. {lineDiscount.labelOf(idx)} −{formatCurrency(lineDiscount.amountOf(idx))}
                  </span>
                )}
              </div>
              <span className="review-price">{formatCurrency(item.total)}</span>
              {lineDiscount && item.total > 0 && (
                <button
                  type="button"
                  className={`review-discount-btn${lineDiscount.amountOf(idx) > 0 ? " active" : ""}`}
                  onClick={() => lineDiscount.onEdit(idx)}
                  disabled={busy}
                  aria-label={`Descuento en ${item.name}`}
                  title="Descuento en este plato"
                >
                  <Percent size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        </div>
        ))}
      </section>

      <aside className="review-summary" aria-label="Resumen">
        <div className="review-target">
          <div className="review-title">{title}</div>
          {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
        </div>
        <dl className="review-totals">
          <div><dt>Esta ronda</dt><dd>{formatCurrency(cartTotal)}</dd></div>
          {promoTotal > 0 && (
            <div className="text-success">
              <dt>Incluye promos de la carta</dt>
              <dd>−{formatCurrency(promoTotal)}</dd>
            </div>
          )}
          {sentTotal > 0 && <div><dt>Ya enviado a cocina</dt><dd>{formatCurrency(sentTotal)}</dd></div>}
          {discountTotal > 0 && (
            <div className="text-success">
              <dt>{lineDiscount?.general ? "Descuento a toda la venta" : "Descuentos por plato"}</dt>
              <dd>−{formatCurrency(discountTotal)}</dd>
            </div>
          )}
          <div className="review-grand"><dt>Total de la cuenta</dt><dd>{formatCurrency(chargeTotal)}</dd></div>
        </dl>

        {courseHold && onSendToKitchen && <CourseHoldControl holdable={courseHold.holdable} held={courseHold.held} onToggle={courseHold.onToggle} />}

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
