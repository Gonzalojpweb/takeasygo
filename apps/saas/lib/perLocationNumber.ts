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
import Location from '@/models/Location'
import type { Types } from 'mongoose'

/**
 * Verifica que todas las sedes activas de un tenant tengan `prefix` guardado.
 * Se usa como guard: si el flag numbering.perLocation está ON pero falta
 * prefijo en alguna sede, la numeración NO se aplica (cae a legacy).
 *
 * @returns true si todas las sedes activas tienen prefix válido
 */
export async function allLocationsHavePrefix(tenantId: Types.ObjectId | string): Promise<boolean> {
  const missing = await Location.exists({
    tenantId,
    isActive: true,
    $or: [
      { prefix: { $exists: false } },
      { prefix: null },
      { prefix: '' },
      { prefix: { $not: /^[A-Z0-9]{2,4}$/ } },
    ],
  })
  return !missing
}

/**
 * Deriva el prefijo corto de una sede a partir de su nombre.
 * Solo se usa como fallback cuando la sede no tiene `prefix` guardado
 * (tenants existentes creados antes del campo).
 * Toma los primeros 3 caracteres alfanuméricos, en mayúsculas.
 * Si el nombre no tiene caracteres alfanuméricos, usa "LOC".
 */
export function sedePrefix(locationName: string): string {
  const clean = locationName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const prefix = clean.slice(0, 3)
  return prefix.length >= 2 ? prefix : 'LOC'
}

/**
 * Resuelve el prefijo de una sede: usa `location.prefix` si está guardado,
 * si no deriva del nombre (fallback para tenants existentes).
 */
export function resolveSedePrefix(location: { prefix?: string | null; name: string }): string {
  if (location.prefix && /^[A-Z0-9]{2,4}$/.test(location.prefix)) {
    return location.prefix
  }
  return sedePrefix(location.name)
}

/**
 * Asigna el siguiente número de forma atómica para (tenant, sede, type).
 *
 * findOneAndUpdate con $inc + upsert es atómico en MongoDB para docs
 * existentes. Para la PRIMERA llamada concurrente (upsert), dos requests
 * pueden intentar crear el doc a la vez → el índice único en
 * (tenantId, locationId, type) hace que uno falle con duplicate key.
 * Se reintenta: en el retry el doc ya existe y el $inc es atómico.
 *
 * El prefijo se resuelve con `resolveSedePrefix`: usa `location.prefix`
 * si está guardado, si no deriva del nombre (fallback tenants existentes).
 *
 * @returns string con el número formateado (ej: "REC-0001" o "REC-R0001")
 */
export async function nextPerLocationNumber(args: {
  tenantId: Types.ObjectId | string
  locationId: Types.ObjectId | string
  type: NumberingType
  location: { prefix?: string | null; name: string }
}): Promise<string> {
  const { tenantId, locationId, type, location } = args

  let counter: { seq: number } | null = null
  const MAX_RETRIES = 3

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      counter = await PerLocationCounter.findOneAndUpdate(
        { tenantId, locationId, type },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      )
      break
    } catch (err: unknown) {
      // Duplicate key = otro upsert concurrente creó el doc primero.
      // El retry encontrará el doc existente y el $inc será atómico.
      const code = (err as { code?: number })?.code
      if (code === 11000 && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }

  if (!counter) throw new Error('nextPerLocationNumber: no se pudo asignar número')

  const prefix = resolveSedePrefix(location)
  const seq = String(counter.seq).padStart(4, '0')

  if (type === 'order') {
    return `${prefix}-${seq}`
  }
  return `${prefix}-R${seq}`
}
