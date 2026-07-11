import type { DeliveryOrder, DeliveryPerson } from "../../services/delivery"
import { formatCurrency } from "../../utils/format"

interface DeliveryAssignListProps {
  orders: DeliveryOrder[]
  person: DeliveryPerson
  onAssign: (orderId: string) => void
}

export function DeliveryAssignList({ orders, person, onAssign }: DeliveryAssignListProps) {
  if (orders.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "var(--sp-8)" }}>
        <span className="empty-state-icon">📦</span>
        <span className="empty-state-text">No hay órdenes disponibles para asignar</span>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Asignar a {person.name}</span>
      </div>
      <div className="order-items">
        {orders.map((order) => (
          <div key={order.id} className="order-item-card">
            <div className="order-item-main">
              <div className="order-item-top">
                <span className="order-item-name">#{order.id.slice(0, 8)}</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(order.total)}</span>
              </div>
              <div className="order-item-modifiers">
                <span>{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                {order.address && (
                  <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    📍 {order.address}
                  </span>
                )}
              </div>
            </div>
            <div className="order-card-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onAssign(order.id)}
              >
                Asignar a {person.name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
