import type { Order, Table } from "@takeasygo/types"
import { Clock, Users } from "lucide-react"
import { formatCurrency } from "../../utils/format"
import { formatElapsed, type TableActivity } from "../../hooks/useTableActivity"
import { MESA_STATUS_LABEL } from "../shared/MesaCard"

// ============================================================================
// Context Panel del mozo — Mesa seleccionada
// ============================================================================
// "Kitchen viene hacia él" (Waiter Experience v2): el estado de cada ronda
// sale de las ÓRDENES de la mesa, que el polling sincroniza entre todos los
// dispositivos. Antes leía las comandas locales del propio dispositivo: desde
// el celular nunca se veían los cambios hechos en el Counter o en cocina.
// Las acciones viven en la Action Bar (slot fijo), no acá.
// ============================================================================

const ROUND_LABEL: Record<string, string> = {
  pending: "Sin enviar",
  confirmed: "En cocina",
  preparing: "Preparando",
  ready: "Listo para servir",
  requires_manual_attention: "Revisar",
}

interface WaiterContextPanelProps {
  table: Table
  orders: Order[]
  activity?: TableActivity
  now: number
}

export function WaiterContextPanel({ table, orders, activity, now }: WaiterContextPanelProps) {
  const sorted = [...orders].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))

  return (
    <div className="mesa-panel">
      <div className="mesa-panel-status">
        <span className={`status-pill status-pill--${table.status}`}>
          {MESA_STATUS_LABEL[table.status] ?? table.status}
        </span>
        {table.needsBill && <span className="status-pill status-pill--bill">Cuenta pedida</span>}
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
      </dl>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Sin pedidos. Tocá «Tomar pedido».</p>
      ) : (
        <div className="waiter-rounds">
          {sorted.map((order, i) => (
            <section key={order.id} className={`waiter-round waiter-round--${order.status}`}>
              <header>
                <span className="waiter-round-title">Ronda {i + 1}</span>
                <span className="waiter-round-status">{ROUND_LABEL[order.status] ?? order.status}</span>
              </header>
              <ul>
                {order.items.map((item, idx) => (
                  <li key={`${item.productId}-${idx}`}>
                    <span className="mesa-panel-qty">{item.quantity}</span>
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {activity && (
            <div className="waiter-rounds-total">
              <span>Consumo</span>
              <strong>{formatCurrency(activity.total)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
