/**
 * Fuente única de verdad para las cifras del reporte consolidado (Excel y PDF).
 *
 * Regla de facturación ("lo que sí factura"):
 *   una orden FACTURA si y solo si:
 *     - su estado de orden NO es 'cancelled' ni 'awaiting_payment', y
 *     - su estado de pago NO es 'rejected' ni 'cancelled'.
 *
 * Es decir: una orden cancelada NO suma; una orden que quedó activa pero cuyo
 * pago MercadoPago/Kripton fue rechazado o cancelado TAMPOCO suma (es ingreso
 * fantasma y era el bug que inflaba los reportes de tenants con MP activo); y
 * una orden todavía esperando que el cliente pague (awaiting_payment) tampoco
 * factura — se reporta aparte.
 *
 * Los pagos todavía 'pending' en órdenes ya confirmadas SÍ facturan (son
 * ventas entregadas en curso de cobro) pero se reportan aparte como "pago
 * pendiente de confirmar" para que nada quede oculto.
 *
 * Todos los montos se manejan en centavos. La conversión a pesos se hace en la
 * capa de presentación (Excel/PDF).
 */

export interface ReportOrderLike {
  status: string
  total: number
  createdAt: Date | string
  items?: { name: string; quantity: number; subtotal: number }[]
  payment?: {
    method?: string | null
    status?: string | null
    baseTotal?: number | null
    surchargeAmount?: number | null
    platformFeeAmount?: number | null
  } | null
}

export interface ReportMethodRow {
  method: string
  orders: number
  /** centavos — suma de o.total (incluye recargo) */
  gross: number
  /** centavos — precio de lista (baseTotal) */
  net: number
  /** centavos — recargo por método de pago (ej. MP) */
  surcharge: number
  /** centavos — comisión TakeasyGO registrada en la orden */
  platformFee: number
  /**
   * centavos — lo que queda al restaurante por este método, antes de la
   * comisión de transferencia que se paga aparte desde el panel:
   *   - mercadopago/kripton: gross − platformFee (la comisión se cobra sola)
   *   - transfer: gross (el restaurante recibió el total; adeuda la comisión)
   *   - resto (efectivo, etc.): gross
   */
  netToRestaurant: number
}

export interface ReportDailyRow {
  /** fecha local 'dd/mm/yyyy' */
  date: string
  orders: number
  gross: number
}

export interface ReportStats {
  totalOrders: number
  /** órdenes que facturan (no canceladas/awaiting y pago no rechazado/cancelado) */
  billedOrders: number
  /** órdenes con estado de orden 'cancelled' — no facturan */
  cancelledOrders: number
  /** órdenes activas con pago rechazado/cancelado — no facturan (ingreso fantasma) */
  rejectedPaymentOrders: number
  /** órdenes esperando que el cliente pague (awaiting_payment) — no facturan */
  awaitingPaymentOrders: number
  /** órdenes facturadas cuyo pago sigue 'pending' — por confirmar cobro */
  pendingPaymentOrders: number

  /** centavos */
  grossRevenue: number
  netRevenue: number
  surchargeRevenue: number
  avgTicketGross: number
  avgTicketNet: number

  /** centavos que NO entraron a ingresos */
  cancelledAmount: number
  rejectedAmount: number
  awaitingPaymentAmount: number
  pendingPaymentAmount: number

  /**
   * centavos — comisiones TakeasyGO de mercadopago + kripton: se cobran
   * automáticamente con cada pago (marketplace_fee), siempre 100% cobradas.
   */
  autoCollectedFee: number

  methods: ReportMethodRow[]
  daily: ReportDailyRow[]
  topItems: { name: string; quantity: number; revenue: number }[]
}

/** Método de pago: ¿es de los que se cobran solos (MP/Kripton)? */
export function isAutoCollectedMethod(method: string): boolean {
  return method === 'mercadopago' || method === 'kripton'
}

function isRejectedPayment(status: string | null | undefined): boolean {
  return status === 'rejected' || status === 'cancelled'
}

/** ¿La orden factura bajo la regla del reporte? */
export function isBilledOrder(o: ReportOrderLike): boolean {
  if (o.status === 'cancelled') return false
  if (o.status === 'awaiting_payment') return false
  if (isRejectedPayment(o.payment?.status)) return false
  return true
}

