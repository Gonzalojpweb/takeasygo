// ============================================================================
// perLocationNumber.ts — Numeración por sede (flag numbering.perLocation)
// ============================================================================
// Cuando el flag está ON, pedidos y reservas usan contadores atómicos por
// (tenant, sede) con prefijo de sede. Formato:
//   orders:      <PREFIX>-<SEQ>       ej: REC-0001, SAA-0042
//   reservations: <PREFIX>-R<SEQ>     ej: REC-R0001, SAA-R0123
//
// Cuando el flag está OFF (default), este módulo no se invoca y la
// numeración sigue exactamente como siempre (generateOrderNumber / Counter).
//
// El prefijo se deriva de los primeros 3 caracteres del nombre de la sede,
// en mayúsculas, sin espacios ni caracteres especiales. Ej:
//   "Recoleta"  → REC
//   "Saavedra"  → SAA
//   "Caballito" → CAB
// ============================================================================

import PerLocationCounter, { type NumberingType } from '@/models/PerLocationCounter'
import type { Types } from 'mongoose'

/**
 * Deriva el prefijo corto de una sede a partir de su nombre.
 * Toma los primeros 3 caracteres alfanuméricos, en mayúsculas.
 * Si el nombre no tiene caracteres alfanuméricos, usa "LOC".
 */
export function sedePrefix(locationName: string): string {
  const clean = locationName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const prefix = clean.slice(0, 3)
  return prefix.length >= 2 ? prefix : 'LOC'
}

/**
 * Asigna el siguiente número de forma atómica para (tenant, sede, type).
 *
 * findOneAndUpdate con $inc + upsert es atómico en MongoDB: varias
 * llamadas concurrentes para la misma clave reciben secuencias distintas
 * sin colisiones ni saltos.
 *
 * @returns string con el número formateado (ej: "REC-0001" o "REC-R0001")
 */
export async function nextPerLocationNumber(args: {
  tenantId: Types.ObjectId | string
  locationId: Types.ObjectId | string
  type: NumberingType
  locationName: string
}): Promise<string> {
  const { tenantId, locationId, type, locationName } = args

  const counter = await PerLocationCounter.findOneAndUpdate(
    { tenantId, locationId, type },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  )

  const prefix = sedePrefix(locationName)
  const seq = String(counter.seq).padStart(4, '0')

  if (type === 'order') {
    return `${prefix}-${seq}`
  }
  return `${prefix}-R${seq}`
}
