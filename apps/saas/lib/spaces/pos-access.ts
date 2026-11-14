import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import { canAccess, type Plan } from '@/lib/plans'
import { PosError } from '@/lib/pos-online/errors'
import { SpaceError } from './location-spaces'

// ============================================================================
// Espacios desde el POS (14/11/2026) — piezas comunes de las rutas
// ============================================================================

/** SpaceError del servicio → error tipado del POS. */
export function toPosSpaceError(err: unknown): never {
  if (err instanceof SpaceError) {
    if (err.status === 404) throw PosError.notFound(err.message)
    if (err.status === 409) throw PosError.conflict(err.message)
    throw PosError.validation(err.message)
  }
  throw err
}

/** El comercio puede tomar reservas (plan + módulo activo). */
export async function reservationsAvailable(tenantId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(tenantId)) return false
  const tenant = await Tenant.findById(tenantId).select('plan features.reservations').lean<{ plan?: Plan; features?: { reservations?: boolean } }>()
  return Boolean(tenant?.features?.reservations) && canAccess(tenant?.plan ?? 'try', 'reservations')
}
