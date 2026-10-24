import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import type { PosOrderDoc } from '@/lib/pos-online/orderRepo'
import { findPosTable, assertTablePosId } from '@/lib/pos-online/tableRepo'
import { distributeCents, grossOf, parseDiscountInput, type DiscountedItem } from '@/lib/pos-online/discounts'
import { applyOrderDiscount, approveDiscount, removeOrderDiscount } from '@/lib/pos-online/discountService'

// ============================================================================
// POST   /api/[tenant]/pos/tables/[id]/discount — descuento a TODA la cuenta
//        de la mesa (Fase D). { kind, value, reason, note? }
//        · %     → el mismo % en cada ronda sin cobrar.
//        · monto → se reparte entre las rondas en proporción a su importe
//                  (al centavo); dentro de cada ronda, entre sus platos.
// DELETE /api/[tenant]/pos/tables/[id]/discount — quita los descuentos de
//        todas las rondas sin cobrar de la mesa.
// Un solo PIN de encargado autoriza el descuento completo.
// ============================================================================

async function openRounds(ctx: { tenantId: string; locationId: string }, tableId: string): Promise<PosOrderDoc[]> {
  const docs = await Order.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posTableId: tableId,
    status: { $nin: ['delivered', 'cancelled'] },
    voided: { $exists: false },
    $or: [{ posPayments: { $exists: false } }, { posPayments: { $size: 0 } }],
  })
    .sort({ createdAt: 1 })
    .lean()
    .exec()
  return docs as unknown as PosOrderDoc[]
}

export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const tableId = assertTablePosId(id)
  await findPosTable(ctx, tableId)
  const input = parseDiscountInput(await readPosBody(ctx.request))
  const rounds = await openRounds(ctx, tableId)
  if (rounds.length === 0) throw PosError.conflict('La mesa no tiene nada sin cobrar')

  const approval = await approveDiscount(ctx)
  const weights = rounds.map((o) => (o.items as DiscountedItem[]).reduce((s, i) => s + grossOf(i), 0))
  const shares = input.kind === 'amount' ? distributeCents(weights, input.value) : null

  const orders: ReturnType<typeof toPosOrder>[] = []
  let discountedCents = 0
  for (const [i, round] of rounds.entries()) {
    if (shares && shares[i] <= 0) continue
    const res = await applyOrderDiscount(
      ctx,
      round,
      shares ? { ...input, value: shares[i] } : input,
      null,
      approval
    )
    discountedCents += res.discountedCents
    orders.push(toPosOrder(res.order))
  }
  return NextResponse.json({ orders, discountedCents })
})

export const DELETE = posRoute('orders.pay', async (ctx, { id }) => {
  const tableId = assertTablePosId(id)
  await findPosTable(ctx, tableId)
  const rounds = await openRounds(ctx, tableId)
  const orders: ReturnType<typeof toPosOrder>[] = []
  for (const round of rounds) orders.push(toPosOrder(await removeOrderDiscount(ctx, round, null)))
  return NextResponse.json({ orders })
})
