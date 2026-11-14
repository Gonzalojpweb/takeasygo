import mongoose from 'mongoose'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Reservation from '@/models/Reservation'
import { DEFAULT_TIMEZONE, getTodayStrInTimezone, isValidCalendarDate } from '@/lib/restaurant-time'
import { ACTIVE_RESERVATION_STATUSES, MAX_SPACES_PER_LOCATION } from '@/lib/space-capacity'

// ============================================================================
// Espacios de la sede (Salón, Terraza, Barra…) — 14/11/2026
// ============================================================================
// Antes los espacios eran «de las reservas»: solo se editaban en
// Configuración › Reservas, una pestaña que no existe si el comercio no toma
// reservas. Un local con POS sin reservas no podía dividir su salón.
//
// Ahora son DE LA SEDE (Location.spaces, misma lista y mismos _id):
//   · el POS los usa siempre para ubicar las mesas;
//   · las reservas usan solo los que tienen `reservable` (los que ya
//     existían quedan reservables: nada cambia para quien reserva hoy).
//   · capacidad y días bloqueados importan solo para reservas: un espacio no
//     reservable puede tener capacidad 0.
// Se editan desde el panel (Configuración › Salón y espacios) y desde el POS
// (Configuración › Salón) con este MISMO servicio. Borrar un espacio con
// mesas o con reservas por venir no se permite (se deshabilita o se mueven
// antes las mesas).
// ============================================================================

const ID_RE = /^[0-9a-fA-F]{24}$/
export const MAX_SPACE_NAME = 60
export const MAX_SPACE_CAPACITY = 5000
export const MAX_BLOCKED_DATES = 366

export class SpaceError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message)
  }
}

export interface SpaceView {
  id: string
  name: string
  capacity: number
  enabled: boolean
  reservable: boolean
  blockedDates: string[]
  order: number
  /** Mesas del POS ubicadas en el espacio. */
  tables: number
  /** Reservas activas de hoy en adelante en el espacio. */
  upcomingReservations: number
}

interface SpaceDoc {
  _id: mongoose.Types.ObjectId
  name: string
  capacity?: number
  enabled?: boolean
  reservable?: boolean
  blockedDates?: string[]
  order?: number
}

interface LocationDoc {
  _id: mongoose.Types.ObjectId
  timezone?: string
  spaces?: SpaceDoc[]
  reservationConfig?: { enabled?: boolean }
}

function oid(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}

async function loadLocation(tenantId: string, locationId: string): Promise<LocationDoc> {
  if (!ID_RE.test(locationId)) throw new SpaceError('Sede inválida', 400)
  const loc = await Location.findOne({ _id: oid(locationId), tenantId: oid(tenantId) })
    .select('timezone spaces reservationConfig.enabled')
    .lean<LocationDoc>()
  if (!loc) throw new SpaceError('Sede no encontrada', 404)
  return loc
}

async function usage(tenantId: string, loc: LocationDoc): Promise<{ tables: Map<string, number>; reservations: Map<string, number> }> {
  const today = getTodayStrInTimezone(loc.timezone || DEFAULT_TIMEZONE)
  const [tables, reservations] = await Promise.all([
    Table.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { tenantId: oid(tenantId), locationId: loc._id, spaceId: { $ne: null } } },
      { $group: { _id: '$spaceId', n: { $sum: 1 } } },
    ]),
    Reservation.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { tenantId: oid(tenantId), locationId: loc._id, spaceId: { $ne: null }, status: { $in: [...ACTIVE_RESERVATION_STATUSES] }, date: { $gte: today } } },
      { $group: { _id: '$spaceId', n: { $sum: 1 } } },
    ]),
  ])
  return {
    tables: new Map(tables.map((t) => [String(t._id), t.n])),
    reservations: new Map(reservations.map((r) => [String(r._id), r.n])),
  }
}

