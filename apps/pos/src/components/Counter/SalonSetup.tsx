import { useEffect, useMemo, useState } from "react"
import { useTables } from "../../hooks/useTables"
import { useAuth } from "../../hooks/useAuth"
import type { Table } from "@takeasygo/types"
import { listSectors, type PosSector } from "../../services/reservations"
import { PosApiError } from "../../services/pos-api"

// ============================================================================
// Configurar el salón (observación 24/10: sectores centralizados)
// ============================================================================
// Los SECTORES son los espacios de la sede definidos en el SaaS
// (Configuración → Reservas → Espacios / sectores): los mismos que el cliente
// elige al reservar. Acá no se crean sectores; se ubican las mesas en ellos:
// agregar mesa a un sector, cambiar una mesa de sector, ajustar capacidad.
// Sede sin espacios ⇒ todo va a «Sala principal» hasta que se carguen.
// ============================================================================

interface SalonSetupProps {
  onDone: () => void
}

const FALLBACK_SECTOR = "Sala principal"
const DEFAULT_TABLES = [2, 2, 4, 4, 6, 6]

export function SalonSetup({ onDone }: SalonSetupProps) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { tables, loading, openTable, updateTableSetup } = useTables()
  const [sectors, setSectors] = useState<PosSector[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    listSectors(tenantId).then(setSectors).catch(() => setSectors([]))
  }, [tenantId])

  const groups = useMemo(() => {
    const list = sectors ?? []
    if (list.length === 0) return [{ id: null as string | null, name: FALLBACK_SECTOR, tables: [...tables].sort((a, b) => a.number - b.number) }]
    const known = new Set(list.map((s) => s.id))
    const out = list.map((s) => ({ id: s.id as string | null, name: s.name, tables: tables.filter((t) => t.spaceId === s.id).sort((a, b) => a.number - b.number) }))
    const orphans = tables.filter((t) => !t.spaceId || !known.has(t.spaceId))
    if (orphans.length) out.push({ id: null, name: "Sin sector asignado", tables: orphans.sort((a, b) => a.number - b.number) })
    return out
  }, [tables, sectors])

  const nextNumber = useMemo(() => tables.reduce((m, t) => Math.max(m, t.number), 0) + 1, [tables])

  const run = async (op: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await op()
    } catch (err) {
      setError(err instanceof PosApiError ? err.message : "No se pudo guardar. Reintentá.")
    } finally {
      setBusy(false)
    }
  }

  const addTable = (spaceId: string | null, capacity = 4) =>
    run(() => openTable(nextNumber, capacity, spaceId ? undefined : FALLBACK_SECTOR, spaceId ?? undefined))

  const createDefaults = () =>
    run(async () => {
      const first = sectors?.[0]?.id
      for (const [i, capacity] of DEFAULT_TABLES.entries()) {
        await openTable(nextNumber + i, capacity, first ? undefined : FALLBACK_SECTOR, first)
      }
    })

  if (loading || sectors === null) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Cargando salón...
      </div>
    )
  }

  return (
    <div className="setup">
      <div className="setup-head">
        <div>
          <div className="workspace-title">Configurar salón</div>
          <div className="text-sm text-muted">
            {sectors.length > 0
              ? "Los sectores vienen del panel (Configuración → Reservas → Espacios / sectores). Ubicá cada mesa en su sector."
              : "Todavía no hay sectores en el panel: las mesas van a «Sala principal». Cargalos en Configuración → Reservas → Espacios / sectores."}
          </div>
        </div>
        <div className="setup-head-actions">
          {tables.length === 0 && (
            <button className="btn btn-secondary" onClick={createDefaults} disabled={busy}>
              Crear 6 mesas de ejemplo
            </button>
          )}
          <button className="btn btn-primary" onClick={onDone} disabled={busy}>
            Listo
          </button>
        </div>
      </div>

      {error && <div className="setup-error" role="alert">{error}</div>}

      <div className="setup-sectors">
        {groups.map((g) => (
          <section key={g.id ?? g.name} className="setup-sector" aria-label={g.name}>
            <div className="setup-sector-head">
              <span className="setup-sector-name">{g.name}</span>
              <span className="text-sm text-muted">{g.tables.length} mesas · {g.tables.reduce((s, t) => s + t.capacity, 0)} lugares</span>
              {(g.id !== null || sectors.length === 0) && (
                <button className="btn btn-secondary btn-sm" onClick={() => addTable(g.id)} disabled={busy}>
                  + Mesa {nextNumber}
                </button>
              )}
            </div>
            <div className="setup-tables">
              {g.tables.map((t) => (
                <SetupTable key={t.id} table={t} sectors={sectors} busy={busy}
                  onCapacity={(capacity) => run(() => updateTableSetup(t.id, { capacity }))}
                  onSector={(spaceId) => run(() => updateTableSetup(t.id, { spaceId }))}
                />
              ))}
              {g.tables.length === 0 && <span className="text-sm text-muted">Sin mesas en este sector</span>}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function SetupTable({ table, sectors, busy, onCapacity, onSector }: {
  table: Table
  sectors: PosSector[]
  busy: boolean
  onCapacity: (capacity: number) => void
  onSector: (spaceId: string) => void
}) {
  return (
    <div className="setup-table">
      <span className="setup-table-number">Mesa {table.number}</span>
      <div className="setup-table-cap" role="group" aria-label={`Capacidad de la mesa ${table.number}`}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || table.capacity <= 1} onClick={() => onCapacity(table.capacity - 1)} aria-label="Un lugar menos">−</button>
        <span>{table.capacity}p</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onCapacity(table.capacity + 1)} aria-label="Un lugar más">+</button>
      </div>
      {sectors.length > 0 && (
        <select
          className="search-input setup-table-sector"
          value={table.spaceId ?? ""}
          disabled={busy}
          onChange={(e) => e.target.value && onSector(e.target.value)}
          aria-label={`Sector de la mesa ${table.number}`}
        >
          {!table.spaceId && <option value="">Elegí sector…</option>}
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </div>
  )
}
