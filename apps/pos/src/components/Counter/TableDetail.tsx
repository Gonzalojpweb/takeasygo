import type { Order, OrderItem, Table } from "@takeasygo/types"
import { Clock, Users, LayoutGrid, Receipt, Percent, X, CalendarClock, Plus } from "lucide-react"
import { formatCurrency } from "../../utils/format"
import { formatElapsed, type TableActivity } from "../../hooks/useTableActivity"
import { MESA_STATUS_LABEL } from "../shared/MesaCard"

// ============================================================================
// Contexto «Mesa» — detalle en el workspace (observación 24/10)
// ============================================================================
// Al abrir una mesa, el WORKSPACE muestra todo lo que la mesa tiene: estado,
// sector, comensales, tiempo abierta, la reserva (si tiene) y cada RONDA con
// su hora, su estado en cocina y sus platos (opciones, nota, curso,
// descuento), más subtotal, descuentos y total. Las acciones sobre un plato
// (quitar, descuento) viven en el plato; las de la mesa, en el Context Panel
// (ContextActionPanel). El mapa del salón vuelve con «← Salón».
// ============================================================================

const ROUND_STATUS: Record<string, string> = {
  pending: "Sin enviar",
  confirmed: "En cocina",
  preparing: "Preparando",
  ready: "Lista",
  delivered: "Entregada",
  cancelled: "Cancelada",
}
const COURSE_LABEL: Record<string, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }

interface TableDetailProps {
  table: Table
  activity?: TableActivity
  orders: Order[]
  now: number
  reservation?: { time: string; name: string; partySize: number; notes?: string; spaceName?: string | null; phoneTail?: string }
  onVoidItem?: (order: Order, item: OrderItem) => void
  onDiscountItem?: (order: Order, item: OrderItem) => void
  onAddProducts?: () => void
}

/** Una ronda se corrige mientras no se cobró ni pasó a preparación. */
function isEditable(order: Order): boolean {
  return (order.status === "pending" || order.status === "confirmed") && !order.payments?.length
}

export function TableDetail({ table, activity, orders, now, reservation, onVoidItem, onDiscountItem, onAddProducts }: TableDetailProps) {
  const rounds = [...orders].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  const lines = rounds.flatMap((o) => o.items)
  const discounts = lines.reduce((s, i) => s + (i.discount?.amount ?? 0), 0)
  const total = rounds.reduce((s, o) => s + o.total, 0)
  const paid = rounds.filter((o) => o.payments?.length).reduce((s, o) => s + o.total, 0)
  const units = lines.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="tdetail">
      <header className="tdetail-head">
        <div className="tdetail-title">
          <span className="tdetail-number">Mesa {table.number}</span>
          <span className={`status-pill status-pill--${table.status}`}>{MESA_STATUS_LABEL[table.status] ?? table.status}</span>
          {table.needsBill && <span className="status-pill status-pill--bill">Cuenta pedida</span>}
        </div>
        <dl className="tdetail-facts">
          <div><dt><LayoutGrid size={14} aria-hidden /> Sector</dt><dd>{table.section || "Sala principal"}</dd></div>
          <div><dt><Users size={14} aria-hidden /> {table.guests ? "Comensales" : "Capacidad"}</dt><dd>{table.guests ? `${table.guests} de ${table.capacity}` : table.capacity}</dd></div>
          {activity && <div><dt><Clock size={14} aria-hidden /> Abierta hace</dt><dd>{formatElapsed(activity.openedAt, now)}</dd></div>}
          <div><dt><Receipt size={14} aria-hidden /> Rondas</dt><dd>{rounds.length} · {units} productos</dd></div>
        </dl>
      </header>

      {reservation && (
        <div className="tdetail-reservation" role="note">
          <CalendarClock size={20} aria-hidden />
          <div>
            <div className="mesa-panel-reservation-title">Reservada · {reservation.time}</div>
            <div><strong>{reservation.name}</strong> — {reservation.partySize} {reservation.partySize === 1 ? "persona" : "personas"}
              {reservation.spaceName ? ` · ${reservation.spaceName}` : ""}{reservation.phoneTail ? ` · Tel. …${reservation.phoneTail}` : ""}</div>
            {reservation.notes && <div className="text-sm">📝 {reservation.notes}</div>}
          </div>
        </div>
      )}

      <div className="tdetail-rounds">
        {rounds.length === 0 ? (
          <div className="empty-state tdetail-empty">
            <span className="empty-state-text">Sin pedidos todavía</span>
            {onAddProducts && !table.needsBill && (
              <button type="button" className="btn review-add" onClick={onAddProducts}>
                <Plus size={22} aria-hidden /> Agregar productos
              </button>
            )}
          </div>
        ) : (
          rounds.map((order, idx) => {
            const editable = isEditable(order)
            const paidRound = Boolean(order.payments?.length)
            return (
              <section key={order.id} className="tdetail-round" aria-label={`Ronda ${idx + 1}`}>
                <div className="tdetail-round-head">
                  <span className="tdetail-round-title">Ronda {idx + 1}</span>
                  <span className="text-sm text-muted">
                    {new Date(order.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`tdetail-round-status tdetail-round-status--${order.status}`}>{ROUND_STATUS[order.status] ?? order.status}</span>
                  {paidRound && <span className="tdetail-round-status tdetail-round-status--paid">Cobrada</span>}
                  <span className="tdetail-round-total">{formatCurrency(order.total)}</span>
                </div>
                <ul className="tdetail-lines">
                  {order.items.map((item, i) => (
                    <li key={item.lineId ?? `${order.id}-${i}`} className="tdetail-line">
                      <span className="review-qty">{item.quantity}</span>
                      <div className="review-line-main">
                        <span className="tdetail-line-name">
                          {item.course && <span className="order-item-course">{COURSE_LABEL[item.course]}</span>}
                          {item.name}
                        </span>
                        {item.modifiers && item.modifiers.length > 0 && <span className="review-mods">{item.modifiers.map((m) => m.name).join(" · ")}</span>}
                        {item.notes && <span className="review-note">{item.notes}</span>}
                        {item.discount && (
                          <span className="mesa-panel-discount">
                            Desc. {item.discount.kind === "percent" ? `${item.discount.value}%` : ""} −{formatCurrency(item.discount.amount)}
                          </span>
                        )}
                      </div>
                      <span className="tdetail-line-price">{formatCurrency(item.total)}</span>
                      <span className="tdetail-line-actions">
                        {onDiscountItem && item.lineId && !paidRound && (
                          <button type="button" className={`tdetail-icon tdetail-icon--green${item.discount ? " active" : ""}`} onClick={() => onDiscountItem(order, item)} aria-label={`Descuento en ${item.name}`} title="Descuento">
                            <Percent size={16} aria-hidden />
                          </button>
                        )}
                        {onVoidItem && item.lineId && editable && (
                          <button type="button" className="tdetail-icon tdetail-icon--red" onClick={() => onVoidItem(order, item)} aria-label={`Quitar ${item.name}`} title="Quitar (con motivo)">
                            <X size={16} aria-hidden />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>

      {rounds.length > 0 && (
        <footer className="tdetail-totals">
          {discounts > 0 && <div><span>Descuentos</span><span className="text-success">−{formatCurrency(discounts)}</span></div>}
          {paid > 0 && <div><span>Ya cobrado</span><span>{formatCurrency(paid)}</span></div>}
          <div className="tdetail-grand"><span>{paid > 0 ? "Falta cobrar" : "Total"}</span><span>{formatCurrency(total - paid)}</span></div>
        </footer>
      )}
    </div>
  )
}
