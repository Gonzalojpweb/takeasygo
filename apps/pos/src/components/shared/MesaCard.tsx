import type { Table } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"
import { formatElapsed, type TableActivity, formatElapsedShort, KITCHEN_WARN_MIN, KITCHEN_LATE_MIN } from "../../hooks/useTableActivity"

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
  /** Obs. 24/10: reserva asignada a la mesa (hora, nombre, comensales). */
  reservation?: { time: string; name: string; partySize: number }
  /** 30/10: encargado y admin ven quién atiende la mesa. */
  showServer?: boolean
}

export function MesaCard({ table, variant, onClick, isSelected = false, activity, now, reservation, showServer = false }: MesaCardProps) {
  const statusLabel = table.needsBill && variant === "waiter" ? "Pide cuenta" : (MESA_STATUS_LABEL[table.status] ?? "Libre")
  const elapsed = activity ? formatElapsed(activity.openedAt, now) : null
  const amount = activity && activity.total > 0 ? formatCurrency(activity.total) : null
  // 30/10: tiempos visibles en la mesa — abierta y en cocina (semáforo).
  const openedShort = activity ? formatElapsedShort(activity.openedAt, now) : null
  const kitchenMin = activity?.kitchenSince ? Math.floor((now - activity.kitchenSince.getTime()) / 60_000) : null
  const kitchenShort = activity?.kitchenSince ? formatElapsedShort(activity.kitchenSince, now) : null
  const kitchenClass = kitchenMin === null ? "" : kitchenMin >= KITCHEN_LATE_MIN ? " late" : kitchenMin >= KITCHEN_WARN_MIN ? " warn" : ""
  const server = showServer && table.serverName ? table.serverName.split(" ")[0] : null

  const ariaLabel = [
    `Mesa ${table.number}`,
    statusLabel,
    reservation ? `reserva de ${reservation.name} a las ${reservation.time}, ${reservation.partySize} personas` : null,
    table.guests ? `${table.guests} comensales` : null,
    amount,
    elapsed ? `abierta hace ${elapsed}` : null,
    kitchenShort ? `en cocina hace ${kitchenShort}` : null,
    server ? `atiende ${table.serverName}` : null,
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
          {openedShort && (
            <span className="mesa-info mesa-times">
              <span title="Abierta hace">⏱ {openedShort}</span>
              {kitchenShort && <span className={`mesa-kitchen${kitchenClass}`} title="En cocina hace">🍳 {kitchenShort}</span>}
            </span>
          )}
        </>
      ) : reservation ? (
        <>
          <span className="mesa-info mesa-res-time">{reservation.time}</span>
          <span className="mesa-info mesa-res-name">{reservation.name.split(" ")[0]} · {reservation.partySize}p</span>
        </>
      ) : (
        <span className="mesa-info">{statusLabel}</span>
      )}
      {table.guests ? <span className="mesa-guests" aria-hidden>👥 {table.guests}</span> : null}
      {server && <span className="mesa-server" aria-hidden>{server}</span>}
    </button>
  )
}
