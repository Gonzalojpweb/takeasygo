import CashRegister from '@/models/CashRegister'
import CashMovement from '@/models/CashMovement'
import { PosError } from './errors'
import type { PosMovementDoc, PosRegisterDoc } from './cashMapper'
import type { PosContext } from './tenantContext'

// ============================================================================
// Repositorio de caja — lookup SIEMPRE acotado a la sede del contexto
// ============================================================================
// `locationId` entra en cada filtro: una caja de otra sede no existe para
// este token (404, no 403 — no se filtra la existencia de sedes ajenas).
// ============================================================================

/** Documento de caja ya resuelto por sede (`_id` incluido). */
export type RegisterWithId = PosRegisterDoc

/**
 * El `id` del POS es un UUID generado con crypto.randomUUID(), nunca un
 * ObjectId. Se acota el largo antes de cualquier query.
 */
export function assertRegisterPosId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
    throw PosError.notFound('Caja no encontrada')
  }
  return id
}

export async function findPosRegister(ctx: PosContext, id: string): Promise<RegisterWithId> {
  const doc = await CashRegister.findOne({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posId: assertRegisterPosId(id),
  })
    .lean()
    .exec()

  if (!doc) throw PosError.notFound('Caja no encontrada')
  return doc as unknown as RegisterWithId
}

/** Caja abierta de esta sede (la hay como máximo una: índice parcial único). */
export async function findOpenRegister(ctx: PosContext): Promise<RegisterWithId | null> {
  const doc = await CashRegister.findOne({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    status: 'open',
  })
    .lean()
    .exec()

  return (doc as unknown as RegisterWithId) ?? null
}

/**
 * Caja por posId SIN filtrar por sede — solo para distinguir
 * "reintento de la misma apertura" (200) de "otra caja abierta" (409).
 * Nunca se usa para responder con datos: el resultado se re-filtra por sede.
 */
export async function findRegisterByPosId(
  ctx: PosContext,
  posId: string
): Promise<RegisterWithId | null> {
  const doc = await CashRegister.findOne({ tenantId: ctx.tenantId, posId })
    .lean()
    .exec()
  return (doc as unknown as RegisterWithId) ?? null
}

/**
 * Movimientos agrupados por caja, en UNA sola query (evita el N+1 cuando la
 * lista trae varias cajas) y con orden total garantizado: `timestamp, _id`
 * hace determinista cualquier diff-then-put posterior.
 *
 * La clave del mapa es `String(register._id)`.
 */
export async function loadMovementsByRegisterIds(
  ids: readonly unknown[]
): Promise<Map<string, PosMovementDoc[]>> {
  const grouped = new Map<string, PosMovementDoc[]>()
  if (ids.length === 0) return grouped

  const docs = await CashMovement.find({
    registerId: { $in: ids as unknown as import('mongoose').Types.ObjectId[] },
  })
    .sort({ timestamp: 1, _id: 1 })
    .lean()
    .exec()

  for (const raw of docs) {
    const doc = raw as unknown as PosMovementDoc & { registerId: unknown }
    const key = String(doc.registerId)
    const bucket = grouped.get(key)
    if (bucket) bucket.push(doc)
    else grouped.set(key, [doc])
  }
  return grouped
}

/** Movimientos de UNA caja. */
export async function loadMovementsForRegister(
  registerObjectId: unknown
): Promise<PosMovementDoc[]> {
  const grouped = await loadMovementsByRegisterIds([registerObjectId])
  return grouped.get(String(registerObjectId)) ?? []
}
