import { useMemo, useState } from "react"
import type { Table, TableStatus } from "@takeasygo/types"
import { MesaCard, MESA_STATUS_LABEL, type MesaVariant } from "./MesaCard"
import { useNow } from "../../hooks/useNow"
import type { TableActivity } from "../../hooks/useTableActivity"

// ============================================================================
// SalonMap — escena "Explorar salón" (Scene Architecture §13)
// ============================================================================
// Mismo componente para Counter y Salón (Waiter): el rol cambia la
// experiencia, nunca la arquitectura (Workspace Model §12).
// · Filtros por estado con conteo (POS/CONTEXTOS/PLAN_DE_ACTUALIZACION §3.1).
// · Sectores agrupados; pie con totales por estado.
// ============================================================================

type Filter = "all" | TableStatus

const FILTERS: { id: Filter; label: string; dot?: string }[] = [
  { id: "all", label: "Todas" },
  { id: "free", label: MESA_STATUS_LABEL.free, dot: "var(--mesa-libre-solid)" },
  { id: "occupied", label: MESA_STATUS_LABEL.occupied, dot: "var(--mesa-ocupada-solid)" },
  { id: "needs_attention", label: MESA_STATUS_LABEL.needs_attention, dot: "var(--mesa-atencion-solid)" },
  { id: "reserved", label: MESA_STATUS_LABEL.reserved, dot: "var(--mesa-reservada-solid)" },
]

interface SalonMapProps {
  tables: Table[]
  variant: MesaVariant
  selectedTableId?: string | null
  activity: Map<string, TableActivity>
  onSelectTable: (tableId: string) => void
}

export function SalonMap({ tables, variant, selectedTableId, activity, onSelectTable }: SalonMapProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const now = useNow()

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tables.length }
    for (const t of tables) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [tables])

  const sectors = useMemo(() => {
    const visible = filter === "all" ? tables : tables.filter((t) => t.status === filter)
    const map = new Map<string, Table[]>()
    for (const t of [...visible].sort((a, b) => a.number - b.number)) {
      const section = t.section || "Sala Principal"
      map.set(section, [...(map.get(section) ?? []), t])
    }
    return [...map.entries()]
  }, [tables, filter])

  return (
    <div className="salon-map">
      <div className="salon-filters" role="group" aria-label="Filtrar mesas por estado">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`salon-filter${filter === f.id ? " active" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.dot && <span className="salon-stat-dot" style={{ background: f.dot }} aria-hidden />}
            {f.label}
            <span className="salon-filter-count">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="salon-map-container">
        {sectors.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-text">No hay mesas {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}</span>
          </div>
        ) : (
          sectors.map(([section, sectionTables]) => (
            <section key={section} className="sector" aria-label={section}>
              <div className="sector-header">{section}</div>
              <div className="sector-grid">
                {sectionTables.map((table) => (
                  <MesaCard
                    key={table.id}
                    table={table}
                    variant={variant}
                    onClick={onSelectTable}
                    isSelected={selectedTableId === table.id}
                    activity={activity.get(table.id)}
                    now={now}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="salon-footer">
        <div className="salon-footer-stats">
          {FILTERS.slice(1).map((f) => (
            <div key={f.id} className="salon-stat">
              <div className="salon-stat-count">
                <span className="salon-stat-dot" style={{ background: f.dot }} aria-hidden />
                {counts[f.id] ?? 0}
              </div>
              <div className="salon-stat-label">{f.label}</div>
            </div>
          ))}
        </div>
        <div className="salon-total">
          <div className="salon-total-label">Total mesas</div>
          <div className="salon-total-count">{tables.length}</div>
        </div>
      </div>
    </div>
  )
}
