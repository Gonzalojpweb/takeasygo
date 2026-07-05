import { useState, useCallback } from "react"
import { openTable } from "../../services/table"
import { useAuth } from "../../hooks/useAuth"

interface Sector {
  name: string
  tables: { number: number; capacity: number }[]
}

const DEFAULT_SECTORS: Sector[] = [
  {
    name: "Sala Principal",
    tables: [
      { number: 1, capacity: 2 },
      { number: 2, capacity: 2 },
      { number: 3, capacity: 4 },
      { number: 4, capacity: 4 },
      { number: 5, capacity: 6 },
      { number: 6, capacity: 6 },
    ],
  },
]

interface SalonSetupProps {
  onDone: () => void
}

export function SalonSetup({ onDone }: SalonSetupProps) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const [sectors, setSectors] = useState<Sector[]>(DEFAULT_SECTORS)
  const [newSectorName, setNewSectorName] = useState("")
  const [creating, setCreating] = useState(false)

  const addSector = useCallback(() => {
    if (!newSectorName.trim()) return
    setSectors((prev) => [
      ...prev,
      { name: newSectorName.trim(), tables: [{ number: 1, capacity: 2 }] },
    ])
    setNewSectorName("")
  }, [newSectorName])

  const removeSector = useCallback((idx: number) => {
    setSectors((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addTable = useCallback((sectorIdx: number) => {
    setSectors((prev) =>
      prev.map((s, i) => {
        if (i !== sectorIdx) return s
        const maxNum = s.tables.reduce((max, t) => Math.max(max, t.number), 0)
        return {
          ...s,
          tables: [...s.tables, { number: maxNum + 1, capacity: 2 }],
        }
      })
    )
  }, [])

  const removeTable = useCallback((sectorIdx: number, tableIdx: number) => {
    setSectors((prev) =>
      prev.map((s, i) => {
        if (i !== sectorIdx) return s
        return { ...s, tables: s.tables.filter((_, ti) => ti !== tableIdx) }
      })
    )
  }, [])

  const updateCapacity = useCallback(
    (sectorIdx: number, tableIdx: number, capacity: number) => {
      setSectors((prev) =>
        prev.map((s, i) => {
          if (i !== sectorIdx) return s
          return {
            ...s,
            tables: s.tables.map((t, ti) =>
              ti === tableIdx ? { ...t, capacity } : t
            ),
          }
        })
      )
    },
    []
  )

  const handleCreate = useCallback(async () => {
    if (!tenantId) return
    setCreating(true)
    try {
      for (const sector of sectors) {
        for (const table of sector.tables) {
          await openTable(tenantId, table.number, table.capacity, sector.name)
        }
      }
      onDone()
    } catch (err) {
      console.error("[SalonSetup] Error creating tables:", err)
    } finally {
      setCreating(false)
    }
  }, [tenantId, sectors, onDone])

  const totalTables = sectors.reduce((sum, s) => sum + s.tables.length, 0)

  return (
    <div className="workspace" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Configurar salón</div>
          <div className="workspace-subtitle">
            Creá sectores y mesas para tu restaurante
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-6)" }}>
        {sectors.map((sector, si) => (
          <div key={si} style={{ marginBottom: "var(--sp-8)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "var(--sp-3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                <span className="sector-header" style={{ margin: 0 }}>
                  {sector.name}
                </span>
                <span className="status-badge pending">
                  {sector.tables.length} mesas
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => removeSector(si)}
                style={{ color: "var(--danger)" }}
              >
                Eliminar
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
              {sector.tables.map((table, ti) => (
                <div
                  key={ti}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-2)",
                    padding: "var(--sp-3) var(--sp-4)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 50 }}>
                    M{table.number}
                  </span>
                  <select
                    value={table.capacity}
                    onChange={(e) =>
                      updateCapacity(si, ti, parseInt(e.target.value))
                    }
                    style={{
                      padding: "4px 8px",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      fontSize: "var(--font-size-sm)",
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} lugares
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeTable(si, ti)}
                    style={{ color: "var(--danger)", padding: "2px 6px" }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => addTable(si)}
                style={{
                  border: "1px dashed var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                + Mesa
              </button>
            </div>
          </div>
        ))}

        {/* Add new sector */}
        <div
          style={{
            display: "flex",
            gap: "var(--sp-2)",
            marginTop: "var(--sp-4)",
          }}
        >
          <input
            type="text"
            placeholder="Nombre del nuevo sector..."
            value={newSectorName}
            onChange={(e) => setNewSectorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSector()}
            style={{
              flex: 1,
              padding: "var(--sp-3) var(--sp-4)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "var(--font-size-sm)",
              maxWidth: 300,
            }}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={addSector}
            disabled={!newSectorName.trim()}
          >
            + Sector
          </button>
        </div>
      </div>

      {/* Footer with summary + create button */}
      <div
        style={{
          padding: "var(--sp-4) var(--sp-6)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface)",
        }}
      >
        <span className="text-sm text-muted">
          {totalTables} mesa{totalTables !== 1 ? "s" : ""} en{" "}
          {sectors.length} sector{sectors.length !== 1 ? "es" : ""}
        </span>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={creating || totalTables === 0}
        >
          {creating ? "Creando..." : "Crear salón"}
        </button>
      </div>
    </div>
  )
}
