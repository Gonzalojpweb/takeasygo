'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, Loader2, CalendarOff, X, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTodayStrInTimezone } from '@/lib/restaurant-time'

// ============================================================================
// Salón y espacios de una sede (14/11/2026)
// ============================================================================
// Los espacios (Salón, Terraza, Barra…) son de la SEDE: el POS ubica las mesas
// en ellos y, si el comercio toma reservas, los marcados «Acepta reservas» se
// ofrecen al reservar (con su capacidad como aforo). Cada cambio se guarda al
// instante. También se editan desde el POS (Configuración › Salón).
// ============================================================================

interface Space {
  id: string
  name: string
  capacity: number
  enabled: boolean
  reservable: boolean
  blockedDates: string[]
  order: number
  tables: number
  upcomingReservations: number
}

interface Props {
  tenantSlug: string
  locationId: string
  locationName: string
  /** El comercio toma reservas: se muestran «Acepta reservas», capacidad y fechas. */
  reservationsAvailable: boolean
}

const inputCls = 'h-8 rounded-lg border border-border/60 bg-background px-2 text-sm outline-none focus:border-primary'

export function LocationSpacesManager({ tenantSlug, locationId, locationName, reservationsAvailable }: Props) {
  const base = `/api/${tenantSlug}/locations/${locationId}/spaces`
  const [spaces, setSpaces] = useState<Space[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error ?? 'No se pudieron leer los espacios')
      setSpaces([])
      return
    }
    setSpaces(data.spaces as Space[])
  }, [base])

  useEffect(() => { void load() }, [load])

  const call = async (key: string, url: string, method: string, body?: unknown, ok?: string) => {
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      if (ok) toast.success(ok)
      await load()
      return true
    } catch (err) {
      toast.error((err as Error).message)
      await load()
      return false
    } finally {
      setBusy(null)
    }
  }

  const patch = (s: Space, change: Partial<Space>, ok?: string) => call(s.id, `${base}/${s.id}`, 'PATCH', change, ok)

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    if (await call('new', base, 'POST', { name }, `Espacio «${name}» creado`)) setNewName('')
  }

  const move = async (index: number, dir: -1 | 1) => {
    if (!spaces) return
    const a = spaces[index]
    const b = spaces[index + dir]
    if (!a || !b) return
    setBusy(a.id)
    // Reordena todo para evitar órdenes repetidos heredados.
    const next = [...spaces]
    next[index] = b
    next[index + dir] = a
    for (const [i, s] of next.entries()) {
      if (s.order !== i) await fetch(`${base}/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: i }) })
    }
    setBusy(null)
    await load()
  }

  const today = getTodayStrInTimezone()

  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-black"><LayoutGrid size={15} /> {locationName}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Partes del local donde están las mesas del POS (Salón, Terraza, Barra…).
            {reservationsAvailable
              ? ' Los que «Aceptan reservas» se ofrecen al reservar, con su capacidad como aforo.'
              : ' Este comercio no toma reservas: solo ordenan el salón del POS.'}
          </p>
        </div>
      </div>

      {spaces === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
      ) : spaces.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Sin espacios: el POS muestra todo en «Sala principal».</p>
      ) : (
        spaces.map((s, i) => (
          <div key={s.id} className={cn('space-y-2 rounded-xl border border-border/60 bg-white p-3 shadow-sm', !s.enabled && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={`${s.id}:${s.name}`}
                defaultValue={s.name}
                aria-label="Nombre del espacio"
                className={cn(inputCls, 'min-w-0 flex-1 font-bold')}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) void patch(s, { name: v }, 'Nombre guardado') }}
              />
              {reservationsAvailable && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Comensales: aforo para las reservas">
                  Capacidad
                  <input
                    key={`${s.id}:${s.capacity}`}
                    type="number"
                    min={0}
                    defaultValue={s.capacity}
                    className={cn(inputCls, 'w-16 text-center')}
                    onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v !== s.capacity) void patch(s, { capacity: v }) }}
                  />
                </label>
              )}
              <button type="button" disabled={i === 0 || busy !== null} onClick={() => move(i, -1)} aria-label="Subir" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ChevronDown size={14} className="rotate-180" />
              </button>
              <button type="button" disabled={i === spaces.length - 1 || busy !== null} onClick={() => move(i, 1)} aria-label="Bajar" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => { if (window.confirm(`¿Borrar «${s.name}»?`)) void call(s.id, `${base}/${s.id}`, 'DELETE', undefined, 'Espacio borrado') }}
                aria-label={`Borrar ${s.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <Toggle checked={s.enabled} disabled={busy !== null} onChange={(v) => patch(s, { enabled: v }, v ? 'Espacio habilitado' : 'Espacio deshabilitado')} label="Habilitado" />
              {reservationsAvailable && (
                <Toggle checked={s.reservable} disabled={busy !== null} onChange={(v) => patch(s, { reservable: v }, v ? 'Ahora acepta reservas' : 'Ya no acepta reservas nuevas')} label="Acepta reservas" />
              )}
              <span className="text-muted-foreground">{s.tables} mesa{s.tables === 1 ? '' : 's'}</span>
              {reservationsAvailable && s.upcomingReservations > 0 && (
                <span className="text-amber-700">{s.upcomingReservations} reserva{s.upcomingReservations === 1 ? '' : 's'} por venir</span>
              )}
            </div>

            {reservationsAvailable && s.reservable && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground"><CalendarOff size={11} /> Sin reservas</span>
                {s.blockedDates.filter((d) => d >= today).map((d) => (
                  <span key={d} className="flex items-center gap-1 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                    {d}
                    <button type="button" aria-label={`Liberar ${d}`} onClick={() => patch(s, { blockedDates: s.blockedDates.filter((x) => x !== d) })}><X size={10} /></button>
                  </span>
                ))}
                <input type="date" min={today} value={newDate[s.id] ?? ''} onChange={(e) => setNewDate((p) => ({ ...p, [s.id]: e.target.value }))} className={cn(inputCls, 'h-7 text-[11px]')} />
                <button
                  type="button"
                  disabled={!newDate[s.id] || busy !== null}
                  onClick={async () => { const d = newDate[s.id]; if (d && (await patch(s, { blockedDates: [...s.blockedDates, d] }, `Sin reservas el ${d}`))) setNewDate((p) => ({ ...p, [s.id]: '' })) }}
                  className="h-7 rounded-lg bg-muted px-2 text-[10px] font-black text-muted-foreground disabled:opacity-40"
                >
                  Bloquear fecha
                </button>
              </div>
            )}
          </div>
        ))
      )}

      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} placeholder="Nuevo espacio (Terraza, Barra…)" maxLength={60} className={cn(inputCls, 'flex-1')} />
        <button type="button" onClick={add} disabled={!newName.trim() || busy !== null} className="flex items-center gap-1 rounded-lg bg-primary px-3 text-xs font-black text-white disabled:opacity-40">
          {busy === 'new' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Agregar
        </button>
      </div>
      {reservationsAvailable && (
        <p className="text-[10px] text-muted-foreground">Un espacio nuevo no acepta reservas hasta que lo actives y le cargues capacidad.</p>
      )}
    </div>
  )
}

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 font-bold">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-muted-foreground/30')}
      >
        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      {label}
    </label>
  )
}
