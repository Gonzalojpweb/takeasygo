import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosTable, assertTablePosId } from '@/lib/pos-online/tableRepo'
import { parseDiscountInput } from '@/lib/pos-online/discounts'
import { discountTable, removeTableDiscounts } from '@/lib/pos-online/discountService'

// ============================================================================
// POST   /api/[tenant]/pos/tables/[id]/discount — descuento a TODA la cuenta
//        de la mesa (Fase D). { kind, value, reason, note?, finalCents? }
//        · %     → el mismo % en cada ronda sin cobrar.
//        · monto → se reparte entre las rondas en proporción a su importe
//                  (al centavo); dentro de cada ronda, entre sus platos.
// DELETE /api/[tenant]/pos/tables/[id]/discount — quita los descuentos de
//        todas las rondas sin cobrar de la mesa.
// La política se evalúa sobre la cuenta completa: un solo PIN autoriza todo.
// ============================================================================

export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const tableId = assertTablePosId(id)
  await findPosTable(ctx, tableId)
  const input = parseDiscountInput(await readPosBody(ctx.request))
  const { orders, discountedCents } = await discountTable(ctx, tableId, input)
  return NextResponse.json({ orders: orders.map(toPosOrder), discountedCents })
})

export const DELETE = posRoute('orders.pay', async (ctx, { id }) => {
  const tableId = assertTablePosId(id)
  await findPosTable(ctx, tableId)
  const orders = await removeTableDiscounts(ctx, tableId)
  return NextResponse.json({ orders: orders.map(toPosOrder) })
})
