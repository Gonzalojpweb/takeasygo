import type { KeyboardEvent, PointerEvent } from "react"
import type { Table } from "@takeasygo/types"
import type { PlacedTable } from "@takeasygo/business/browser"
import { BellRing, CalendarClock, ChefHat, Clock, Receipt, User } from "lucide-react"
import { formatCurrency } from "../../utils/format"
import { MESA_STATUS_LABEL, type MesaVariant } from "./MesaCard"
import {
  formatElapsed,
  formatElapsedShort,
  KITCHEN_LATE_MIN,
  KITCHEN_WARN_MIN,
  type TableActivity,
} from "../../hooks/useTableActivity"

// ============================================================================
// FloorTable — una mesa en el plano (obs. UX 30/10)
// ============================================================================
// Ficha con la forma real de la mesa y el color del estado (texto + ícono,
// nunca solo color). Muestra: número, comensales, monto y UN tiempo:
//   · si la comanda que espera en cocina salió al abrir la mesa, ese es el
//     único tiempo (antes se veía «⏱ 12m 🍳 12m», el mismo número dos veces);
//   · si es de una ronda posterior, «abierta» y «en cocina» por separado.
// El tiempo en cocina toma el semáforo: ámbar desde 20 min, rojo desde 35.
// ============================================================================

const STATUS_CLASS: Record<string, string> = {
  free: "libre",
  occupied: "ocupada",
  needs_attention: "atencion",
  reserved: "reservada",
  closed: "cerrada",
}

/** Diferencia mínima para mostrar «en cocina» aparte de «abierta». */
const SAME_TIME_MS = 60_000

export interface FloorTableProps {
  table: Table
  placed: PlacedTable
  variant: MesaVariant
  activity?: TableActivity
  reservation?: { time: string; name: string; partySize: number }
  now: number
  showServer: boolean
  selected: boolean
  dimmed: boolean
  editing: boolean
  onClick: () => void
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}

export function FloorTable({
  table,
  placed,
  variant,
  activity,
  reservation,
  now,
  showServer,
  selected,
  dimmed,
  editing,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: FloorTableProps) {
  const { layout, w, h } = placed
  const status = STATUS_CLASS[table.status] ?? "libre"
  const askingBill = Boolean(table.needsBill) && table.status === "occupied"
  const statusLabel = askingBill && variant === "waiter" ? "Pide cuenta" : (MESA_STATUS_LABEL[table.status] ?? "Libre")

  const amount = activity && activity.total > 0 ? formatCurrency(activity.total) : null
  const opened = activity?.openedAt ?? null
  const kitchen = activity?.kitchenSince ?? null
  const kitchenMin = kitchen ? Math.floor((now - kitchen.getTime()) / 60_000) : null
  const tone = kitchenMin === null ? "" : kitchenMin >= KITCHEN_LATE_MIN ? " late" : kitchenMin >= KITCHEN_WARN_MIN ? " warn" : ""
  const kitchenSeparate = Boolean(opened && kitchen && Math.abs(kitchen.getTime() - opened.getTime()) >= SAME_TIME_MS)
  const people = table.status === "free" ? table.capacity : (table.guests ?? reservation?.partySize ?? table.capacity)
  const server = showServer && table.serverName ? table.serverName.split(" ")[0] : null

  const ariaLabel = [
    `Mesa ${table.number}`,
    statusLabel,
    table.status === "free" ? `capacidad ${table.capacity}` : table.guests ? `${table.guests} comensales` : null,
    reservation ? `reserva de ${reservation.name} a las ${reservation.time}, ${reservation.partySize} personas` : null,
    amount,
    opened ? `abierta hace ${formatElapsed(opened, now)}` : null,
    kitchen ? `en cocina hace ${formatElapsed(kitchen, now)}` : null,
    server ? `atiende ${table.serverName}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <button
      type="button"
      className={`ft ft--${status} ft-shape--${layout.shape}${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${editing ? " is-editing" : ""}${askingBill ? " is-bill" : ""}`}
      style={{ left: layout.x, top: layout.y, width: w, height: h, ["--ft-num" as string]: `${Math.round(Math.min(w, h) * 0.3)}px` }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      aria-label={ariaLabel}
    >
      <span className="ft-shape" aria-hidden><i className="ft-face" /></span>
      <span className="ft-txt" aria-hidden>
        <span className="ft-num">{table.number}</span>
        <span className="ft-line"><User size={12} strokeWidth={2.6} />{people}</span>
        {amount && <span className="ft-line ft-amount">{amount}</span>}
        {opened && !kitchenSeparate && (
          <span className={`ft-line ft-time${tone}`}>
            {kitchen ? <ChefHat size={12} strokeWidth={2.4} /> : <Clock size={12} strokeWidth={2.4} />}
            {formatElapsedShort(opened, now)}
          </span>
        )}
        {opened && kitchenSeparate && kitchen && (
          <span className="ft-line ft-times">
            <span><Clock size={11} strokeWidth={2.4} />{formatElapsedShort(opened, now)}</span>
            <span className={`ft-time${tone}`}><ChefHat size={11} strokeWidth={2.4} />{formatElapsedShort(kitchen, now)}</span>
          </span>
        )}
        {!opened && reservation && (
          <span className="ft-line"><CalendarClock size={12} strokeWidth={2.4} />{reservation.time}</span>
        )}
        {!opened && !reservation && table.status === "needs_attention" && (
          <span className="ft-line"><BellRing size={12} strokeWidth={2.4} className="ft-bell" />Atención</span>
        )}
      </span>
      {askingBill && <span className="ft-badge" aria-hidden><Receipt size={13} strokeWidth={2.4} /></span>}
      {server && <span className="ft-server" aria-hidden>{server}</span>}
    </button>
  )
}
