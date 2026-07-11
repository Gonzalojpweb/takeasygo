import { useMemo } from "react"
import type { Table } from "@takeasygo/types"
import { MesaCard } from "../shared/MesaCard"

interface WaiterSectorGridProps {
  tables: Table[]
  onSelectTable: (tableId: string) => void
}

export function WaiterSectorGrid({ tables, onSelectTable }: WaiterSectorGridProps) {
  const sectors = useMemo(() => {
    const map: Record<string, Table[]> = {}
    for (const t of tables) {
      const section = t.section || "Sala Principal"
      if (!map[section]) map[section] = []
      map[section].push(t)
    }
    return map
  }, [tables])

  if (tables.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🪑</span>
        <span className="empty-state-text">No hay mesas configuradas</span>
      </div>
    )
  }

  return (
    <>
      {Object.entries(sectors).map(([section, sectionTables]) => (
        <div key={section} className="sector">
          <div className="sector-header">{section}</div>
          <div className="sector-grid">
            {sectionTables.map((table) => (
              <MesaCard
                key={table.id}
                table={table}
                variant="waiter"
                onClick={onSelectTable}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
