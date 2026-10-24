// ============================================================================
// reservation-no-show.ts — No-show automático por sede
// ============================================================================
// Con `reservationConfig.autoNoShowMinutes` (null = apagado), una reserva
// confirmada que no se sentó N minutos después de su horario pasa a no_show.
//
// Se evalúa de forma perezosa al leer reservas (panel, API, reportes): no
// depende de un cron con frecuencia de minutos. La comparación usa la zona
// horaria de cada sede.
// ============================================================================

import mongoose from 'mongoose'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import Table from '@/models/Table'
import { DEFAULT_TIMEZONE, addDaysToDateStr, getLocalDayAndMinutes, getTodayStrInTimezone, timeToMinutes } from '@/lib/restaurant-time'

/** Marca no-show en las sedes del tenant (opcionalmente acotadas). Devuelve cuántas marcó. */
export async function applyAutoNoShow(
  tenantId: mongoose.Types.ObjectId | string,
  sedeFilter: { _id?: unknown } = {}
): Promise<number> {
  const locationQuery: Record<string, unknown> = {
    tenantId,
    ...sedeFilter,
    'reservationConfig.autoNoShowMinutes': { $gt: 0 },
  }
  const locations = await Location.find(locationQuery)
    .select('_id timezone reservationConfig.autoNoShowMinutes')
    .lean<Array<{ _id: mongoose.Types.ObjectId; timezone?: string; reservationConfig?: { autoNoShowMinutes?: number } }>>()

  let marked = 0
  for (const loc of locations) {
    const minutes = loc.reservationConfig?.autoNoShowMinutes ?? 0
    if (minutes <= 0) continue
    const tz = loc.timezone || DEFAULT_TIMEZONE
    const today = getTodayStrInTimezone(tz)
    const nowMinutes = getLocalDayAndMinutes(new Date(), tz).minutes

    // Días anteriores: todo lo confirmado ya venció (ventana de 7 días para
    // acotar la consulta). Hoy: solo lo que superó horario + margen.
    const candidates = await Reservation.find({
      tenantId,
      locationId: loc._id,
      status: 'confirmed',
      date: { $gte: addDaysToDateStr(today, -7), $lte: today },
    })
      .select('_id date time')
      .lean<Array<{ _id: mongoose.Types.ObjectId; date: string; time: string }>>()

    const expired = candidates
      .filter(r => r.date < today || timeToMinutes(r.time) + minutes <= nowMinutes)
      .map(r => r._id)
    if (expired.length === 0) continue

    // Condición sobre el estado: si alguien la sentó en el medio, no se pisa.
    const res = await Reservation.updateMany(
      { _id: { $in: expired }, status: 'confirmed' },
      { $set: { status: 'no_show', autoNoShowAt: new Date() } }
    )
    marked += res.modifiedCount
    // Mesas que estas reservas tenían reservadas en el POS vuelven a libres
    // (solo si siguen reservadas por ellas: si alguien la ocupó, no se toca).
    if (res.modifiedCount > 0) {
      await Table.updateMany(
        { tenantId, locationId: loc._id, status: 'reserved', reservationId: { $in: expired } },
        { $set: { status: 'free', reservationId: null } }
      )
    }
  }
  return marked
}
