import type { Table } from "@takeasygo/types"

type MesaVariant = "counter" | "waiter"

interface MesaCardProps {
  table: Table
  variant: MesaVariant
  onClick: (tableId: string) => void
}

export function MesaCard({ table, variant, onClick }: MesaCardProps) {
  const isFree = table.status === "free"
  const isOccupied = table.status === "occupied"
  const isReserved = table.status === "reserved"
  const isAttention = table.status === "needs_attention"

  const statusClass = isFree ? "libre" : isOccupied ? "ocupada" : isAttention ? "atencion" : "atencion"

  return (
    <div
      className={`mesa ${statusClass}`}
      onClick={() => onClick(table.id)}
    >
      <span className="mesa-number">{table.number}</span>

      {variant === "counter" && (
        <span className="mesa-info">
          {isFree ? "Libre" : isOccupied ? "Ocupada" : isReserved ? "⚠ Solicita cuenta" : "⚠ Atención"}
        </span>
      )}

      {variant === "waiter" && (
        <>
          {isFree && <span className="mesa-info">Libre</span>}
          {isOccupied && (
            <>
              <span className="mesa-time">—</span>
              <span className="mesa-info">{table.needsBill ? "💵 Cuenta" : "Ocupada"}</span>
            </>
          )}
          {isReserved && (
            <span className="mesa-info">Reservada</span>
          )}
          {isAttention && (
            <span className="mesa-info">⚠ Atención</span>
          )}
        </>
      )}
    </div>
  )
}
