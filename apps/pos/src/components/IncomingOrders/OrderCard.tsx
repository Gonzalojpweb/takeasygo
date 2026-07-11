import type { Order } from "@takeasygo/types"
import { formatCurrency, timeAgo } from "../../utils/format"

interface OrderCardProps {
  order: Order
  onClick: (orderId: string) => void
}

function getSourceMeta(source: string): { icon: string; label: string; className: string } {
  switch (source) {
    case "delivery":
      return { icon: "🚚", label: "Delivery", className: "delivery" }
    case "takeaway":
      return { icon: "🥡", label: "Take Away", className: "pickup" }
    case "marketplace":
      return { icon: "🏪", label: "Marketplace", className: "marketplace" }
    case "app":
      return { icon: "📱", label: "App", className: "app" }
    case "pos":
      return { icon: "◻", label: "POS", className: "app" }
    default:
      return { icon: "☎", label: "Teléfono", className: "pickup" }
  }
}

function getTimeAgoMinutes(createdAt: Date): number {
  const now = Date.now()
  const created = new Date(createdAt).getTime()
  return Math.floor((now - created) / 60000)
}

function formatOrderItems(items: Order["items"]) {
  return items.map((i) => `${i.quantity}× ${i.name}`).join(", ")
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const source = getSourceMeta(order.source || "takeasygo")
  const minutes = getTimeAgoMinutes(order.createdAt)
  const isUrgent = minutes > 5

  return (
    <div
      className={`order-card ${isUrgent ? "urgent" : ""}`}
      onClick={() => onClick(order.id)}
      style={{ cursor: "pointer" }}
    >
      <div className="order-card-left">
        <div className="order-card-header">
          <div className={`order-card-source ${source.className}`}>
            {source.icon}
          </div>
          <div>
            <div className="order-card-title">
              #{order.id.slice(0, 8)}
            </div>
            <div className="order-card-meta">
              <span>{source.label}</span>
            </div>
          </div>
          <span className={`status-badge ${order.status}`}>
            {order.status}
          </span>
        </div>
        <div className="order-card-items">{formatOrderItems(order.items)}</div>
      </div>
      <div className="order-card-right">
        <span className={`order-card-time ${isUrgent ? "urgent" : ""}`}>
          {isUrgent ? `⚠ ${minutes} min` : timeAgo(order.createdAt)}
        </span>
        <span className="order-card-total">{formatCurrency(order.total)}</span>
      </div>
    </div>
  )
}
