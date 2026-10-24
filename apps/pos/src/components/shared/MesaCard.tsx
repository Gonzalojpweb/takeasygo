import type { Table } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"
import { formatElapsed, type TableActivity } from "../../hooks/useTableActivity"

// ============================================================================
// Mesa — Domain Component (Component System §4)
// ============================================================================
// Representa el contexto operativo; nunca un pedido ni un pago.
// · Estado con TEXTO + forma + color (ROS Grammar §11: nunca solo color).
// · Muestra nombre, estado y tiempo o monto (Counter v2 §4).
// · Es un <button>: se opera con teclado y lector de pantalla.
// · Texto oscuro sobre los colores sólidos: AA en los 4 estados.
// ============================================================================

export type MesaVariant = "counter" | "waiter"

export const MESA_STATUS_LABEL: Record<string, string> = {
  free: "Libre",
  occupied: "Ocupada",
  needs_attention: "Atención",
  reserved: "Reservada",
  closed: "Cerrada",
}

const STATUS_CLASS: Record<string, string> = {
  free: "libre",
  occupied: "ocupada",
  needs_attention: "atencion",
  reserved: "reservada",
  closed: "libre",
}

interface MesaCardProps {
  table: Table
  variant: MesaVariant
  onClick: (tableId: string) => void
  isSelected?: boolean
  activity?: TableActivity
  /** Reloj compartido (useNow): Date.now() en render es impuro. */
  now: number
}

export function MesaCard({ table, variant, onClick, isSelected = false, activity, now }: MesaCardProps) {
  const statusLabel = table.needsBill && variant === "waiter" ? "Pide cuenta" : (MESA_STATUS_LABEL[table.status] ?? "Libre")
  const elapsed = activity ? formatElapsed(activity.openedAt, now) : null
  const amount = activity && activity.total > 0 ? formatCurrency(activity.total) : null

  const ariaLabel = [
    `Mesa ${table.number}`,
    statusLabel,
    table.guests ? `${table.guests} comensales` : null,
    amount,
    elapsed ? `abierta hace ${elapsed}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <button
      type="button"
      className={`mesa ${STATUS_CLASS[table.status] ?? "libre"}${isSelected ? " seleccionada" : ""}`}
      onClick={() => onClick(table.id)}
      aria-pressed={isSelected}
      aria-label={ariaLabel}
    >
      <span className="mesa-number">{table.number}</span>
      {amount ? (
        <>
          <span className="mesa-info mesa-amount">{amount}</span>
          {elapsed && <span className="mesa-info">{elapsed}</span>}
        </>
      ) : (
        <span className="mesa-info">{statusLabel}</span>
      )}
      {table.guests ? <span className="mesa-guests" aria-hidden>👥 {table.guests}</span> : null}
    </button>
  )
}
