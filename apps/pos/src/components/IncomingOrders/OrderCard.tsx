import type { Order, OrderStatus, PaymentMethod } from "@takeasygo/types"
import { formatCurrency, timeAgo } from "../../utils/format"

interface OrderCardProps {
  order: Order
  onClick: (orderId: string) => void
  onConfirmTransfer?: (orderId: string) => void
  onPrepare?: (orderId: string) => void
  onMarkReady?: (orderId: string) => void
  onDeliver?: (orderId: string) => void
  showLifecycleButtons?: boolean
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

export function OrderCard({ order, onClick, onConfirmTransfer, onPrepare, onMarkReady, onDeliver, showLifecycleButtons = true }: OrderCardProps) {
  const source = getSourceMeta(order.source || "takeasygo")
  const payment = getPaymentMeta(order.paymentMethod)
  const minutes = getTimeAgoMinutes(order.createdAt)
  const isUrgent = minutes > 5

  const isTransferPending = order.paymentMethod === "transfer" && order.externalStatus === "awaiting_payment"
  const isMPPending = (order.paymentMethod === "mercadopago" || order.paymentMethod === "kripton") && order.externalStatus === "awaiting_payment"
  const isConfirmed = order.externalStatus === "confirmed" || order.status === "confirmed"

  const isIntegrated = !!order.integratedAt
  const isDelivery = order.source === "delivery"

  function getNextStatusLabel(status: OrderStatus): string | null {
    switch (status) {
      case "pending":
      case "confirmed":
        return "Iniciar Preparación"
      case "preparing":
        return "Marcar Listo"
      case "ready":
        return isDelivery ? "Listo para delivery" : "Entregado"
      default:
        return null
    }
  }

  function getNextAction(status: OrderStatus): (() => void) | null {
    if (!isIntegrated || !showLifecycleButtons) return null
    switch (status) {
      case "pending":
      case "confirmed":
        return onPrepare ? () => onPrepare(order.id) : null
      case "preparing":
        return onMarkReady ? () => onMarkReady(order.id) : null
      case "ready":
        return isDelivery ? null : (onDeliver ? () => onDeliver(order.id) : null)
      default:
        return null
    }
  }

  function getStatusBadgeColor(status: OrderStatus): string {
    switch (status) {
      case "pending": return "var(--text-muted)"
      case "confirmed": return "var(--info)"
      case "preparing": return "var(--warning)"
      case "ready": return "var(--success)"
      case "delivered": return "var(--text-muted)"
      case "cancelled": return "var(--danger)"
      default: return "var(--text-muted)"
    }
  }

  const nextAction = getNextAction(order.status)
  const nextLabel = getNextStatusLabel(order.status)

  const handleClick = () => {
    if (!isIntegrated) {
      onClick(order.id)
    }
  }

  return (
    <div
      className={`order-card ${isUrgent ? "urgent" : ""} ${isMPPending ? "mp-pending" : ""} ${isTransferPending ? "transfer-pending" : ""}`}
      onClick={handleClick}
      style={{ cursor: isIntegrated ? "default" : "pointer", opacity: isMPPending ? 0.6 : 1 }}
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
              {isIntegrated && (
                <span style={{
                  fontSize: "var(--font-size-xs)",
                  color: getStatusBadgeColor(order.status),
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  {order.status === "pending" && "Integrado"}
                  {order.status === "confirmed" && "Confirmado"}
                  {order.status === "preparing" && "En preparación"}
                  {order.status === "ready" && (isDelivery ? "Listo para delivery" : "Listo")}
                  {order.status === "delivered" && "Entregado"}
                </span>
              )}
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
          {isConfirmed && !isIntegrated && (
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
        {isIntegrated && nextAction && (
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: "var(--sp-2)" }}
            onClick={(e) => {
              e.stopPropagation()
              nextAction()
            }}
          >
            {nextLabel}
          </button>
        )}
        {isIntegrated && isDelivery && order.status === "ready" && (
          <div style={{ marginTop: "var(--sp-2)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            El estado se actualizará desde el panel de administración
          </div>
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