function toView(s: SpaceDoc, use: { tables: Map<string, number>; reservations: Map<string, number> }): SpaceView {
  const id = String(s._id)
  return {
    id,
    name: s.name,
    capacity: s.capacity ?? 0,
    enabled: s.enabled !== false,
    reservable: s.reservable !== false,
    blockedDates: [...(s.blockedDates ?? [])].sort(),
    order: s.order ?? 0,
    tables: use.tables.get(id) ?? 0,
    upcomingReservations: use.reservations.get(id) ?? 0,
  }
}

export async function listSpaces(tenantId: string, locationId: string): Promise<{ spaces: SpaceView[]; reservationsEnabled: boolean }> {
  const loc = await loadLocation(tenantId, locationId)
  const use = await usage(tenantId, loc)
  const spaces = (loc.spaces ?? []).map((s) => toView(s, use)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  return { spaces, reservationsEnabled: loc.reservationConfig?.enabled === true }
}

// ── Validación ──────────────────────────────────────────────────────────────

export interface SpacePatch {
  name?: string
  capacity?: number
  enabled?: boolean
  reservable?: boolean
  blockedDates?: string[]
  order?: number
}

/** Valida los campos presentes (400 ante cualquier cosa rara). */
export function parseSpacePatch(body: Record<string, unknown>, opts: { creating: boolean }): SpacePatch {
  const out: SpacePatch = {}
  if ('name' in body || opts.creating) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw new SpaceError('El espacio necesita un nombre', 400)
    if (name.length > MAX_SPACE_NAME) throw new SpaceError(`El nombre puede tener hasta ${MAX_SPACE_NAME} caracteres`, 400)
    out.name = name
  }
  if ('capacity' in body && body.capacity !== null && body.capacity !== undefined) {
    const c = body.capacity
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > MAX_SPACE_CAPACITY) {
      throw new SpaceError(`La capacidad tiene que ser un número entero entre 0 y ${MAX_SPACE_CAPACITY}`, 400)
    }
    out.capacity = c
  }
  for (const k of ['enabled', 'reservable'] as const) {
    if (k in body) {
      if (typeof body[k] !== 'boolean') throw new SpaceError(`«${k}» tiene que ser verdadero o falso`, 400)
      out[k] = body[k] as boolean
    }
  }
  if ('blockedDates' in body) {
    const d = body.blockedDates
    if (!Array.isArray(d) || d.length > MAX_BLOCKED_DATES || !d.every((x) => typeof x === 'string' && isValidCalendarDate(x))) {
      throw new SpaceError('Fechas bloqueadas inválidas (formato AAAA-MM-DD)', 400)
    }
    out.blockedDates = Array.from(new Set(d as string[])).sort()
  }
  if ('order' in body) {
    const o = body.order
    if (typeof o !== 'number' || !Number.isInteger(o) || o < 0 || o > 1000) throw new SpaceError('Orden inválido', 400)
    out.order = o
  }
  return out
}

/** Un espacio que acepta reservas necesita capacidad (es su aforo). */
function assertReservableHasCapacity(final: { reservable: boolean; capacity: number; name: string }): void {
  if (final.reservable && final.capacity < 1) {
    throw new SpaceError(`«${final.name}» acepta reservas: cargale la capacidad (cantidad de comensales)`, 400)
  }
}

function assertUniqueName(spaces: SpaceDoc[], name: string, exceptId: string | null): void {
  const key = name.toLocaleLowerCase('es')
  if (spaces.some((s) => String(s._id) !== exceptId && s.name.trim().toLocaleLowerCase('es') === key)) {
    throw new SpaceError(`Ya existe un espacio «${name}» en la sede`, 409)
  }
}

// ── Escrituras ──────────────────────────────────────────────────────────────

