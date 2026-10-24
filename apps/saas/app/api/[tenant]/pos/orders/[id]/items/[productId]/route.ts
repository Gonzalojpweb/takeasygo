import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import type { OrderStatus } from '@takeasygo/types'
import { canEditOrderItems } from '@takeasygo/business'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { requireManagerApproval } from '@/lib/pos-online/approval'
import { syncOrderConsumptionSafe } from '@/lib/inventory/sales'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder, recomputeOrderTotals, type SaasOrderItemDraft } from '@/lib/pos-online/orderMapper'
import { assertNotPaid, findPosOrder, type PosOrderDoc } from '@/lib/pos-online/orderRepo'

// ============================================================================
// PATCH  /api/[tenant]/pos/orders/[id]/items/[productId] — cambia la cantidad
// DELETE /api/[tenant]/pos/orders/[id]/items/[productId] — quita el producto
// ============================================================================

/**
 * El POS identifica los items por `productId` (es lo que ya usa
 * removeItem/updateItemQuantity en services/order.ts), no por índice:
 * un índice se mueve con cada edición y provocaría borrar el ítem equivocado.
 */
function matchesProduct(item: SaasOrderItemDraft, productId: string): boolean {
  return item.menuItemId?.toString() === productId
}

function assertProductId(productId: unknown): string {
  if (typeof productId !== 'string' || productId.length === 0 || productId.length > 100) {
    throw PosError.validation('productId inválido')
  }
  return productId
}

function assertEditable(status: string): void {
  if (!canEditOrderItems(status as OrderStatus)) {
    throw PosError.conflict(`No se pueden editar items en estado ${status}`)
  }
}

/** Recalcula el subtotal de un item para una nueva cantidad. */
/**
 * Fase 1 de caja (2026-10): quitar o bajar productos de una orden que YA se
 * mandó a cocina (`confirmed`) es la "anulación post-comanda" — necesita el
 * PIN de un encargado si lo hace un cajero o un mozo. Antes de mandar a
 * cocina (`pending`) se edita libre.
 */
async function approveIfSentToKitchen(
  ctx: Parameters<Parameters<typeof posRoute>[1]>[0],
  status: string,
  details: Record<string, unknown>
): Promise<string | null> {
  if (status !== 'confirmed') return null
  const approval = await requireManagerApproval(
    ctx,
    'order.item.reduce',
    'Quitar productos que ya se mandaron a cocina necesita la aprobación de un encargado'
  )
  details.approvedBy = approval.approvedBy
  return approval.approvedBy
}

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
    throw PosError.conflict('La orden cambió mientras se procesaba la petición', `posId=${posId}`)
  }
  // Inventario: cantidad cambiada o línea quitada → se registra la diferencia.
  await syncOrderConsumptionSafe(updated as never)
  return updated as unknown as PosOrderDoc
}

export const PATCH = posRoute('orders.write', async (ctx, { id, productId }) => {
  const pid = assertProductId(productId)
  const current = await findPosOrder(ctx, id)
  assertEditable(current.status)
  assertNotPaid(current)

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

  const auditDetails: Record<string, unknown> = { productId: pid, quantity }
  const currentQuantity = matches.reduce((sum, i) => sum + i.quantity, 0)
  if (quantity < currentQuantity) {
    await approveIfSentToKitchen(ctx, current.status, auditDetails)
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
    details: { ...auditDetails, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(saved) })
})

export const DELETE = posRoute('orders.write', async (ctx, { id, productId }) => {
  const pid = assertProductId(productId)
  const current = await findPosOrder(ctx, id)
  assertEditable(current.status)
  assertNotPaid(current)

  const before = current.items ?? []
  const items = before.filter((i) => !matchesProduct(i, pid))
  if (items.length === before.length) {
    throw PosError.notFound('Producto no encontrado en la orden')
  }

  const auditDetails: Record<string, unknown> = { productId: pid }
  await approveIfSentToKitchen(ctx, current.status, auditDetails)

  const saved = await saveItems(ctx, current.posId as string, current.updatedAt, items)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.item.remove',
    entity: 'Order',
    entityId: String(current.posId),
    details: { ...auditDetails, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(saved) })
})
