import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosOrder } from '@/lib/pos-online/orderRepo'
import { parseDiscountInput } from '@/lib/pos-online/discounts'
import { assertDiscountable, discountOrder, discountOrderLines, removeOrderDiscount } from '@/lib/pos-online/discountService'

// ============================================================================
// POST   /api/[tenant]/pos/orders/[id]/discounts — descuento (Fase D)
//        { lineId?, kind: 'percent'|'amount', value, reason, note?, finalCents? }
//        lineId ⇒ solo ese plato; sin lineId ⇒ toda la orden.
//        { lines: [{ lineId, kind, value, reason, note? }] } (20/11/2026) ⇒
//        varios platos de una vez, con un solo PIN (Mostrador al cobrar).
//        finalCents ⇒ modo «importe final» (kind amount; el server verifica
//        que el total que queda sea exactamente ese).
// DELETE /api/[tenant]/pos/orders/[id]/discounts?lineId= — quita el descuento
//        de ese plato (o de toda la orden sin lineId).
// Quién puede y con qué PIN: política del comercio (discountService).
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
  if (Array.isArray(body.lines)) {
    if (body.lines.length === 0 || body.lines.length > 50) throw PosError.validation('Entre 1 y 50 descuentos por plato')
    const entries = (body.lines as unknown[]).map((raw) => {
      if (!raw || typeof raw !== 'object') throw PosError.validation('Descuento por plato inválido')
      const line = raw as Record<string, unknown>
      const lineId = optionalLineId(line.lineId)
      if (!lineId) throw PosError.validation('Cada descuento por plato necesita su lineId')
      return { lineId, input: parseDiscountInput(line) }
    })
    const { order: saved, discountedCents } = await discountOrderLines(ctx, order, entries)
    return NextResponse.json({ order: toPosOrder(saved), discountedCents })
  }
  const input = parseDiscountInput(body)
  const lineId = optionalLineId(body.lineId)
  const { order: saved, discountedCents } = await discountOrder(ctx, order, input, lineId)
  return NextResponse.json({ order: toPosOrder(saved), discountedCents })
})

export const DELETE = posRoute('orders.pay', async (ctx, { id }) => {
  const order = await findPosOrder(ctx, id)
  const lineId = optionalLineId(new URL(ctx.request.url).searchParams.get('lineId'))
  const saved = await removeOrderDiscount(ctx, order, lineId)
  return NextResponse.json({ order: toPosOrder(saved) })
})
