import type { Table, KitchenCommand } from "@takeasygo/types"
import { formatOrderStatus } from "../../utils/format"

interface WaiterContextPanelProps {
  selectedTable: Table | null
  mesaOrders: KitchenCommand[]
  onTomarPedido: () => void
  onCuenta: () => void
}

export function WaiterContextPanel({
  selectedTable,
  mesaOrders,
  onTomarPedido,
  onCuenta,
}: WaiterContextPanelProps) {
  if (!selectedTable) {
    return (
      <div className="context-panel--empty" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="context-panel-empty-state">
          <span className="context-panel-empty-icon">◻</span>
          <span className="context-panel-empty-text">Seleccioná una mesa</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div className="context-panel-header">
        <div>
          <div className="context-panel-title">Mesa {selectedTable.number}</div>
          <div className="context-panel-subtitle">{selectedTable.section || "Salón"}</div>
        </div>
        <div className="context-entity-icon" style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--brand-orange)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 14,
        }}>
          {selectedTable.number}
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
        <div className="turno-stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="turno-stat">
            <div className="turno-stat-label">Capacidad</div>
            <div className="turno-stat-num">{selectedTable.capacity}</div>
          </div>
          <div className="turno-stat">
            <div className="turno-stat-label">Estado</div>
            <div className="turno-stat-num" style={{ fontSize: 12, textTransform: "capitalize" }}>
              {selectedTable.status === "needs_attention" ? "⚠ Atención" :
               selectedTable.status === "occupied" ? "Ocupada" :
               selectedTable.status === "reserved" ? "Reservada" : "Libre"}
            </div>
          </div>
        </div>
      </div>

      {/* Active orders */}
      {mesaOrders.length > 0 && (
        <div style={{ padding: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
            Pedidos activos
          </div>
          {mesaOrders.map((cmd) => (
            <div key={cmd.id} style={{
              padding: "var(--sp-2)",
              background: "var(--surface-secondary)",
              borderRadius: 6,
              marginBottom: "var(--sp-2)",
              border: cmd.delayed ? "1px solid var(--error)" : "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>Pedido #{cmd.id.slice(-4)}</span>
                <span className={`status-badge ${cmd.status}`}>{formatOrderStatus(cmd.status)}</span>
              </div>
              {cmd.delayed && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--error)", fontWeight: 600 }}>
                  ⚠ Demorado ({cmd.time || 0} min)
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding: "var(--sp-3)", marginTop: "auto" }}>
        <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
          Acciones rápidas
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--sp-2)" }}>
          <button className="btn btn-primary btn-sm" onClick={onTomarPedido}>
            ➕ Agregar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCuenta}>
            💵 Cuenta
          </button>
          <button className="btn btn-ghost btn-sm" disabled style={{ opacity: 0.5 }}>
            📝 Nota
          </button>
          <button className="btn btn-ghost btn-sm" disabled style={{ opacity: 0.5 }}>
            👨‍🍳 Encargado
          </button>
        </div>
      </div>
    </div>
  )
}
