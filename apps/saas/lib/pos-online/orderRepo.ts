import Order from '@/models/Order'
import { PosError } from './errors'
import { toPosOrder } from './orderMapper'
import type { PosContext } from './tenantContext'

// ============================================================================
// Repositorio de órdenes POS — lookup con alcance de sede obligatorio
// ============================================================================

export type PosOrderDoc = Parameters<typeof toPosOrder>[0]

/**
 * El `id` del POS es un UUID generado con crypto.randomUUID(), nunca un
 * ObjectId. Se acota el largo antes de cualquier query para que un valor
 * arbitrario no llegue al filtro.
 */
export function assertPosId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
    throw PosError.notFound('Orden no encontrada')
  }
  return id
}

export async function findPosOrder(ctx: PosContext, id: string): Promise<PosOrderDoc> {
  const doc = await Order.findOne({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posId: assertPosId(id),
  })
    .lean()
    .exec()

  if (!doc) throw PosError.notFound('Orden no encontrada')
  return doc as unknown as PosOrderDoc
}
