import { useCallback, useEffect, useMemo, useState } from "react"
import { isApproverRole } from "@takeasygo/business/browser"
import { useTables } from "../../hooks/useTables"
import { useAuth } from "../../hooks/useAuth"
import type { Table } from "@takeasygo/types"
import {
  createSector,
  deleteSector,
  loadSalon,
  setReservationIntake,
  updateSector,
  type PosReservationIntake,
  type PosSector,
  type SectorInput,
} from "../../services/reservations"
import { PosApiError } from "../../services/pos-api"
import { currentPosUser } from "../../services/offline/offline-auth"
import { ConfirmDialog } from "../shared/ConfirmDialog"

// ============================================================================
// Configurar el salón (obs. 24/10; espacios desde el POS 14/11/2026)
// ============================================================================
// Los SECTORES son los espacios de la sede (Location.spaces): la misma lista
// que el panel (Configuración › Salón y espacios). Desde el 14/11/2026:
//   · administrador y encargado los crean, renombran, habilitan y borran acá
//     (un local sin reservas también necesita dividir el salón);
//   · si el comercio toma reservas: abrir/cerrar la recepción de reservas de
//     la sede, marcar qué espacios aceptan reservas y «Sin reservas hoy» en un
//     espacio, sin salir del POS en un finde lleno.
// Las mesas se ubican en los sectores como siempre. El server decide permisos
// (config.manage) y guardas (no se borra un espacio con mesas o reservas).
// ============================================================================

interface SalonSetupProps {
  onDone: () => void
}

const FALLBACK_SECTOR = "Sala principal"
const DEFAULT_TABLES = [2, 2, 4, 4, 6, 6]

