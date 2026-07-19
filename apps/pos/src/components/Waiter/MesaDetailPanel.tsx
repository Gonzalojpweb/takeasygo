import type { Table } from "@takeasygo/types"

interface MesaDetailPanelProps {
  table: Table
  onTomarPedido: () => void
  onCocina: () => void
  onCuenta: () => void
}

export function MesaDetailPanel({
  table,
  onTomarPedido,
  onCocina,
  onCuenta,
}: MesaDetailPanelProps) {
  const statusLabel = table.status === "needs_attention" ? "⚠ Atención" :
    table.status === "occupied" ? "Ocupada" :
    table.status === "reserved" ? "Reservada" : "Libre"

  return (
    <div className="p-6">
      <div className="turno-stats" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="turno-stat">
          <div className="turno-stat-label">Comensales</div>
          <div className="turno-stat-num">{table.capacity}</div>
        </div>
        <div className="turno-stat">
          <div className="turno-stat-label">Estado</div>
          <div className="turno-stat-num" style={{ fontSize: 14, textTransform: "capitalize" }}>
            {statusLabel}
          </div>
        </div>
        <div className="turno-stat">
          <div className="turno-stat-label">Sector</div>
          <div className="turno-stat-num" style={{ fontSize: 14 }}>
            {table.section || "Salón"}
          </div>
        </div>
        <div className="turno-stat">
          <div className="turno-stat-label">Mozo</div>
          <div className="turno-stat-num" style={{ fontSize: 14 }}>
            {table.serverId ? `#${table.serverId.slice(0, 6)}` : "—"}
          </div>
        </div>
      </div>

      {table.needsBill && (
        <div style={{
          padding: "var(--sp-3)",
          background: "var(--warning-light)",
          border: "1px solid var(--warning)",
          borderRadius: 8,
          marginBottom: "var(--sp-4)",
          fontSize: "var(--font-size-sm)",
          color: "#8A6100",
          textAlign: "center",
          fontWeight: 600,
        }}>
          💵 Solicita cuenta
        </div>
      )}

      <div className="quick-actions" style={{ display: "flex", gap: "var(--sp-3)" }}>
        <button
          className="btn btn-primary btn-lg"
          style={{ flex: 1, height: 80 }}
          onClick={onTomarPedido}
        >
          📝 Tomar pedido
        </button>
        <button
          className="btn btn-ghost btn-lg"
          style={{ flex: 1, height: 80 }}
          onClick={onCocina}
        >
          🍳 Cocina
        </button>
        <button
          className="btn btn-ghost btn-lg"
          style={{ flex: 1, height: 80 }}
          onClick={onCuenta}
        >
          💰 Cuenta
        </button>
      </div>
    </div>
  )
}
