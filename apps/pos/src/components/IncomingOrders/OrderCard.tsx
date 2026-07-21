import type { Order, PaymentMethod } from "@takeasygo/types"
import { formatCurrency, timeAgo } from "../../utils/format"

interface OrderCardProps {
  order: Order
  onClick: (orderId: string) => void
  onConfirmTransfer?: (orderId: string) => void
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

function getPaymentMeta(paymentMethod?: PaymentMethod): { icon: string; label: string; className: string } {
  switch (paymentMethod) {
    case "mercadopago":
      return { icon: "💙", label: "MP", className: "mercadopago" }
    case "kripton":
      return { icon: "₿", label: "Kripton", className: "kripton" }
    case "transfer":
      return { icon: "🏦", label: "Transferencia", className: "transfer" }
    case "cash":
      return { icon: "💵", label: "Efectivo", className: "cash" }
    case "posnet_debit":
    case "posnet_credit":
      return { icon: "💳", label: "POSNET", className: "posnet" }
    default:
      return { icon: "❓", label: "Otro", className: "other" }
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

export function OrderCard({ order, onClick, onConfirmTransfer }: OrderCardProps) {
  const source = getSourceMeta(order.source || "takeasygo")
  const payment = getPaymentMeta(order.paymentMethod)
  const minutes = getTimeAgoMinutes(order.createdAt)
  const isUrgent = minutes > 5

  const isTransferPending = order.paymentMethod === "transfer" && order.externalStatus === "awaiting_payment"
  const isMPPending = (order.paymentMethod === "mercadopago" || order.paymentMethod === "kripton") && order.externalStatus === "awaiting_payment"
  const isConfirmed = order.externalStatus === "confirmed" || order.status === "confirmed"

  return (
    <div
      className={`order-card ${isUrgent ? "urgent" : ""} ${isMPPending ? "mp-pending" : ""} ${isTransferPending ? "transfer-pending" : ""}`}
      onClick={() => onClick(order.id)}
      style={{ cursor: "pointer", opacity: isMPPending ? 0.6 : 1 }}
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
              <span className={`order-card-payment ${payment.className}`}>
                {payment.icon} {payment.label}
              </span>
            </div>
          </div>
          {isMPPending && (
            <span className="status-badge awaiting-payment">
              Esperando pago
            </span>
          )}
          {isTransferPending && (
            <span className="status-badge transfer-pending">
              Transferencia pendiente
            </span>
          )}
          {isConfirmed && (
            <span className={`status-badge ${order.status}`}>
              {order.status}
            </span>
          )}
        </div>
        <div className="order-card-items">{formatOrderItems(order.items)}</div>
        {isTransferPending && (
          <div className="order-card-hint" style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: "var(--sp-1)" }}>
            Revisá el comprobante en WhatsApp antes de confirmar
          </div>
        )}
        {isTransferPending && onConfirmTransfer && (
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: "var(--sp-2)" }}
            onClick={(e) => {
              e.stopPropagation()
              onConfirmTransfer(order.id)
            }}
          >
            Confirmar pago
          </button>
        )}
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
