import type { Order, OrderItem, Table } from "@takeasygo/types"
import { Clock, Users, Receipt, UtensilsCrossed, X, Percent } from "lucide-react"
import { formatCurrency } from "../../utils/format"
import { formatElapsed, type TableActivity } from "../../hooks/useTableActivity"
import { MESA_STATUS_LABEL } from "../shared/MesaCard"

// ============================================================================
// Context Panel de la escena "Mesa seleccionada" (Scene Architecture §13)
// ============================================================================
// Responde: ¿sobre qué estoy trabajando? → Mesa N, su estado, desde cuándo,
// qué se pidió y cuánto debe. Antes no existía: tocar una mesa saltaba
// directo a "Agregar productos" sin mostrar la cuenta.
// Las ACCIONES viven en la Action Bar (posición fija), no acá.
// ============================================================================

interface MesaContextPanelProps {
  table: Table
  activity?: TableActivity
  orders: Order[]
  now: number
  /**
   * Fase C: presente ⇒ cada plato enviado (y sin cobrar) tiene «Quitar».
   * Solo lo pasa el Counter: el mozo no quita platos enviados.
   */
  onVoidItem?: (order: Order, item: OrderItem) => void
  /** Fase D: presente ⇒ cada plato sin cobrar tiene «Descuento». */
  onDiscountItem?: (order: Order, item: OrderItem) => void
}

/** Una ronda se puede corregir mientras no se cobró ni pasó a preparación. */
function isEditable(order: Order): boolean {
  return (order.status === "pending" || order.status === "confirmed") && !order.payments?.length
}

export function MesaContextPanel({ table, activity, orders, now, onVoidItem, onDiscountItem }: MesaContextPanelProps) {
  const lines = orders.flatMap((o) => o.items.map((item) => ({ order: o, item })))

  return (
    <div className="mesa-panel">
      <div className="mesa-panel-status">
        <span className={`status-pill status-pill--${table.status}`}>
          {MESA_STATUS_LABEL[table.status] ?? table.status}
        </span>
        {table.needsBill && <span className="status-pill status-pill--bill">Pidió la cuenta</span>}
      </div>

      <dl className="mesa-panel-facts">
        <div>
          <dt><Users size={14} aria-hidden /> {table.guests ? "Comensales" : "Capacidad"}</dt>
          <dd>{table.guests ? `${table.guests} de ${table.capacity}` : `${table.capacity} personas`}</dd>
        </div>
        {activity && (
          <div>
            <dt><Clock size={14} aria-hidden /> Abierta hace</dt>
            <dd>{formatElapsed(activity.openedAt, now)}</dd>
          </div>
        )}
        {activity && (
          <div>
            <dt><UtensilsCrossed size={14} aria-hidden /> Rondas en cocina</dt>
            <dd>{activity.rounds}</dd>
          </div>
        )}
        {table.section && (
          <div>
            <dt>Sector</dt>
            <dd>{table.section}</dd>
          </div>
        )}
      </dl>

      <div className="mesa-panel-account">
        <div className="mesa-panel-account-label">
          <Receipt size={14} aria-hidden /> Cuenta actual
        </div>
        <div className="mesa-panel-account-total">{formatCurrency(activity?.total ?? 0)}</div>
        {activity && activity.unpaid !== activity.total && (
          <div className="text-sm text-muted">Falta cobrar {formatCurrency(activity.unpaid)}</div>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted mesa-panel-empty">
            Sin pedidos todavía. Agregá productos para abrir la cuenta.
          </p>
        ) : (
          <ul className="mesa-panel-items">
            {lines.map(({ order, item }, idx) => (
              <li key={item.lineId ?? `${item.productId}-${idx}`}>
                <span className="mesa-panel-qty">{item.quantity}</span>
                <span className="mesa-panel-name">
                  {item.name}
                  {item.notes && <span className="mesa-panel-note">{item.notes}</span>}
                  {item.discount && (
                    <span className="mesa-panel-discount">
                      Desc. {item.discount.kind === "percent" ? `${item.discount.value}%` : formatCurrency(item.discount.amount)}
                    </span>
                  )}
                </span>
                <span className="mesa-panel-price">{formatCurrency(item.total)}</span>
                {onDiscountItem && item.lineId && !order.payments?.length && (
                  <button
                    type="button"
                    className={`mesa-panel-void mesa-panel-disc${item.discount ? " active" : ""}`}
                    onClick={() => onDiscountItem(order, item)}
                    aria-label={`Descuento en ${item.name}`}
                    title="Descuento"
                  >
                    <Percent size={15} aria-hidden />
                  </button>
                )}
                {onVoidItem && item.lineId && isEditable(order) && (
                  <button
                    type="button"
                    className="mesa-panel-void"
                    onClick={() => onVoidItem(order, item)}
                    aria-label={`Quitar ${item.name}`}
                    title="Quitar (con motivo)"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
