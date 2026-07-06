import { type CustomerOrder } from "../../services/customers-api"
import { formatCurrency, timeAgo, formatTime, formatOrderStatus } from "../../utils/format"

interface TimelineProps {
  orders: CustomerOrder[]
  loading: boolean
}

export function Timeline({ orders, loading }: TimelineProps) {
  if (loading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Cargando historial...
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🧾</div>
        <div className="empty-state-text">No hay pedidos cargados para este cliente</div>
      </div>
    )
  }

  return (
    <div className="timeline">
      {orders.map((order, idx) => {
        const isLatest = idx === 0
        const isLast = idx === orders.length - 1
        return (
          <div key={order._id} className={`timeline-item ${isLatest ? "latest" : ""}`}>
            <div className="timeline-marker">
              <div className="timeline-dot" />
              {!isLast && <div className="timeline-line" />}
            </div>
            <div className={`timeline-card ${isLatest ? "active" : ""}`}>
              <div className="timeline-card-head">
                <strong>#{order.orderNumber}</strong>
                <span className={`status-badge ${order.status}`}>{formatOrderStatus(order.status)}</span>
              </div>
              <div className="timeline-card-meta">
                <span>{timeAgo(new Date(order.createdAt))}</span>
                <span>{formatTime(new Date(order.createdAt))}</span>
                <span>{order.items.length} items</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
              <div className="timeline-card-items">
                {order.items.slice(0, 3).map((item, i) => (
                  <span key={i} className="timeline-item-tag">
                    {item.quantity}x {item.name}
                  </span>
                ))}
                {order.items.length > 3 && (
                  <span className="timeline-item-tag muted">+{order.items.length - 3} más</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
