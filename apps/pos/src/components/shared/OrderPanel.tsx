import type { OrderItem } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

interface OrderPanelProps {
  title: string
  items: OrderItem[]
  onUpdateQuantity?: (productId: string, quantity: number) => void
  onRemoveItem?: (productId: string) => void
  total: number
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean }
  footerContent?: React.ReactNode
}

export function OrderPanel({
  title,
  items,
  onUpdateQuantity,
  onRemoveItem,
  total,
  primaryAction,
  footerContent,
}: OrderPanelProps) {
  return (
    <div className="order-panel" style={{ height: "100%" }}>
      <div className="order-panel-header">
        <span className="order-panel-title">{title}</span>
        <span className="status-badge pending">{items.length} items</span>
      </div>

      <div className="order-panel-items">
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <span className="empty-state-icon">🛒</span>
            <span className="empty-state-text">Sin productos</span>
          </div>
        ) : (
          <div className="order-items">
            {items.map((item, idx) => (
              <div key={`${item.productId}-${idx}`} className="order-item-card">
                <div className="order-item-main">
                  <div className="order-item-top">
                    <span className="order-item-name">{item.name}</span>
                    <span className="order-item-total">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="order-item-modifiers">
                      {item.modifiers.map((m, i) => (
                        <span key={i} className="order-item-modifier">
                          {m.name}{m.price > 0 ? ` (+${formatCurrency(m.price)})` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.notes && (
                    <div className="order-item-notes">{item.notes}</div>
                  )}
                </div>
                <div className="order-item-actions">
                  {onUpdateQuantity && (
                    <div className="order-item-qty">
                      <button onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}>
                        −
                      </button>
                      <span style={{ minWidth: 20, textAlign: "center" }}>
                        {item.quantity}
                      </span>
                      <button onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}>
                        +
                      </button>
                    </div>
                  )}
                  {!onUpdateQuantity && <span className="order-item-qty">{item.quantity}×</span>}
                  {onRemoveItem && (
                    <button
                      className="order-item-remove"
                      onClick={() => onRemoveItem(item.productId)}
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="order-panel-footer">
        {footerContent}
        <div className="order-total-row order-total-grand">
          <span className="order-total-label">Total</span>
          <span className="order-total-value">{formatCurrency(total)}</span>
        </div>
        {primaryAction && (
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled ?? items.length === 0}
          >
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}
