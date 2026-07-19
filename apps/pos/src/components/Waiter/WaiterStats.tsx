import type { Table, KitchenCommand } from "@takeasygo/types"

interface WaiterStatsProps {
  tables: Table[]
  kitchenCommands: KitchenCommand[]
}

export function WaiterStats({ tables, kitchenCommands }: WaiterStatsProps) {
  const total = tables.length
  const attention = tables.filter((t) => t.status === "reserved").length
  const kitchen = kitchenCommands.filter((c) => c.status === "pending" || c.status === "preparing").length

  return (
    <div className="turno-stats">
      <div className="turno-stat">
        <div className="turno-stat-num">{total}</div>
        <div className="turno-stat-label">Mesas</div>
      </div>
      <div className="turno-stat" style={{ borderColor: "var(--error)" }}>
        <div className="turno-stat-num" style={{ color: "var(--error)" }}>
          {attention}
        </div>
        <div className="turno-stat-label">Atención</div>
      </div>
      <div className="turno-stat" style={{ borderColor: "var(--warning)" }}>
        <div className="turno-stat-num" style={{ color: "#B8860B" }}>
          {kitchen}
        </div>
        <div className="turno-stat-label">Cocina</div>
      </div>
      <div className="turno-stat" style={{ borderColor: "var(--success)" }}>
        <div className="turno-stat-num" style={{ color: "var(--success)" }}>
          0
        </div>
        <div className="turno-stat-label">Cuenta</div>
      </div>
    </div>
  )
}
