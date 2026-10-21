import type { Table } from "@takeasygo/types"
import { SalonMap } from "../shared/SalonMap"
import type { TableActivity } from "../../hooks/useTableActivity"

// El Salón del mozo usa el MISMO mapa que el Counter (SalonMap): el rol cambia
// la experiencia, nunca la arquitectura (Operational Workspace Model §12).

interface WaiterSectorGridProps {
  tables: Table[]
  activity: Map<string, TableActivity>
  selectedTableId?: string | null
  onSelectTable: (tableId: string) => void
}

export function WaiterSectorGrid({ tables, activity, selectedTableId, onSelectTable }: WaiterSectorGridProps) {
  if (tables.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-text">No hay mesas configuradas</span>
        <span className="text-sm text-muted">Configurá el salón desde el Counter.</span>
      </div>
    )
  }
  return (
    <SalonMap
      tables={tables}
      variant="waiter"
      activity={activity}
      selectedTableId={selectedTableId}
      onSelectTable={onSelectTable}
    />
  )
}
