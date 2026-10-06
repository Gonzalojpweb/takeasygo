import type { Table } from "@takeasygo/types"

type MesaVariant = "counter" | "waiter"

interface MesaCardProps {
  table: Table
  variant: MesaVariant
  onClick: (tableId: string) => void
  isSelected?: boolean
}

export function MesaCard({ table, variant, onClick, isSelected = false }: MesaCardProps) {
  const isFree = table.status === "free"
  const isOccupied = table.status === "occupied"
  const isReserved = table.status === "reserved"
  const isAttention = table.status === "needs_attention"

  const statusClass = isFree
    ? "libre"
    : isOccupied
    ? "ocupada"
    : isAttention
    ? "atencion"
    : isReserved
    ? "reservada"
    : "libre"

  // Para Counter: se muestran pax y tiempo
  // Para Waiter: se muestran estado de cuenta/atención
  const renderInfo = () => {
    if (variant === "counter") {
      if (isFree) return <span className="mesa-info">Libre</span>
      if (isOccupied) return <span className="mesa-info">👤 {table.capacity ?? "—"}</span>
      if (isAttention) return <span className="mesa-info">🔔</span>
      if (isReserved) return <span className="mesa-info">Reservada</span>
      return null
    }
    // waiter
    if (isFree) return <span className="mesa-info">Libre</span>
    if (isOccupied) return <span className="mesa-info">{table.needsBill ? '💵 Cuenta' : `👤 ${table.capacity ?? '—'}`}</span>
    if (isReserved) return <span className="mesa-info">Reservada</span>
    if (isAttention) return <span className="mesa-info">⚠ Atención</span>
    return null
  }

  return (
    <div
      className={`mesa ${statusClass}${isSelected ? ' seleccionada' : ''}`}
      onClick={() => onClick(table.id)}
    >
      <span className="mesa-number">{table.number}</span>
      {renderInfo()}
    </div>
  )
}
