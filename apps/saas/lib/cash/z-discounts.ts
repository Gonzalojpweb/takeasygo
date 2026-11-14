import mongoose from 'mongoose'
import Order from '@/models/Order'
import { TIP_RELATED_SUFFIX, summarizeDiscountsByReason } from '@takeasygo/business'
import type { CashMovement, ZDiscountSummary } from '@takeasygo/types'

// ============================================================================
// Descuentos del turno para el Z (14/11/2026)
// ============================================================================
// Ventas del turno = órdenes con movimiento de venta en ESTA caja
// (relatedOrderId = posId, o `posId#i` si el cobro tuvo varias partes; las
// propinas `posId:tip` no son ventas). Se excluyen las anuladas: su venta se
// devolvió. Informativo: no cambia arqueo, ventas ni ningún total de caja.
// null si en el turno no hubo ventas con descuento (el Z no cambia).
// ============================================================================

interface DiscountedOrderRow {
  items?: {
    basePrice?: number
    extraPrice?: number
    quantity?: number
    posDiscount?: { amountCents?: number; reason?: string } | null
  }[]
}

/** posId de cada venta registrada en la caja. */
export function saleOrderKeys(movements: Pick<CashMovement, 'type' | 'relatedOrderId'>[]): string[] {
  const keys = new Set<string>()
  for (const m of movements) {
    if (m.type !== 'sale' || typeof m.relatedOrderId !== 'string') continue
    if (m.relatedOrderId.endsWith(TIP_RELATED_SUFFIX)) continue
    const key = m.relatedOrderId.split('#')[0]
    if (key) keys.add(key)
  }
  return Array.from(keys)
}

export async function discountSummaryForRegister(input: {
  tenantId: string
  locationId: string
  movements: Pick<CashMovement, 'type' | 'relatedOrderId'>[]
}): Promise<ZDiscountSummary | null> {
  const keys = saleOrderKeys(input.movements)
  if (keys.length === 0) return null
  const orders = await Order.find({
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    locationId: new mongoose.Types.ObjectId(input.locationId),
    posId: { $in: keys },
    voided: { $exists: false },
    'items.posDiscount.amountCents': { $gt: 0 },
  })
    .select('items.basePrice items.extraPrice items.quantity items.posDiscount.amountCents items.posDiscount.reason')
    .lean<DiscountedOrderRow[]>()
  return summarizeDiscountsByReason(
    orders.map((o) => ({
      grossCents: (o.items ?? []).reduce((s, i) => s + ((i.basePrice ?? 0) + (i.extraPrice ?? 0)) * (i.quantity ?? 0), 0),
      lines: (o.items ?? [])
        .filter((i) => (i.posDiscount?.amountCents ?? 0) > 0)
        .map((i) => ({ reason: i.posDiscount?.reason ?? 'other', cents: i.posDiscount!.amountCents! })),
    }))
  )
}
