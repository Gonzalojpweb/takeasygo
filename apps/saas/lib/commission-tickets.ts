// ============================================================================
// Tickets de comisión — el detalle explicado de cada pedido de una semana
// ============================================================================
// En una transferencia el cliente le transfiere TODO al restaurante. El
// ticket separa qué parte es del restaurante (productos a precio de carta y
// su recargo propio), qué parte es del envío y qué parte es la comisión de
// TakeasyGO, y dice QUIÉN pagó esa comisión.
//
// La explicación "no sale de tu margen: la pagó el cliente" se muestra SOLO
// cuando los datos guardados en el pedido lo prueban. Si el comercio no
// tiene configurado el recargo por transferencia, la comisión no se le
// cobró al cliente y el ticket lo dice con la misma claridad (y cómo
// activarlo). Nunca se afirma algo que el pedido no respalda.
// ============================================================================

import mongoose, { type Types } from 'mongoose'
import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { commissionableFilter, weekBounds } from '@/lib/commission-weeks'

/** Diferencia de redondeo tolerada entre recargo y comisión (1 centavo). */
const ROUNDING_CENTS = 1

export type FeeOrigin =
  /** El cliente la pagó entera vía recargo: no afecta el margen del restaurante. */
  | 'customer'
  /** El cliente pagó una parte; el resto lo cubre el restaurante. */
  | 'shared'
  /** No se le recargó al cliente: la absorbe el restaurante. */
  | 'restaurant'
  /** Pedido anterior al registro del desglose: no se puede afirmar. */
  | 'unknown'

export interface CommissionTicket {
  orderId: string
  orderNumber: string
  createdAt: string
  items: Array<{ name: string; quantity: number; unitCents: number; totalCents: number }>
  /** Productos a precio de carta (con descuentos aplicados). @storedAs cents */
  productsCents: number
  /** @storedAs cents */
  deliveryCents: number
  /** Recargo por uso de la app que pagó el cliente (comisión). @storedAs cents */
  customerFeeCents: number | null
  /** Recargo propio del restaurante (queda en el negocio). @storedAs cents */
  merchantSurchargeCents: number | null
  /** Recargo total cobrado al cliente. @storedAs cents */
  surchargeCents: number
  /** Lo que transfirió el cliente. @storedAs cents */
  totalPaidCents: number
  /** Comisión de TakeasyGO del pedido. @storedAs cents */
  commissionCents: number
  /** De esa comisión, cuánto pagó el cliente / cuánto el restaurante. @storedAs cents */
  paidByCustomerCents: number | null
  paidByRestaurantCents: number | null
  origin: FeeOrigin
  /** Lo que le queda al restaurante después de pagar la comisión. @storedAs cents */
  restaurantKeepsCents: number
  settled: boolean
}

export function feeOriginOf(p: { platformFeeAmount: number; platformFeeCustomerAmount?: number | null; surchargeAmount: number }): {
  origin: FeeOrigin
  byCustomer: number | null
  byRestaurant: number | null
} {
  const fee = p.platformFeeAmount
  if (p.platformFeeCustomerAmount === null || p.platformFeeCustomerAmount === undefined) {
    // Sin desglose guardado: solo es seguro afirmarlo si NO hubo recargo.
    if (p.surchargeAmount === 0) return { origin: 'restaurant', byCustomer: 0, byRestaurant: fee }
    return { origin: 'unknown', byCustomer: null, byRestaurant: null }
  }
  const byCustomer = Math.min(fee, p.platformFeeCustomerAmount)
  const byRestaurant = fee - byCustomer
  if (byRestaurant <= ROUNDING_CENTS) return { origin: 'customer', byCustomer: fee, byRestaurant: 0 }
  if (byCustomer <= 0) return { origin: 'restaurant', byCustomer: 0, byRestaurant: fee }
  return { origin: 'shared', byCustomer, byRestaurant }
}

