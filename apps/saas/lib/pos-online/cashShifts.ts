import mongoose from 'mongoose'
import { shiftDateFor, shiftForMinutes, type CashShift } from '@takeasygo/business'
import CashRegister from '@/models/CashRegister'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE, getLocalDayAndMinutes, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { PosError } from './errors'
import type { PosContext } from './tenantContext'

// ============================================================================
// Turnos de caja en el servidor (Fase 2, 29/10/2026)
// ============================================================================
// Un turno = una caja por jornada y sede (índice único en CashRegister).
// La hora de referencia es la de la sede (Location.timezone).
// ============================================================================

export interface SedeShifts {
  shifts: CashShift[]
  timezone: string
}

export async function loadShifts(ctx: Pick<PosContext, 'tenantId' | 'locationId'>): Promise<SedeShifts> {
  const loc = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId })
    .select('cashShifts timezone')
    .lean<{ cashShifts?: CashShift[]; timezone?: string }>()
  return { shifts: loc?.cashShifts ?? [], timezone: loc?.timezone || DEFAULT_TIMEZONE }
}

export interface ResolvedShift {
  shiftId: string
  shiftName: string
  shiftDate: string
}

function localNow(timezone: string, now: Date) {
  return { date: getTodayStrInTimezone(timezone, now), minutes: getLocalDayAndMinutes(now, timezone).minutes }
}

/**
 * Turno de una caja que se abre ahora. null si la sede no usa turnos.
 * Sin turno pedido: el que cubre la hora de la sede (o error si ninguno).
 * Turno ya usado en esa jornada: 409 (un turno = una caja).
 */
export async function resolveShiftForOpen(
  ctx: Pick<PosContext, 'tenantId' | 'locationId'>,
  requestedShiftId: unknown,
  now: Date = new Date()
): Promise<ResolvedShift | null> {
  const { shifts, timezone } = await loadShifts(ctx)
  const active = shifts.filter((s) => s.active)
  if (active.length === 0) return null
  const { date, minutes } = localNow(timezone, now)

  let shift: CashShift | null
  if (requestedShiftId !== undefined && requestedShiftId !== null && requestedShiftId !== '') {
    shift = active.find((s) => s.id === requestedShiftId) ?? null
    if (!shift) throw PosError.validation('Ese turno no existe o está inactivo')
  } else {
    shift = shiftForMinutes(active, minutes)
    if (!shift) throw PosError.validation('Ahora no corresponde ningún turno: elegí el turno de la caja')
  }
  const shiftDate = shiftDateFor(shift, date, minutes)

  const used = await CashRegister.findOne({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    locationId: new mongoose.Types.ObjectId(ctx.locationId),
    shiftId: shift.id,
    shiftDate,
  })
    .select('status')
    .lean<{ status: string }>()
  if (used) {
    throw PosError.conflict(
      used.status === 'open'
        ? `El turno ${shift.name} ya tiene la caja abierta`
        : `El turno ${shift.name} de esta jornada ya se cerró. Un turno tiene una sola caja: elegí otro turno.`
    )
  }
  return { shiftId: shift.id, shiftName: shift.name, shiftDate }
}

export interface ShiftStatusRow {
  id: string
  name: string
  start: string
  end: string
  status: 'open' | 'closed' | 'free'
  register: { posId: string; openedBy: string; openedAt: Date; closedBy: string | null; closedAt: Date | null } | null
}

/** Estado de los turnos de la jornada actual de la sede (sin montos). */
export async function shiftStatusToday(ctx: Pick<PosContext, 'tenantId' | 'locationId'>, now: Date = new Date()) {
  const { shifts, timezone } = await loadShifts(ctx)
  const active = shifts.filter((s) => s.active)
  const { date, minutes } = localNow(timezone, now)
  const current = shiftForMinutes(active, minutes)
  const jornada = current ? shiftDateFor(current, date, minutes) : date
  const registers = active.length
    ? await CashRegister.find({
        tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
        locationId: new mongoose.Types.ObjectId(ctx.locationId),
        shiftDate: jornada,
        shiftId: { $in: active.map((s) => s.id) },
      })
        .select('posId shiftId status openedBy openedAt closedBy closedAt')
        .lean<{ posId: string; shiftId: string; status: string; openedBy: string; openedAt: Date; closedBy?: string | null; closedAt?: Date | null }[]>()
    : []
  const rows: ShiftStatusRow[] = active.map((s) => {
    const r = registers.find((x) => x.shiftId === s.id)
    return {
      id: s.id,
      name: s.name,
      start: s.start,
      end: s.end,
      status: r ? (r.status === 'open' ? 'open' : 'closed') : 'free',
      register: r ? { posId: r.posId, openedBy: r.openedBy, openedAt: r.openedAt, closedBy: r.closedBy ?? null, closedAt: r.closedAt ?? null } : null,
    }
  })
  return { date: jornada, timezone, currentShiftId: current?.id ?? null, shifts: rows }
}