export async function createSpace(tenantId: string, locationId: string, patch: SpacePatch): Promise<SpaceView> {
  const loc = await loadLocation(tenantId, locationId)
  const spaces = loc.spaces ?? []
  if (spaces.length >= MAX_SPACES_PER_LOCATION) throw new SpaceError(`Máximo ${MAX_SPACES_PER_LOCATION} espacios por sede`, 409)
  const name = patch.name as string
  assertUniqueName(spaces, name, null)
  const space = {
    _id: new mongoose.Types.ObjectId(),
    name,
    capacity: patch.capacity ?? 0,
    enabled: patch.enabled ?? true,
    // Por defecto un espacio nuevo NO toma reservas: se habilita a propósito.
    reservable: patch.reservable ?? false,
    blockedDates: patch.blockedDates ?? [],
    order: patch.order ?? spaces.reduce((m, s) => Math.max(m, (s.order ?? 0) + 1), 0),
  }
  assertReservableHasCapacity(space)
  // Guard atómico: si otro agregó espacios en el medio, se respeta el tope.
  const res = await Location.updateOne(
    { _id: loc._id, tenantId: oid(tenantId), [`spaces.${MAX_SPACES_PER_LOCATION - 1}`]: { $exists: false } },
    { $push: { spaces: space } }
  )
  if (res.matchedCount === 0) throw new SpaceError(`Máximo ${MAX_SPACES_PER_LOCATION} espacios por sede`, 409)
  return toView(space, { tables: new Map(), reservations: new Map() })
}

export async function updateSpace(tenantId: string, locationId: string, spaceId: string, patch: SpacePatch): Promise<{ before: SpaceView; after: SpaceView }> {
  if (!ID_RE.test(spaceId)) throw new SpaceError('Espacio inválido', 400)
  const loc = await loadLocation(tenantId, locationId)
  const spaces = loc.spaces ?? []
  const current = spaces.find((s) => String(s._id) === spaceId)
  if (!current) throw new SpaceError('Ese espacio no existe en la sede', 404)
  if (patch.name !== undefined) assertUniqueName(spaces, patch.name, spaceId)
  const merged: SpaceDoc = { ...current, ...patch }
  assertReservableHasCapacity({ reservable: merged.reservable !== false, capacity: merged.capacity ?? 0, name: merged.name })

  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) set[`spaces.$.${k}`] = v
  if (Object.keys(set).length > 0) {
    const res = await Location.updateOne({ _id: loc._id, tenantId: oid(tenantId), 'spaces._id': oid(spaceId) }, { $set: set })
    if (res.matchedCount === 0) throw new SpaceError('Ese espacio no existe en la sede', 404)
  }
  // Las mesas guardan el nombre del sector para mostrarlo: se mantiene al día.
  if (patch.name !== undefined && patch.name !== current.name) {
    await Table.updateMany({ tenantId: oid(tenantId), locationId: loc._id, spaceId: oid(spaceId) }, { $set: { section: patch.name } })
  }
  const use = await usage(tenantId, loc)
  return { before: toView(current, use), after: toView(merged, use) }
}

export async function deleteSpace(tenantId: string, locationId: string, spaceId: string): Promise<SpaceView> {
  if (!ID_RE.test(spaceId)) throw new SpaceError('Espacio inválido', 400)
  const loc = await loadLocation(tenantId, locationId)
  const current = (loc.spaces ?? []).find((s) => String(s._id) === spaceId)
  if (!current) throw new SpaceError('Ese espacio no existe en la sede', 404)
  const use = await usage(tenantId, loc)
  const view = toView(current, use)
  if (view.tables > 0) {
    throw new SpaceError(`«${view.name}» tiene ${view.tables} mesa${view.tables === 1 ? '' : 's'}: movelas a otro espacio o deshabilitalo`, 409)
  }
  if (view.upcomingReservations > 0) {
    throw new SpaceError(`«${view.name}» tiene ${view.upcomingReservations} reserva${view.upcomingReservations === 1 ? '' : 's'} por venir: deshabilitalo en vez de borrarlo`, 409)
  }
  await Location.updateOne({ _id: loc._id, tenantId: oid(tenantId) }, { $pull: { spaces: { _id: oid(spaceId) } } })
  return view
}

/** Abrir / cerrar la recepción de reservas de la sede (rige al instante). */
export async function setReservationIntake(tenantId: string, locationId: string, enabled: boolean): Promise<boolean> {
  const loc = await loadLocation(tenantId, locationId)
  await Location.updateOne({ _id: loc._id, tenantId: oid(tenantId) }, { $set: { 'reservationConfig.enabled': enabled } })
  return enabled
}
