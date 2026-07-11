import type { Order } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

interface ValidationItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  status: "valid" | "needs_attention"
}

interface OrderValidationPanelProps {
  order: Order
  items: ValidationItem[]
  onToggleItem: (productId: string) => void
}

export function OrderValidationPanel({ order, items, onToggleItem }: OrderValidationPanelProps) {
  const needsAttention = items.filter((v) => v.status === "needs_attention").length

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Items del pedido</span>
        <span className="text-muted text-sm">Click para marcar necesidad de atención</span>
      </div>
      <div className="order-items">
        {items.map((item) => (
          <div
            key={item.productId}
            className={`order-item-card ${item.status === "needs_attention" ? "dimmed" : ""}`}
            onClick={() => onToggleItem(item.productId)}
            style={{ cursor: "pointer", opacity: item.status === "needs_attention" ? 0.5 : 1 }}
          >
            <div className="order-item-main">
              <div className="order-item-top">
                <span className="order-item-name">
                  {item.status === "needs_attention" ? "⚠ " : "✓ "}{item.quantity}x {item.name}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {formatCurrency(item.unitPrice * item.quantity)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {needsAttention > 0 && (
        <div style={{ marginTop: "var(--sp-2)", padding: "var(--sp-2)", background: "var(--warning-bg, #fff3cd)", borderRadius: "var(--radius)", fontSize: "var(--font-size-sm)" }}>
          ⚠ {needsAttention} item(s) requieren atención
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--sp-3)", borderTop: "2px solid var(--text-structure)", fontWeight: 700, fontSize: "var(--font-size-lg)" }}>
        <span>Total</span>
        <span>{formatCurrency(order.total)}</span>
      </div>
    </div>
  )
}
