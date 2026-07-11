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
  return (
    <div className="p-6">
      <div className="turno-stats" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="turno-stat">
          <div className="turno-stat-label">Capacidad</div>
          <div className="turno-stat-num">{table.capacity}</div>
        </div>
        <div className="turno-stat">
          <div className="turno-stat-label">Estado</div>
          <div className="turno-stat-num" style={{ fontSize: 14, textTransform: "capitalize" }}>
            {table.status === "occupied" ? "Ocupada" : table.status === "free" ? "Libre" : "Reservada"}
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