/**
 * Calcula todas las cifras del reporte a partir de las órdenes crudas.
 * Puro y sin I/O — compartido por la ruta Excel y el PDF del cliente para que
 * ambos formatos muestren exactamente los mismos números.
 *
 * @param timezone zona IANA del restaurante para agrupar por día
 *                (ej. 'America/Argentina/Buenos_Aires')
 */
export function buildReportStats(
  orders: ReportOrderLike[],
  timezone: string,
): ReportStats {
  const totalOrders = orders.length

  let billedOrders = 0
  let cancelledOrders = 0
  let rejectedPaymentOrders = 0
  let awaitingPaymentOrders = 0
  let pendingPaymentOrders = 0

  let grossRevenue = 0
  let netRevenue = 0
  let surchargeRevenue = 0
  let cancelledAmount = 0
  let rejectedAmount = 0
  let awaitingPaymentAmount = 0
  let pendingPaymentAmount = 0
  let autoCollectedFee = 0

  const methodMap = new Map<string, ReportMethodRow>()
  const dailyMap = new Map<string, { orders: number; gross: number }>()
  const itemMap = new Map<string, { quantity: number; revenue: number }>()

  const getMethodRow = (method: string): ReportMethodRow => {
    let row = methodMap.get(method)
    if (!row) {
      row = { method, orders: 0, gross: 0, net: 0, surcharge: 0, platformFee: 0, netToRestaurant: 0 }
      methodMap.set(method, row)
    }
    return row
  }

  for (const o of orders) {
    if (o.status === 'cancelled') {
      cancelledOrders++
      cancelledAmount += o.total
      continue
    }
    if (o.status === 'awaiting_payment') {
      awaitingPaymentOrders++
      awaitingPaymentAmount += o.total
      continue
    }
    if (isRejectedPayment(o.payment?.status)) {
      rejectedPaymentOrders++
      rejectedAmount += o.total
      continue
    }

    // ── Orden facturada ────────────────────────────────────────────────
    billedOrders++
    grossRevenue += o.total

    const baseTotal = o.payment?.baseTotal ?? o.total
    const surcharge = o.payment?.surchargeAmount ?? 0
    const fee = o.payment?.platformFeeAmount ?? 0
    const method = o.payment?.method || 'desconocido'

    netRevenue += baseTotal
    surchargeRevenue += surcharge

    if (o.payment?.status === 'pending') {
      pendingPaymentOrders++
      pendingPaymentAmount += o.total
    }

    if (isAutoCollectedMethod(method)) {
      autoCollectedFee += fee
    }

    const row = getMethodRow(method)
    row.orders++
    row.gross += o.total
    row.net += baseTotal
    row.surcharge += surcharge
    row.platformFee += fee
    row.netToRestaurant += isAutoCollectedMethod(method) ? o.total - fee : o.total

    // Por día (hora local del restaurante)
    const day = new Date(o.createdAt).toLocaleDateString('es-AR', { timeZone: timezone })
    const dayRow = dailyMap.get(day) || { orders: 0, gross: 0 }
    dayRow.orders++
    dayRow.gross += o.total
    dailyMap.set(day, dayRow)

    // Items (solo facturadas)
    for (const item of o.items || []) {
      const it = itemMap.get(item.name) || { quantity: 0, revenue: 0 }
      it.quantity += item.quantity
      it.revenue += item.subtotal
      itemMap.set(item.name, it)
    }
  }

  const methods = Array.from(methodMap.values()).sort((a, b) => b.gross - a.gross)

  // Ítems más vendidos: por cantidad, desempate por ingresos
  const topItems = Array.from(itemMap.entries())
    .map(([name, d]) => ({ name, quantity: d.quantity, revenue: d.revenue }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)

  return {
    totalOrders,
    billedOrders,
    cancelledOrders,
    rejectedPaymentOrders,
    awaitingPaymentOrders,
    pendingPaymentOrders,
    grossRevenue,
    netRevenue,
    surchargeRevenue,
    avgTicketGross: billedOrders > 0 ? grossRevenue / billedOrders : 0,
    avgTicketNet: billedOrders > 0 ? netRevenue / billedOrders : 0,
    cancelledAmount,
    rejectedAmount,
    awaitingPaymentAmount,
    pendingPaymentAmount,
    autoCollectedFee,
    methods,
    daily: Array.from(dailyMap.entries()).map(([date, d]) => ({ date, orders: d.orders, gross: d.gross })),
    topItems,
  }
}
