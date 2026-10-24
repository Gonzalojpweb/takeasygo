import { useMemo, useState } from "react"
import type { Table } from "@takeasygo/types"
import { Users, Clock, LayoutGrid, StickyNote } from "lucide-react"
import type { PosReservation, ReservationAction } from "../../services/reservations"

// ============================================================================
// Reservaciones del día en el POS (observación 24/10)
// ============================================================================
// Recepción del salón: quién llega, a qué hora, cuántos, a qué sector.
// Acciones sobre una reserva confirmada (caja/encargado):
//   · Reservar mesa → la mesa queda reservada en el mapa del salón.
//   · Sentar → la mesa (la reservada o la elegida) pasa a ocupada.
//   · No vino → libera la mesa.
// Las mesas sugeridas: libres, con lugar para el grupo, primero las del
// sector que eligió el cliente.
// ============================================================================

const STATUS_LABEL: Record<PosReservation["status"], string> = {
  pending_payment: "Seña pendiente",
  confirmed: "Confirmada",
  waitlist: "Lista de espera",
  seated: "En mesa",
  no_show: "No vino",
  cancelled: "Cancelada",
}

interface ReservationsViewProps {
  reservations: PosReservation[]
  tables: Table[]
  busyId: string | null
  /** Solo caja/encargado opera reservas (el server lo exige igual). */
  canManage: boolean
  onAction: (reservation: PosReservation, action: ReservationAction, tablePosId?: string) => void
  onOpenTable: (tableId: string) => void
}

function ReservationCard({ r, tables, busy, canManage, onAction, onOpenTable }: {
  r: PosReservation
  tables: Table[]
  busy: boolean
  canManage: boolean
  onAction: ReservationsViewProps["onAction"]
  onOpenTable: ReservationsViewProps["onOpenTable"]
}) {
  const candidates = useMemo(
    () =>
      tables
        .filter((t) => (t.status === "free" || t.id === r.tablePosId) && t.capacity >= r.partySize)
        .sort((a, b) =>
          Number(b.id === r.tablePosId) - Number(a.id === r.tablePosId) ||
          Number(b.spaceId === r.spaceId) - Number(a.spaceId === r.spaceId) ||
          a.number - b.number
        ),
    [tables, r.tablePosId, r.partySize, r.spaceId]
  )
  const [pick, setPick] = useState<string>(r.tablePosId ?? candidates[0]?.id ?? "")
  const assigned = tables.find((t) => t.id === r.tablePosId)
  const actionable = r.status === "confirmed" && canManage

  return (
    <article className={`res-card res-card--${r.status}${r.isNew ? " res-card--new" : ""}`} aria-label={`Reserva de ${r.name} a las ${r.time}`}>
      <div className="res-time"><Clock size={14} aria-hidden /> {r.time}</div>
      <div className="res-main">
        <div className="res-name">
          {r.name}
          {r.isNew && <span className="res-new">Nueva</span>}
        </div>
        <div className="res-meta">
          <span><Users size={13} aria-hidden /> {r.partySize}</span>
          {r.spaceName && <span><LayoutGrid size={13} aria-hidden /> {r.spaceName}</span>}
          <span className={`res-status res-status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
          {assigned && (
            <button type="button" className="res-table" onClick={() => onOpenTable(assigned.id)} title="Ver la mesa en el salón">
              Mesa {assigned.number}
            </button>
          )}
          {r.phoneTail && <span className="text-muted">Tel. …{r.phoneTail}</span>}
        </div>
        {r.notes && <div className="res-notes"><StickyNote size={12} aria-hidden /> {r.notes}</div>}
      </div>

      {actionable && (
        <div className="res-actions">
          <select
            className="search-input res-select"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label="Mesa para la reserva"
            disabled={busy}
          >
            {candidates.length === 0 && <option value="">Sin mesas libres con lugar</option>}
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                Mesa {t.number} · {t.capacity}p{t.section ? ` · ${t.section}` : ""}{t.id === r.tablePosId ? " (reservada)" : ""}
              </option>
            ))}
          </select>
          {pick && pick !== r.tablePosId && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onAction(r, "assign", pick)}>
              Reservar mesa
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={busy || (!pick && !r.tablePosId)} onClick={() => onAction(r, "seat", pick || undefined)}>
            Sentar
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onAction(r, "no_show")}>
            No vino
          </button>
          {r.tablePosId && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onAction(r, "unassign")}>
              Soltar mesa
            </button>
          )}
        </div>
      )}
    </article>
  )
}

export function ReservationsView({ reservations, tables, busyId, canManage, onAction, onOpenTable }: ReservationsViewProps) {
  const upcoming = reservations.filter((r) => ["confirmed", "pending_payment", "waitlist"].includes(r.status))
  const seated = reservations.filter((r) => r.status === "seated")
  const closed = reservations.filter((r) => r.status === "no_show" || r.status === "cancelled")

  if (reservations.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <span className="empty-state-icon">📅</span>
        <span className="empty-state-text">No hay reservas para hoy</span>
        <span className="text-sm text-muted">Las reservas que entren por la web aparecen acá y en el panel.</span>
      </div>
    )
  }

  return (
    <div className="res-view">
      <div className="res-summary" role="status">
        <span><strong>{upcoming.length}</strong> por llegar</span>
        <span><strong>{upcoming.reduce((s, r) => s + r.partySize, 0)}</strong> comensales esperados</span>
        <span><strong>{seated.length}</strong> en mesa</span>
        {closed.length > 0 && <span className="text-muted">{closed.length} no vinieron / canceladas</span>}
      </div>
      <div className="res-list">
        {[...upcoming, ...seated, ...closed].map((r) => (
          <ReservationCard
            key={r.id}
            r={r}
            tables={tables}
            busy={busyId === r.id}
            canManage={canManage}
            onAction={onAction}
            onOpenTable={onOpenTable}
          />
        ))}
      </div>
    </div>
  )
}
