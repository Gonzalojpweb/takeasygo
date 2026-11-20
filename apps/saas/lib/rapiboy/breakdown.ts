// ============================================================================
// Desglose de envíos Rapiboy (superadmin)
// ============================================================================
// Cómo se reparte lo que paga el cliente por un envío Rapiboy:
//
//   Envío cobrado al cliente = costo Rapiboy (cotizado en el checkout)
//                            + comisión de envío TakeasyGO (% de la sede)
//                            + colchón (solo transferencia)
//
//  · La comisión de envío de TakeasyGO queda FIJA en el checkout y se cobra
//    junto con la comisión del pedido: en Mercado Pago, dentro del split
//    (marketplace_fee); en transferencia/efectivo, en el saldo semanal.
//  · Rapiboy le factura al comercio (el token es de la sede). El costo real
//    del viaje se conoce al pedir el repartidor; si baja o sobra colchón, la
//    diferencia es del comercio; si sube, la absorbe el comercio (o el cliente
//    si acepta el precio nuevo). TakeasyGO nunca pone plata.
// ============================================================================

export interface RapiboyOrderLike {
  _id: unknown
  tenantId: unknown
  orderNumber: string
  createdAt: Date
  status: string
  deliveryCost?: number | null
  payment?: {
    method?: string | null
    status?: string | null
    platformFeeAmount?: number | null
    deliveryPlatformFeeAmount?: number | null
    mercadopagoId?: string | null
  } | null
  deliveryProvider?: {
    rapiboy?: {
      checkoutCost?: number | null
      quotedCost?: number | null
      tripId?: string | null
      transferBuffer?: number | null
      platformFeePercent?: number | null
      quoteStatus?: string | null
      phase?: string | null
    } | null
  } | null
}

export type CollectionChannel = 'mp_split' | 'weekly_balance' | 'not_collected'

export interface RapiboyBreakdownRow {
  orderId: string
  orderNumber: string
  createdAt: string
  tenantName: string
  tenantSlug: string
  orderStatus: string
  paymentMethod: string
  paymentStatus: string
  /** Envío que pagó el cliente. @storedAs cents */
  deliveryChargedCents: number
  /** Costo de Rapiboy cotizado en el checkout. @storedAs cents */
  rapiboyQuotedCents: number
  /** Costo real del viaje (al pedir el repartidor); null si todavía no se pidió. @storedAs cents */
  rapiboyActualCents: number | null
  /** Colchón de transferencia. @storedAs cents */
  bufferCents: number
  /** Comisión de envío de TakeasyGO. @storedAs cents */
  deliveryFeeCents: number
  deliveryFeePercent: number
  /** Comisión de TakeasyGO sobre el pedido (productos + envío). @storedAs cents */
  orderFeeCents: number
  /** Comisión total de TakeasyGO = pedido + envío. @storedAs cents */
  totalFeeCents: number
  /**
   * Lo que le queda al comercio del envío después de pagar a Rapiboy y la
   * comisión de envío. Negativo = el comercio absorbió una suba. @storedAs cents
   */
  merchantDeliveryResultCents: number
  collection: CollectionChannel
}

export interface RapiboyBreakdown {
  rows: RapiboyBreakdownRow[]
  totals: {
    orders: number
    deliveryChargedCents: number
    rapiboyCents: number
    bufferCents: number
    deliveryFeeCents: number
    orderFeeCents: number
    totalFeeCents: number
    merchantDeliveryResultCents: number
    viaMpSplitCents: number
    viaWeeklyBalanceCents: number
    notCollectedCents: number
  }
}

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Cómo le llega a TakeasyGO la comisión del pedido. */
export function collectionChannelOf(o: RapiboyOrderLike): CollectionChannel {
  if (o.status === 'cancelled' || o.payment?.status === 'cancelled' || o.payment?.status === 'refunded') return 'not_collected'
  const method = o.payment?.method ?? ''
  if (method === 'mercadopago' || method === 'kripton') {
    return o.payment?.status === 'approved' ? 'mp_split' : 'not_collected'
  }
  if (method === 'transfer' || method === 'cash') return 'weekly_balance'
  return 'not_collected'
}

export function breakdownRow(o: RapiboyOrderLike, tenant?: { name: string; slug: string }): RapiboyBreakdownRow {
  const r = o.deliveryProvider?.rapiboy ?? {}
  const charged = n(o.deliveryCost)
  const quoted = n(r.checkoutCost) || n(r.quotedCost)
  const actual = r.tripId ? (n(r.quotedCost) || quoted) : null
  const deliveryFee = n(o.payment?.deliveryPlatformFeeAmount)
  const totalFee = n(o.payment?.platformFeeAmount)
  return {
    orderId: String(o._id),
    orderNumber: o.orderNumber,
    createdAt: new Date(o.createdAt).toISOString(),
    tenantName: tenant?.name ?? '—',
    tenantSlug: tenant?.slug ?? '',
    orderStatus: o.status,
    paymentMethod: o.payment?.method ?? '',
    paymentStatus: o.payment?.status ?? '',
    deliveryChargedCents: charged,
    rapiboyQuotedCents: quoted,
    rapiboyActualCents: actual,
    bufferCents: n(r.transferBuffer),
    deliveryFeeCents: deliveryFee,
    deliveryFeePercent: n(r.platformFeePercent),
    orderFeeCents: Math.max(0, totalFee - deliveryFee),
    totalFeeCents: totalFee,
    merchantDeliveryResultCents: charged - deliveryFee - (actual ?? quoted),
    collection: collectionChannelOf(o),
  }
}

export function buildRapiboyBreakdown(
  orders: RapiboyOrderLike[],
  tenants: Map<string, { name: string; slug: string }>,
): RapiboyBreakdown {
  const rows = orders.map((o) => breakdownRow(o, tenants.get(String(o.tenantId))))
  const sum = (f: (r: RapiboyBreakdownRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  return {
    rows,
    totals: {
      orders: rows.length,
      deliveryChargedCents: sum((r) => r.deliveryChargedCents),
      rapiboyCents: sum((r) => r.rapiboyActualCents ?? r.rapiboyQuotedCents),
      bufferCents: sum((r) => r.bufferCents),
      deliveryFeeCents: sum((r) => r.deliveryFeeCents),
      orderFeeCents: sum((r) => r.orderFeeCents),
      totalFeeCents: sum((r) => r.totalFeeCents),
      merchantDeliveryResultCents: sum((r) => r.merchantDeliveryResultCents),
      viaMpSplitCents: sum((r) => (r.collection === 'mp_split' ? r.totalFeeCents : 0)),
      viaWeeklyBalanceCents: sum((r) => (r.collection === 'weekly_balance' ? r.totalFeeCents : 0)),
      notCollectedCents: sum((r) => (r.collection === 'not_collected' ? r.totalFeeCents : 0)),
    },
  }
}
