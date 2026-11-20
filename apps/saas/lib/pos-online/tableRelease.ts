import Order from '@/models/Order'
import Table from '@/models/Table'
import { isValidOrderTransition } from '@takeasygo/business'
import type { OrderStatus } from '@takeasygo/types'
import { logAudit } from '@/lib/audit'
import { syncOrderConsumptionSafe } from '@/lib/inventory/sales'
import { syncReferralsForOrder } from '@/lib/referrals'
import { runAfterResponse } from '@/lib/after-response'
import type { PosContext } from './tenantContext'
import type { PosOrderDoc } from './orderRepo'

// ============================================================================
// Mesa que se queda sin nada → vuelve a LIBRE (verde) — 19/11/2026
// ============================================================================
// Hallazgo del dueño: se quitaban todos los platos de una mesa y la mesa
// quedaba amarilla (ocupada) con una ronda vacía. El POS no ofrecía
// «Liberar» (había una ronda abierta) y el server tampoco lo aceptaba (la
// ronda seguía en `confirmed`). Ahora:
//   · una ronda que se queda sin platos se cancela sola (no hay nada que
//     cocinar ni cobrar; las anulaciones de cada plato ya quedaron en
//     Order.itemVoids con su motivo);
//   · si la mesa ya no tiene ninguna ronda abierta, vuelve a libre.
// ============================================================================

const CLOSED_STATUSES = ['delivered', 'cancelled']

/** Campos que se limpian al liberar (mismos que PATCH /pos/tables → free). */
export const FREE_TABLE_FIELDS = {
  status: 'free',
  currentOrderId: null,
  serverId: null,
  serverName: null,
  needsBill: false,
  guests: null,
} as const

/**
 * Libera la mesa si no le queda ninguna ronda abierta. Solo toca mesas
 * ocupadas o «llamando al encargado» (una reservada no se libera sola).
 * Devuelve true si la liberó.
 */
export async function releaseTableIfIdle(
  ctx: Pick<PosContext, 'tenantId' | 'locationId'>,
  tablePosId: string | null | undefined
): Promise<boolean> {
  if (!tablePosId) return false
  const open = await Order.exists({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posTableId: tablePosId,
    status: { $nin: CLOSED_STATUSES },
  })
  if (open) return false
  const res = await Table.updateOne(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId: tablePosId,
      status: { $in: ['occupied', 'needs_attention'] },
    },
    { $set: FREE_TABLE_FIELDS }
  )
  return res.modifiedCount > 0
}

/**
 * Si la ronda quedó sin platos (y sin cobrar), la cancela y libera la mesa
 * cuando no le queda otra ronda abierta. Devuelve la orden final.
 */
export async function cancelRoundIfEmpty(ctx: PosContext, saved: PosOrderDoc): Promise<PosOrderDoc> {
  const items = (saved.items ?? []) as unknown[]
  const status = saved.status as OrderStatus
  if (items.length > 0 || CLOSED_STATUSES.includes(status)) return saved
  if (!isValidOrderTransition(status, 'cancelled')) return saved

  const now = new Date()
  const cancelled = await Order.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId: saved.posId,
      status,
      'items.0': { $exists: false },
      'posPayments.0': { $exists: false },
    },
    {
      $set: {
        status: 'cancelled',
        'statusTimestamps.cancelledAt': now,
        'statusTimestamps.cancelledBy': 'admin',
        // Sin impresión diferida pendiente: no hay nada que mandar a cocina.
        kitchenPrintDeferred: false,
      },
    },
    { returnDocument: 'after' }
  )
    .lean()
    .exec()
  if (!cancelled) return saved

  await syncOrderConsumptionSafe(cancelled as never)
  const released = await releaseTableIfIdle(ctx, saved.posTableId)
  runAfterResponse('referidos (ronda POS vacía cancelada)', () => syncReferralsForOrder(cancelled as never))

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.auto_cancel',
    entity: 'Order',
    entityId: String(saved.posId),
    details: { posId: saved.posId, previousStatus: status, reason: 'sin_platos', tablePosId: saved.posTableId ?? null, tableReleased: released },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return cancelled as unknown as PosOrderDoc
}
