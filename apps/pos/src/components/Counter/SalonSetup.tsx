import { useMemo, useState } from "react"
import { useTables } from "../../hooks/useTables"
import { useAuth } from "../../hooks/useAuth"
import type { Table } from "@takeasygo/types"

interface SalonSetupProps {
  onDone: () => void
}

const DEFAULT_TABLES = [
  { number: 1, capacity: 2 },
  { number: 2, capacity: 2 },
  { number: 3, capacity: 4 },
  { number: 4, capacity: 4 },
  { number: 5, capacity: 6 },
  { number: 6, capacity: 6 },
]

export function SalonSetup({ onDone }: SalonSetupProps) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { tables, loading, openTable } = useTables()
  const [creating, setCreating] = useState(false)

  const sectors = useMemo(() => {
    const map = new Map<string, Table[]>()
    for (const table of tables) {
      const section = table.section ?? "Sala Principal"
      if (!map.has(section)) map.set(section, [])
      map.get(section)!.push(table)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [tables])

  const handleCreateDefaults = async () => {
    if (!tenantId) return
    setCreating(true)
    try {
      for (const t of DEFAULT_TABLES) {
        await openTable(t.number, t.capacity, "Sala Principal")
      }
      onDone()
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Cargando mesas...
      </div>
    )
  }

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Mapa de mesas</div>
          <div className="workspace-subtitle">
            {tables.length > 0
              ? `${tables.length} mesas en ${sectors.length} sector${sectors.length !== 1 ? "es" : ""}`
              : "Configurá las mesas para empezar a operar"}
          </div>
        </div>
        {tables.length > 0 && (
          <div className="workspace-actions">
            <button className="btn btn-primary btn-sm" onClick={onDone}>
              Comenzar
            </button>
          </div>
        )}
      </div>

      {tables.length === 0 ? (
        <div className="empty-state" style={{ padding: "var(--sp-8)", gap: "var(--sp-3)" }}>
          <div className="empty-state-icon">🍽️</div>
          <div className="empty-state-text">No hay mesas configuradas</div>
          <div className="text-sm text-muted" style={{ marginTop: "var(--sp-1)", marginBottom: "var(--sp-3)" }}>
            Creá las mesas predeterminadas para empezar a operar
          </div>
          <button className="btn btn-primary" onClick={handleCreateDefaults} disabled={creating}>
            {creating ? "Creando..." : "Crear mesas predeterminadas"}
          </button>
        </div>
      ) : (
        <div className="salon-content" style={{ flex: 1, overflow: "auto" }}>
          {sectors.map(([section, sectionTables]) => (
            <div key={section} className="sector">
              <div className="sector-header">{section}</div>
              <div className="sector-grid">
                {sectionTables.map((table) => {
                  const statusClass =
                    table.status === "free" ? "libre"
                    : table.status === "occupied" ? "ocupada"
                    : "atencion"
                  const statusLabel =
                    table.status === "free" ? "Libre"
                    : table.status === "occupied" ? "Ocupada"
                    : table.status === "reserved" ? "Reservada"
                    : "Cerrada"
                  return (
                    <div key={table.id} className={`mesa ${statusClass}`}>
                      <span className="mesa-number">{table.number}</span>
                      <span className="mesa-info">{statusLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
