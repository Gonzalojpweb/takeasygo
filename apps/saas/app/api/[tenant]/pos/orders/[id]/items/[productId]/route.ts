import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import type { OrderStatus } from '@takeasygo/types'
import { canEditOrderItems } from '@takeasygo/business'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder, recomputeOrderTotals, type SaasOrderItemDraft } from '@/lib/pos-online/orderMapper'
import { findPosOrder, type PosOrderDoc } from '@/lib/pos-online/orderRepo'

// ============================================================================
// PATCH  /api/[tenant]/pos/orders/[id]/items/[productId] â€” cambia la cantidad
// DELETE /api/[tenant]/pos/orders/[id]/items/[productId] â€” quita el producto
// ============================================================================

/**
 * El POS identifica los items por `productId` (es lo que ya usa
 * removeItem/updateItemQuantity en services/order.ts), no por Ã­ndice:
 * un Ã­ndice se mueve con cada ediciÃ³n y provocarÃ­a borrar el Ã­tem equivocado.
 */
function matchesProduct(item: SaasOrderItemDraft, productId: string): boolean {
  return item.menuItemId?.toString() === productId
}

function assertProductId(productId: unknown): string {
  if (typeof productId !== 'string' || productId.length === 0 || productId.length > 100) {
    throw PosError.validation('productId invÃ¡lido')
  }
  return productId
}

function assertEditable(status: string): void {
  if (!canEditOrderItems(status as OrderStatus)) {
    throw PosError.conflict(`No se pueden editar items en estado ${status}`)
  }
}

/** Recalcula el subtotal de un item para una nueva cantidad. */
function withQuantity(item: SaasOrderItemDraft, quantity: number): SaasOrderItemDraft {
  return { ...item, quantity, subtotal: (item.basePrice + item.extraPrice) * quantity }
}

async function saveItems(
  ctx: { tenantId: string; locationId: string },
  posId: string,
  expectedUpdatedAt: Date,
  items: SaasOrderItemDraft[]
) {
  const { subtotal, total, baseTotal } = recomputeOrderTotals(items)

  const updated = await Order.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
      updatedAt: expectedUpdatedAt,
    },
    { $set: { items, subtotal, total, 'payment.baseTotal': baseTotal } },
    { new: true }
  )
    .lean()
    .exec()

  if (!updated) {
    throw PosError.conflict('La orden cambiÃ³ mientras se procesaba la peticiÃ³n', `posId=${posId}`)
  }
  return updated as unknown as PosOrderDoc
}

export const PATCH = posRoute(async (ctx, { id, productId }) => {
  const pid = assertProductId(productId)
  const current = await findPosOrder(ctx, id)
  assertEditable(current.status)

  const body = await readPosBody(ctx.request)
  requireFields(body, ['quantity'])

  const quantity = body.quantity
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) {
    throw PosError.validation('quantity debe ser un entero >= 0')
  }

  const before = current.items ?? []
  const matches = before.filter((i) => matchesProduct(i, pid))
  if (matches.length === 0) {
    throw PosError.notFound('Producto no encontrado en la orden')
  }

  // Espejo del POS: quantity 0 equivale a quitarlo.
  const items =
    quantity === 0
      ? before.filter((i) => !matchesProduct(i, pid))
      : before.map((i) => (matchesProduct(i, pid) ? withQuantity(i, quantity) : i))

  const saved = await saveItems(ctx, current.posId as string, current.updatedAt, items)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.item.quantity',
    entity: 'Order',
    entityId: String(current.posId),
    details: { productId: pid, quantity, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(saved) })
})

export const DELETE = posRoute(async (ctx, { id, productId }) => {
  const pid = assertProductId(productId)
  const current = await findPosOrder(ctx, id)
  assertEditable(current.status)

  const before = current.items ?? []
  const items = before.filter((i) => !matchesProduct(i, pid))
  if (items.length === before.length) {
    throw PosError.notFound('Producto no encontrado en la orden')
  }

  const saved = await saveItems(ctx, current.posId as string, current.updatedAt, items)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.item.remove',
    entity: 'Order',
    entityId: String(current.posId),
    details: { productId: pid, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(saved) })
})
