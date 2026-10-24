import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import { requireManagerApproval, type Approval } from './approval'
import { PosError } from './errors'
import type { PosContext } from './tenantContext'
import { recomputeOrderTotals } from './orderMapper'
import { assertNotPaid, type PosOrderDoc } from './orderRepo'
import { applyDiscount, removeDiscount, type DiscountInput, type DiscountedItem } from './discounts'

// ============================================================================
// Aplicar / quitar descuentos sobre órdenes del POS (Fase D, 2026-10)
// ============================================================================
// Lo usan POST/DELETE /pos/orders/[id]/discounts (por ítem o por orden) y
// POST/DELETE /pos/tables/[id]/discount (toda la cuenta de la mesa).
// Reglas:
//   · capacidad `orders.pay` en la ruta (el mozo no descuenta).
//   · cajero: PIN de encargado (requireManagerApproval); encargado/admin
//     directo. Quitar un descuento no pide PIN (sube el importe).
//   · solo órdenes sin cobrar, no anuladas ni cerradas.
//   · concurrencia optimista por updatedAt, como el resto del POS.
// ============================================================================

const CLOSED_STATUSES = new Set(['delivered', 'cancelled'])

export function assertDiscountable(order: PosOrderDoc & { voided?: unknown }): void {
  assertNotPaid(order)
  if (CLOSED_STATUSES.has(order.status) || order.voided) {
    throw PosError.conflict(`No se puede descontar una orden en estado ${order.status}`)
  }
}

export function approveDiscount(ctx: PosContext): Promise<Approval> {
  return requireManagerApproval(ctx, 'order.discount', 'Aplicar un descuento necesita la aprobación de un encargado')
}

async function saveDiscountedItems(ctx: PosContext, order: PosOrderDoc, items: DiscountedItem[]): Promise<PosOrderDoc> {
  const { subtotal, total, baseTotal } = recomputeOrderTotals(items)
  const updated = await Order.findOneAndUpdate(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posId: order.posId, updatedAt: order.updatedAt },
    { $set: { items, subtotal, total, 'payment.baseTotal': baseTotal } },
    { new: true }
  )
    .lean()
    .exec()
  if (!updated) {
    throw PosError.conflict('La orden cambió mientras se procesaba la petición', `posId=${order.posId}`)
  }
  return updated as unknown as PosOrderDoc
}

export async function applyOrderDiscount(
  ctx: PosContext,
  order: PosOrderDoc,
  input: DiscountInput,
  lineId: string | null,
  approval: Approval
): Promise<{ order: PosOrderDoc; discountedCents: number }> {
  assertDiscountable(order)
  const { items, discountedCents } = applyDiscount(order.items as DiscountedItem[], input, {
    lineId,
    by: ctx.user.id,
    approvedBy: approval.viaPin ? approval.approvedBy : null,
    at: new Date(),
  })
  const saved = await saveDiscountedItems(ctx, order, items)
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.discount',
    entity: 'Order',
    entityId: String(order.posId),
    details: {
      lineId,
      scope: lineId ? 'item' : 'order',
      kind: input.kind,
      value: input.value,
      reason: input.reason,
      note: input.note,
      discountedCents,
      approvedBy: approval.approvedBy,
      total: saved.total,
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return { order: saved, discountedCents }
}

export async function removeOrderDiscount(ctx: PosContext, order: PosOrderDoc, lineId: string | null): Promise<PosOrderDoc> {
  assertDiscountable(order)
  const saved = await saveDiscountedItems(ctx, order, removeDiscount(order.items as DiscountedItem[], lineId))
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.discount.remove',
    entity: 'Order',
    entityId: String(order.posId),
    details: { lineId, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return saved
}
