import Table from '@/models/Table'
import { PosError } from './errors'
import { toPosTable } from './tableMapper'
import type { PosContext } from './tenantContext'

// ============================================================================
// Repositorio de mesas POS — lookup con alcance de sede obligatorio
// ============================================================================

export type PosTableDoc = Parameters<typeof toPosTable>[0]

/**
 * El `id` de la mesa es el UUID que generó el POS, nunca un ObjectId.
 * Se acota el largo antes de cualquier query.
 */
export function assertTablePosId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
    throw PosError.notFound('Mesa no encontrada')
  }
  return id
}

export async function findPosTable(ctx: PosContext, id: string): Promise<PosTableDoc> {
  const doc = await Table.findOne({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posId: assertTablePosId(id),
  })
    .lean()
    .exec()

  if (!doc) throw PosError.notFound('Mesa no encontrada')
  return doc as unknown as PosTableDoc
}
