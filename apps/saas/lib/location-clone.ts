// ============================================================================
// location-clone.ts — Alta de sede copiando la configuración de otra
// ============================================================================
// Copia la configuración OPERATIVA de una sede del mismo tenant (horarios,
// modos, reservas, delivery, espacios, recargos, zona horaria, imagen). No
// copia lo que identifica a la sede ni lo que es propio de su operación:
// nombre, slug, dirección, teléfono, geo, prefijo de numeración, token del
// agente de impresión, integración Rapiboy, estado de pausa ni el anuncio
// de demora vigente.
// ============================================================================

import mongoose from 'mongoose'
import Location from '@/models/Location'
import Menu from '@/models/Menu'

/** Campos de Location que se copian de la sede origen. */
export const CLONED_LOCATION_FIELDS = [
  'hours',
  'serviceHours',
  'reservationConfig',
  'spaces',
  'hero',
  'gallery',
  'cuisineTypes',
  'timezone',
  'scheduledOrdersConfig',
  'deliveryConfig',
  'settings',
] as const

/** Quita `_id` en profundidad para que Mongoose genere ids nuevos. */
function stripIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripIds) as unknown as T
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '_id' || k === 'id') continue
      out[k] = stripIds(v)
    }
    return out as T
  }
  return value
}

/**
 * Configuración copiable de la sede origen, lista para mezclar en el body de
 * alta (los valores del body ganan). null si la sede no es del tenant.
 */
export async function loadClonableConfig(
  tenantId: mongoose.Types.ObjectId | string,
  sourceLocationId: string
): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(sourceLocationId)) return null
  const source = await Location.findOne({ _id: sourceLocationId, tenantId })
    .select(CLONED_LOCATION_FIELDS.join(' '))
    .lean<Record<string, unknown>>()
  if (!source) return null

  const config: Record<string, unknown> = {}
  for (const field of CLONED_LOCATION_FIELDS) {
    if (source[field] !== undefined) config[field] = stripIds(source[field])
  }
  // El anuncio de demora es estado operativo del momento, no configuración.
  const settings = config.settings as Record<string, unknown> | undefined
  if (settings) delete settings.delayAnnouncement
  return config
}

/**
 * Copia el menú de la sede origen a la nueva (ids nuevos, likes en cero).
 * Si la sede nueva ya tiene menú, no hace nada. Devuelve si lo copió.
 */
export async function cloneMenu(
  tenantId: mongoose.Types.ObjectId | string,
  sourceLocationId: string,
  targetLocationId: mongoose.Types.ObjectId | string
): Promise<boolean> {
  const existing = await Menu.exists({ tenantId, locationId: targetLocationId })
  if (existing) return false
  const source = await Menu.findOne({ tenantId, locationId: sourceLocationId })
    .select('categories isActive')
    .lean<{ categories?: unknown[]; isActive?: boolean }>()
  const categories = stripIds(source?.categories ?? []) as Array<Record<string, unknown>>
  const resetLikes = (items: unknown) =>
    Array.isArray(items) ? items.map(i => ({ ...(i as Record<string, unknown>), likesCount: 0 })) : items
  for (const cat of categories) {
    cat.items = resetLikes(cat.items)
    if (Array.isArray(cat.subcategories)) {
      cat.subcategories = (cat.subcategories as Array<Record<string, unknown>>).map(sub => ({
        ...sub,
        items: resetLikes(sub.items),
      }))
    }
  }
  await Menu.create({
    tenantId,
    locationId: targetLocationId,
    categories,
    isActive: source?.isActive ?? true,
  })
  return true
}
