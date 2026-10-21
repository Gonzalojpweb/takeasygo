import type { Order, Table } from "@takeasygo/types"
import { Clock, Users, Receipt, UtensilsCrossed } from "lucide-react"
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
}

export function MesaContextPanel({ table, activity, orders, now }: MesaContextPanelProps) {
  const items = orders.flatMap((o) => o.items)

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
          <dt><Users size={14} aria-hidden /> Capacidad</dt>
          <dd>{table.capacity} personas</dd>
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

        {items.length === 0 ? (
          <p className="text-sm text-muted mesa-panel-empty">
            Sin pedidos todavía. Agregá productos para abrir la cuenta.
          </p>
        ) : (
          <ul className="mesa-panel-items">
            {items.map((item, idx) => (
              <li key={`${item.productId}-${idx}`}>
                <span className="mesa-panel-qty">{item.quantity}</span>
                <span className="mesa-panel-name">{item.name}</span>
                <span className="mesa-panel-price">{formatCurrency(item.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
