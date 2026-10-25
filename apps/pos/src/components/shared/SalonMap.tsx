import { useMemo, useState, type ReactNode } from "react"
import type { Table, TableStatus } from "@takeasygo/types"
import { LayoutGrid, CircleCheck, Users, BellRing, CalendarClock, Settings } from "lucide-react"
import { MesaCard, MESA_STATUS_LABEL, type MesaVariant } from "./MesaCard"
import { useNow } from "../../hooks/useNow"
import type { TableActivity } from "../../hooks/useTableActivity"

// ============================================================================
// Mapa del salón — Counter y Mozo (mismo componente, Operational Workspace §12)
// ============================================================================
// Obs. UX 25/10:
//   · Un solo header: los SECTORES (Salón principal, Terraza, Vereda… los que
//     estén configurados) y los ESTADOS (Libre, Ocupada, Atención, Reservada)
//     viven en el header como pestañas e íconos con contador, sin renglones
//     propios en el workspace ni textos que roben espacio.
//   · Cada sector es una VISTA que ocupa el 100 % del workspace, con la misma
//     información (estado, tiempo, monto). Ya no se apilan todos juntos.
// El estado (sector + filtro) lo tiene useSalonView() en la vista dueña, que
// pone <SalonHeaderBar> en el header y <SalonMap> en el workspace.
// ============================================================================

type Filter = "all" | TableStatus

const DEFAULT_SECTION = "Sala Principal"

const FILTERS: { id: Filter; label: string; icon: typeof Users; tone?: string }[] = [
  { id: "all", label: "Todas", icon: LayoutGrid },
  { id: "free", label: MESA_STATUS_LABEL.free, icon: CircleCheck, tone: "libre" },
  { id: "occupied", label: MESA_STATUS_LABEL.occupied, icon: Users, tone: "ocupada" },
  { id: "needs_attention", label: MESA_STATUS_LABEL.needs_attention, icon: BellRing, tone: "atencion" },
  { id: "reserved", label: MESA_STATUS_LABEL.reserved, icon: CalendarClock, tone: "reservada" },
]

const sectionOf = (t: Table) => t.section || DEFAULT_SECTION

export interface SalonView {
  sectors: string[]
  sector: string | null
  setSector: (s: string) => void
  filter: Filter
  setFilter: (f: Filter) => void
  /** Mesas del sector activo (sin filtrar por estado) — base de los contadores. */
  sectorTables: Table[]
}

/** Estado del mapa: sector activo + filtro por estado. */
export function useSalonView(tables: Table[]): SalonView {
  const [picked, setSector] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")

  const sectors = useMemo(() => {
    const seen: string[] = []
    for (const t of [...tables].sort((a, b) => a.number - b.number)) {
      const s = sectionOf(t)
      if (!seen.includes(s)) seen.push(s)
    }
    return seen
  }, [tables])

  // Sector elegido que dejó de existir (se reconfiguró) ⇒ el primero.
  const sector = picked && sectors.includes(picked) ? picked : sectors[0] ?? null
  const sectorTables = useMemo(() => tables.filter((t) => sectionOf(t) === sector), [tables, sector])

  // Memo: la vista dueña lo usa como dependencia al poner la barra en el header.
  return useMemo(() => ({ sectors, sector, setSector, filter, setFilter, sectorTables }), [sectors, sector, filter, sectorTables])
}

interface SalonHeaderBarProps {
  view: SalonView
  /** Presente ⇒ ícono «Configurar salón» (solo caja/encargado). */
  onConfigure?: () => void
  /** Acciones extra del contexto (p. ej. «Cocina» del mozo). */
  extra?: ReactNode
}

/** Sectores (pestañas) + estados (íconos con contador) para el header. */
export function SalonHeaderBar({ view, onConfigure, extra }: SalonHeaderBarProps) {
  const { sectors, sector, setSector, filter, setFilter, sectorTables } = view
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sectorTables.length }
    for (const t of sectorTables) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [sectorTables])

  return (
    <div className="salon-bar">
      {sectors.length > 1 && (
        <nav className="salon-sectors" aria-label="Sectores del salón">
          {sectors.map((s) => (
            <button
              key={s}
              type="button"
              className={`view-tab salon-sector-tab${s === sector ? " active" : ""}`}
              aria-current={s === sector ? "page" : undefined}
              onClick={() => setSector(s)}
            >
              <span className="view-tab-label">{s}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="salon-status" role="group" aria-label="Filtrar mesas por estado">
        {FILTERS.map((f) => {
          const Icon = f.icon
          const n = counts[f.id] ?? 0
          return (
            <button
              key={f.id}
              type="button"
              className={`salon-status-btn${f.tone ? ` salon-status-btn--${f.tone}` : ""}${filter === f.id ? " active" : ""}`}
              aria-pressed={filter === f.id}
              aria-label={`${f.label}: ${n}`}
              title={`${f.label} (${n})`}
              onClick={() => setFilter(filter === f.id && f.id !== "all" ? "all" : f.id)}
            >
              <Icon size={18} aria-hidden />
              <span className="salon-status-count">{n}</span>
            </button>
          )
        })}
      </div>
      {onConfigure && (
        <button type="button" className="salon-status-btn" onClick={onConfigure} title="Configurar salón: mesas, capacidad y sectores" aria-label="Configurar salón">
          <Settings size={18} aria-hidden />
        </button>
      )}
      {extra}
    </div>
  )
}

interface SalonMapProps {
  view: SalonView
  variant: MesaVariant
  selectedTableId?: string | null
  activity: Map<string, TableActivity>
  onSelectTable: (tableId: string) => void
  /** Obs. 24/10: reserva por mesa reservada (useReservations().byTable). */
  reservations?: Map<string, { time: string; name: string; partySize: number }>
}

/** Mesas del sector activo, a todo el workspace. */
export function SalonMap({ view, variant, selectedTableId, activity, onSelectTable, reservations }: SalonMapProps) {
  const now = useNow()
  const { sector, filter, sectorTables } = view
  const visible = useMemo(
    () => (filter === "all" ? sectorTables : sectorTables.filter((t) => t.status === filter)).sort((a, b) => a.number - b.number),
    [sectorTables, filter]
  )

  return (
    <div className="salon-map">
      <div className="salon-map-container" key={sector ?? ""} /* al cambiar de sector el scroll vuelve arriba */ aria-label={sector ?? "Salón"} role="region">
        {visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-text">
              {filter === "all" ? "No hay mesas en este sector" : `No hay mesas ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}`}
            </span>
          </div>
        ) : (
          <div className="sector-grid salon-sector-grid">
            {visible.map((table) => (
              <MesaCard
                key={table.id}
                table={table}
                variant={variant}
                onClick={onSelectTable}
                isSelected={selectedTableId === table.id}
                activity={activity.get(table.id)}
                now={now}
                reservation={reservations?.get(table.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
