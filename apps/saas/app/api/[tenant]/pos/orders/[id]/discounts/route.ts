import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosOrder } from '@/lib/pos-online/orderRepo'
import { parseDiscountInput } from '@/lib/pos-online/discounts'
import { applyOrderDiscount, approveDiscount, assertDiscountable, removeOrderDiscount } from '@/lib/pos-online/discountService'

// ============================================================================
// POST   /api/[tenant]/pos/orders/[id]/discounts — descuento (Fase D)
//        { lineId?, kind: 'percent'|'amount', value, reason, note? }
//        lineId ⇒ solo ese plato; sin lineId ⇒ toda la orden.
// DELETE /api/[tenant]/pos/orders/[id]/discounts?lineId= — quita el descuento
//        de ese plato (o de toda la orden sin lineId).
// Reglas y modelo: lib/pos-online/discounts.ts + discountService.ts.
// ============================================================================

function optionalLineId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw PosError.validation('lineId inválido')
  return value
}

export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const order = await findPosOrder(ctx, id)
  assertDiscountable(order)
  const body = await readPosBody(ctx.request)
  const input = parseDiscountInput(body)
  const lineId = optionalLineId(body.lineId)
  const approval = await approveDiscount(ctx)
  const { order: saved, discountedCents } = await applyOrderDiscount(ctx, order, input, lineId, approval)
  return NextResponse.json({ order: toPosOrder(saved), discountedCents })
})

export const DELETE = posRoute('orders.pay', async (ctx, { id }) => {
  const order = await findPosOrder(ctx, id)
  const lineId = optionalLineId(new URL(ctx.request.url).searchParams.get('lineId'))
  const saved = await removeOrderDiscount(ctx, order, lineId)
  return NextResponse.json({ order: toPosOrder(saved) })
})