/** Fecha local del equipo (AAAA-MM-DD). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function SalonSetup({ onDone }: SalonSetupProps) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { tables, loading, openTable, updateTableSetup } = useTables()
  const [sectors, setSectors] = useState<PosSector[] | null>(null)
  const [intake, setIntake] = useState<PosReservationIntake>({ available: false, enabled: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [toDelete, setToDelete] = useState<PosSector | null>(null)
  const canManage = isApproverRole(currentPosUser().role)

  const reload = useCallback(async () => {
    if (!tenantId) return
    try {
      const res = await loadSalon(tenantId)
      setSectors(res.sectors)
      setIntake(res.reservations)
    } catch {
      setSectors((prev) => prev ?? [])
    }
  }, [tenantId])

  useEffect(() => { void reload() }, [reload])

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

  const run = async (op: () => Promise<unknown>, refresh = false) => {
    setBusy(true)
    setError(null)
    try {
      await op()
      if (refresh) await reload()
      return true
    } catch (err) {
      setError(err instanceof PosApiError ? err.message : "No se pudo guardar. Reintentá.")
      if (refresh) await reload()
      return false
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

  const edit = (id: string, input: SectorInput) => tenantId && run(() => updateSector(tenantId, id, input), true)

  const addSector = async () => {
    const name = newName.trim()
    if (!tenantId || !name) return
    if (await run(() => createSector(tenantId, { name }), true)) setNewName("")
  }

  if (loading || sectors === null) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Cargando salón...
      </div>
    )
  }

  const today = localToday()

  return (
    <div className="setup">
      <div className="setup-head">
        <div>
          <div className="workspace-title">Configurar salón</div>
          <div className="text-sm text-muted">
            {sectors.length > 0
              ? "Ubicá cada mesa en su sector. Los sectores son los mismos del panel (Configuración › Salón y espacios)."
              : canManage
                ? "Dividí el salón en sectores (Salón, Terraza, Barra…). Mientras no haya, las mesas van a «Sala principal»."
                : "Todavía no hay sectores: las mesas van a «Sala principal». Los crea un encargado o el administrador."}
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

      {canManage && intake.available && (
        <section className={`salon-intake${intake.enabled ? " is-on" : ""}`} aria-label="Reservas online">
          <div>
            <strong>{intake.enabled ? "Recibiendo reservas online" : "Reservas online pausadas"}</strong>
            <div className="text-sm text-muted">
              {intake.enabled ? "Los clientes pueden reservar en esta sede." : "Nadie puede reservar online. Las reservas ya hechas siguen igual."}
            </div>
          </div>
          <button
            type="button"
            className={`btn ${intake.enabled ? "btn-secondary" : "btn-primary"}`}
            disabled={busy}
            onClick={() => tenantId && run(async () => setIntake({ ...intake, enabled: await setReservationIntake(tenantId, !intake.enabled) }))}
          >
            {intake.enabled ? "Pausar reservas" : "Abrir reservas"}
          </button>
        </section>
      )}

      {canManage && (
        <section className="salon-spaces" aria-label="Sectores">
          <div className="setup-sector-head">
            <span className="setup-sector-name">Sectores</span>
            <span className="text-sm text-muted">Se guardan al instante</span>
          </div>
          {sectors.map((s) => (
            <SectorRow
              key={`${s.id}:${s.name}:${s.capacity}`}
              sector={s}
              busy={busy}
              reservations={intake.available}
              today={today}
              seats={tables.filter((t) => t.spaceId === s.id).reduce((sum, t) => sum + t.capacity, 0)}
              onEdit={(input) => edit(s.id, input)}
              onDelete={() => setToDelete(s)}
            />
          ))}
          <div className="salon-space-add">
            <input
              className="search-input"
              placeholder="Nuevo sector (Terraza, Barra…)"
              maxLength={60}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addSector() }}
              aria-label="Nombre del sector nuevo"
            />
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={addSector}>
              Agregar sector
            </button>
          </div>
        </section>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Borrar sector"
          message={`¿Borrar «${toDelete.name}»? Solo se puede si no tiene mesas ni reservas por venir; si no, deshabilitalo.`}
          confirmLabel="Borrar"
          busy={busy}
          onCancel={() => setToDelete(null)}
          onConfirm={() => { const target = toDelete; setToDelete(null); if (tenantId) void run(() => deleteSector(tenantId, target.id), true) }}
        />
      )}

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
                  onSector={(spaceId) => run(() => updateTableSetup(t.id, { spaceId }), true)}
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

function SectorRow({ sector, busy, reservations, today, seats, onEdit, onDelete }: {
  sector: PosSector
  busy: boolean
  reservations: boolean
  today: string
  /** Lugares de las mesas del sector: capacidad sugerida al aceptar reservas. */
  seats: number
  onEdit: (input: SectorInput) => void
  onDelete: () => void
}) {
  const blockedToday = (sector.blockedDates ?? []).includes(today)
  const reservable = sector.reservable !== false
  return (
    <div className={`salon-space${sector.enabled ? "" : " is-off"}`}>
      <input
        className="search-input salon-space-name"
        defaultValue={sector.name}
        maxLength={60}
        disabled={busy}
        aria-label={`Nombre de ${sector.name}`}
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== sector.name) onEdit({ name: v }) }}
      />
      <label className="salon-space-toggle">
        <input type="checkbox" checked={sector.enabled} disabled={busy} onChange={(e) => onEdit({ enabled: e.target.checked })} />
        Habilitado
      </label>
      {reservations && (
        <>
          <label className="salon-space-toggle">
            <input
              type="checkbox"
              checked={reservable}
              disabled={busy}
              onChange={(e) => {
                // Sin capacidad no se puede reservar: se toma la suma de lugares
                // de sus mesas (editable al lado).
                if (e.target.checked && sector.capacity < 1) {
                  onEdit({ reservable: true, capacity: Math.max(1, seats) })
                  return
                }
                onEdit({ reservable: e.target.checked })
              }}
            />
            Acepta reservas
          </label>
          {reservable && (
            <label className="salon-space-toggle" title="Comensales: aforo para las reservas online">
              Capacidad
              <input
                type="number"
                min={1}
                className="search-input salon-space-capacity"
                defaultValue={sector.capacity}
                disabled={busy}
                onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v !== sector.capacity) onEdit({ capacity: v }) }}
              />
            </label>
          )}
          {reservable && (
            <button
              type="button"
              className={`btn btn-sm ${blockedToday ? "btn-primary" : "btn-secondary"}`}
              disabled={busy || !sector.enabled}
              onClick={() =>
                onEdit({ blockedDates: blockedToday ? (sector.blockedDates ?? []).filter((d) => d !== today) : [...(sector.blockedDates ?? []), today] })
              }
              title="Pausa las reservas online de este sector solo por hoy"
            >
              {blockedToday ? "Reanudar reservas hoy" : "Sin reservas hoy"}
            </button>
          )}
        </>
      )}
      <span className="text-sm text-muted salon-space-meta">
        {sector.tables ?? 0} mesa{(sector.tables ?? 0) === 1 ? "" : "s"}
        {reservations && (sector.upcomingReservations ?? 0) > 0 ? ` · ${sector.upcomingReservations} reservas por venir` : ""}
      </span>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onDelete} aria-label={`Borrar ${sector.name}`}>
        Borrar
      </button>
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
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.enabled ? "" : " (deshabilitado)"}</option>)}
        </select>
      )}
    </div>
  )
}