interface RawOrder {
  _id: Types.ObjectId
  orderNumber: string
  createdAt: Date
  total: number
  deliveryCost?: number | null
  items?: Array<{ name: string; quantity: number; price: number; subtotal: number }>
  payment: {
    baseTotal?: number
    surchargeAmount?: number
    platformFeeAmount: number
    platformFeeCustomerAmount?: number | null
    merchantSurchargeAmount?: number | null
  }
}

export function ticketFromOrder(o: RawOrder, settled: boolean): CommissionTicket {
  const delivery = o.deliveryCost ?? 0
  const surcharge = o.payment.surchargeAmount ?? 0
  const base = o.payment.baseTotal && o.payment.baseTotal > 0 ? o.payment.baseTotal : Math.max(0, o.total - surcharge)
  const { origin, byCustomer, byRestaurant } = feeOriginOf({
    platformFeeAmount: o.payment.platformFeeAmount,
    platformFeeCustomerAmount: o.payment.platformFeeCustomerAmount,
    surchargeAmount: surcharge,
  })
  return {
    orderId: String(o._id),
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    items: (o.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unitCents: i.price, totalCents: i.subtotal })),
    productsCents: Math.max(0, base - delivery),
    deliveryCents: delivery,
    customerFeeCents: o.payment.platformFeeCustomerAmount ?? null,
    merchantSurchargeCents: o.payment.merchantSurchargeAmount ?? null,
    surchargeCents: surcharge,
    totalPaidCents: o.total,
    commissionCents: o.payment.platformFeeAmount,
    paidByCustomerCents: byCustomer,
    paidByRestaurantCents: byRestaurant,
    origin,
    restaurantKeepsCents: o.total - o.payment.platformFeeAmount,
    settled,
  }
}

export interface WeekTickets {
  key: string
  weekStart: string
  weekEnd: string
  dueAt: string
  tickets: CommissionTicket[]
  totals: {
    orders: number
    totalPaidCents: number
    productsCents: number
    deliveryCents: number
    commissionCents: number
    paidByCustomerCents: number
    paidByRestaurantCents: number
    unknownOriginCents: number
    pendingCents: number
  }
}

/** Todos los pedidos con comisión de la semana `key`, con su ticket explicado. */
export async function loadWeekTickets(tenantId: Types.ObjectId | string, key: string, tz: string = DEFAULT_TIMEZONE): Promise<WeekTickets> {
  const { weekStart, weekEnd, dueAt } = weekBounds(key, tz)
  const tid = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId
  const [orders, settlements] = await Promise.all([
    Order.find(commissionableFilter(tid, { createdAt: { $gte: weekStart, $lt: weekEnd } }))
      .select('_id orderNumber createdAt total deliveryCost items.name items.quantity items.price items.subtotal payment.baseTotal payment.surchargeAmount payment.platformFeeAmount payment.platformFeeCustomerAmount payment.merchantSurchargeAmount')
      .sort({ createdAt: 1 })
      .lean<RawOrder[]>(),
    CommissionSettlement.find({ tenantId: tid }).select('orderIds').lean<Array<{ orderIds?: string[] }>>(),
  ])
  const settledIds = new Set(settlements.flatMap((s) => (s.orderIds ?? []).map(String)))
  const tickets = orders.map((o) => ticketFromOrder(o, settledIds.has(String(o._id))))
  const sum = (f: (t: CommissionTicket) => number) => tickets.reduce((s, t) => s + f(t), 0)
  return {
    key,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    dueAt: dueAt.toISOString(),
    tickets,
    totals: {
      orders: tickets.length,
      totalPaidCents: sum((t) => t.totalPaidCents),
      productsCents: sum((t) => t.productsCents),
      deliveryCents: sum((t) => t.deliveryCents),
      commissionCents: sum((t) => t.commissionCents),
      paidByCustomerCents: sum((t) => t.paidByCustomerCents ?? 0),
      paidByRestaurantCents: sum((t) => t.paidByRestaurantCents ?? 0),
      unknownOriginCents: sum((t) => (t.origin === 'unknown' ? t.commissionCents : 0)),
      pendingCents: sum((t) => (t.settled ? 0 : t.commissionCents)),
    },
  }
}
