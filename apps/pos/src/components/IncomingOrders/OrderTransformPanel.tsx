import type { Order } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

interface OrderTransformPanelProps {
  order: Order
  transformResult: { localOrderId: string } | null
  transforming: boolean
  onTransform: () => void
  onReturn: () => void
}

export function OrderTransformPanel({
  order,
  transformResult,
  transforming,
  onTransform,
  onReturn,
}: OrderTransformPanelProps) {
  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "var(--sp-8)" }}>
      <div className="card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
        {transformResult ? (
          <div>
            <div style={{ fontSize: 64, marginBottom: "var(--sp-4)" }}>✅</div>
            <div className="workspace-title" style={{ marginBottom: "var(--sp-2)" }}>
              Pedido transformado
            </div>
            <div className="text-muted text-sm" style={{ marginBottom: "var(--sp-4)" }}>
              El pedido online ya está disponible como orden local en el sistema POS
            </div>
            <div style={{ padding: "var(--sp-3)", background: "var(--surface-secondary)", borderRadius: "var(--radius)", marginBottom: "var(--sp-4)" }}>
              <div style={{ fontWeight: 600, marginBottom: "var(--sp-1)" }}>Orden local ID</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                {transformResult.localOrderId}
              </div>
            </div>
            <button className="btn btn-primary" onClick={onReturn} style={{ width: "100%" }}>
              Volver a bandeja
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 64, marginBottom: "var(--sp-4)" }}>🔄</div>
            <div className="workspace-title" style={{ marginBottom: "var(--sp-2)" }}>
              Transformar a orden local
            </div>
            <div className="text-muted text-sm" style={{ marginBottom: "var(--sp-4)" }}>
              Este pedido online será convertido en una orden local del POS y enviado a cocina
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "var(--sp-4)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{order.items.length}</div>
                <div className="text-muted text-sm">Items</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(order.total)}</div>
                <div className="text-muted text-sm">Total</div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={onTransform}
              disabled={transforming}
              style={{ width: "100%" }}
            >
              {transforming ? "Transformando..." : "Crear orden local en POS"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
