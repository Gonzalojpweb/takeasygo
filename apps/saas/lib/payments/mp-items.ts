// ============================================================================
// Ítems de la preferencia de Mercado Pago a partir del pedido (en centavos)
// ============================================================================
// Bug 14/11/2026 (Keke Larry, combos con 0 ventas): un combo se guarda como
// una línea con el precio + una línea a $0 por cada plato que lo compone
// (para cocina y ticket). Esas líneas viajaban a Mercado Pago con
// unit_price 0, MP rechazaba la preferencia, el servidor cancelaba el pedido
// y el cliente veía un error justo al pagar. Lo mismo con premios del club ($0).
//
// Reglas:
//   · Nunca se manda a MP una línea sin precio: no suma al total y MP la rechaza.
//   · Descuento QR: solo sobre lo que no es promoción ni combo ni tiene
//     descuento de categoría (la misma regla que usa orders/route.ts para
//     calcularlo).
//   · El delivery nunca se descuenta.
// La distribución del recargo y la conversión a pesos siguen en la ruta.
// ============================================================================

export interface MpOrderItem {
  _id?: unknown
  menuItemId?: unknown
  name: string
  quantity: number
  price: number
  subtotal: number
  itemType?: string
  hasCategoryDiscount?: boolean
  comboComponent?: boolean
}

export interface MpOrderLike {
  items: MpOrderItem[]
  qrPromoApplied?: boolean
  discountAmount?: number
  orderMode?: string
  deliveryCost?: number
}

export interface MpItem {
  id: string
  title: string
  quantity: number
  /** En centavos hasta la conversión final. */
  unit_price: number
  currency_id: 'ARS'
}

const idOf = (item: MpOrderItem) => String(item.menuItemId ?? item._id ?? item.name)

/** Líneas que se cobran: con precio y que no son parte interna de un combo. */
export function billableItems(items: MpOrderItem[]): MpOrderItem[] {
  return items.filter((i) => !i.comboComponent && (Number(i.price) || 0) > 0 && i.quantity > 0)
}

export function buildMpItems(order: MpOrderLike): MpItem[] {
  const items = billableItems(order.items)
  const out: MpItem[] = []
  const push = (item: MpOrderItem, unitPrice: number) =>
    out.push({ id: idOf(item), title: item.name, quantity: item.quantity, unit_price: unitPrice, currency_id: 'ARS' })

  const discount = order.discountAmount ?? 0
  if (order.qrPromoApplied && discount > 0) {
    const eligible = items.filter((i) => !['promotion', 'combo'].includes(i.itemType ?? '') && !i.hasCategoryDiscount)
    const rest = items.filter((i) => !eligible.includes(i))
    const eligibleSubtotal = eligible.reduce((sum, i) => sum + i.subtotal, 0)
    const target = eligibleSubtotal - discount
    const ratio = eligibleSubtotal > 0 ? target / eligibleSubtotal : 0
    let acc = 0
    eligible.forEach((item, idx) => {
      if (idx === eligible.length - 1) {
        // Ajuste fino: la suma coincide exactamente con el total con descuento.
        push(item, Math.ceil((target - acc) / item.quantity))
      } else {
        const p = Math.ceil(item.price * ratio)
        acc += p * item.quantity
        push(item, p)
      }
    })
    for (const item of rest) push(item, item.price)
  } else {
    for (const item of items) push(item, item.price)
  }

  if (order.orderMode === 'delivery' && (order.deliveryCost ?? 0) > 0) {
    out.push({ id: 'delivery_fee', title: 'Costo de envío', quantity: 1, unit_price: order.deliveryCost!, currency_id: 'ARS' })
  }
  return out
}
