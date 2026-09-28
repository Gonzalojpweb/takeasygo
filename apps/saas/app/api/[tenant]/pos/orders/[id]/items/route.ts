import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import type { OrderStatus } from '@takeasygo/types'
import { canEditOrderItems } from '@takeasygo/business'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder, toSaasOrderItem, recomputeOrderTotals, type PosOrderItemInput } from '@/lib/pos-online/orderMapper'
import { findPosOrder, type PosOrderDoc } from '@/lib/pos-online/orderRepo'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/items â€” agrega un item a la orden
// ============================================================================

export const POST = posRoute(async (ctx, { id }) => {
  const current = await findPosOrder(ctx, id)

  if (!canEditOrderItems(current.status as OrderStatus)) {
    // 409 y no 403: el rol estÃ¡ bien, lo que viola es el ciclo de vida.
    throw PosError.conflict(`No se pueden editar items en estado ${current.status}`)
  }

  const body = await readPosBody(ctx.request)
  const item = toSaasOrderItem(body as unknown as PosOrderItemInput)

  const items = [...(current.items ?? []), item]
  const { subtotal, total, baseTotal } = recomputeOrderTotals(items)

  const updated = await Order.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId: current.posId,
      // Concurrency optimista: si alguien mÃ¡s tocÃ³ la orden en el medio, no
      // pisamos su escritura, devolvemos 409 y el POS reintenta.
      updatedAt: current.updatedAt,
    },
    { $set: { items, subtotal, total, 'payment.baseTotal': baseTotal } },
    { new: true }
  )
    .lean()
    .exec()

  if (!updated) {
    throw PosError.conflict('La orden cambiÃ³ mientras se procesaba la peticiÃ³n', `posId=${current.posId}`)
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.item.add',
    entity: 'Order',
    entityId: String(current.posId),
    details: { item: item.name, quantity: item.quantity, total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json(
    { order: toPosOrder(updated as unknown as PosOrderDoc) },
    { status: 201 }
  )
})
