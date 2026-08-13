import Order from '@/models/Order'
import { toPesos } from '@takeasygo/business'

export interface PreCloseData {
  locationName: string
  from: string
  to: string
  generatedAt: string
  totalOrders: number
  totalRevenue: number
  totalNetRevenue: number
  totalSurcharge: number
  avgTicket: number
  avgTicketNet: number
  topItems: { name: string; quantity: number; revenue: number }[]
  promoCount: number
  promoItemsSold: number
  totalDiscounts: number
  deliveryCount: number
  deliveryCosts: number
  deliveryRevenue: number
  takeawayCount: number
  takeawayRevenue: number
  dineinCount: number
  dineinRevenue: number
  cancelledCount: number
  cancelledAmount: number
  paymentApproved: number
  paymentPending: number
  paymentRejected: number
  paymentMethodBreakdown: { method: string; orders: number; revenue: number }[]
}

export async function aggregateOrdersForRange(
  tenantId: string,
  locationId: string,
  from: Date,
  to: Date,
  locationName: string
): Promise<PreCloseData> {
  const allOrders = await Order.find({
    tenantId,
    locationId,
    deletedAt: null,
    createdAt: { $gte: from, $lte: to },
  }).lean()

  const active = allOrders.filter(o => o.status !== 'cancelled')
  const cancelled = allOrders.filter(o => o.status === 'cancelled')

  const totalRevenue = active.reduce((s, o) => s + o.total, 0)
  const totalNetRevenue = active.reduce((s, o) => s + (o.payment?.baseTotal || o.total), 0)
  const totalSurcharge = active.reduce((s, o) => s + (o.payment?.surchargeAmount || 0), 0)
  const cancelledAmount = cancelled.reduce((s, o) => s + o.total, 0)

  const deliveryOrders = active.filter(o => o.orderMode === 'delivery')
  const takeawayOrders = active.filter(o => o.orderMode === 'takeaway')
  const dineinOrders = active.filter(o => o.orderMode === 'dine-in' || o.orderMode === 'business')

  const deliveryCosts = deliveryOrders.reduce((s, o) => s + (o.deliveryCost || 0), 0)
  const deliveryRevenue = deliveryOrders.reduce((s, o) => s + o.total, 0)
  const takeawayRevenue = takeawayOrders.reduce((s, o) => s + o.total, 0)
  const dineinRevenue = dineinOrders.reduce((s, o) => s + o.total, 0)

  const itemMap: Record<string, { quantity: number; revenue: number }> = {}
  let promoItemsSold = 0
  let promoCount = 0
  let totalDiscounts = 0

  for (const order of active) {
    totalDiscounts += order.discountAmount || 0
    for (const item of order.items) {
      if (item.itemType === 'promotion') {
        promoCount++
        promoItemsSold += item.quantity
      }
      if (!itemMap[item.name]) {
        itemMap[item.name] = { quantity: 0, revenue: 0 }
      }
      itemMap[item.name].quantity += item.quantity
      itemMap[item.name].revenue += item.subtotal
    }
  }

  const topItems = Object.entries(itemMap)
    .sort((a, b) => b[1].quantity - a[1].quantity)
    .slice(0, 10)
    .map(([name, data]) => ({ name, ...data }))

  const paymentApproved = active.filter(o => o.payment?.status === 'approved').length
  const paymentPending = active.filter(o => o.payment?.status === 'pending').length
  const paymentRejected = active.filter(o => o.payment?.status === 'rejected').length

  // Payment method breakdown
  const methodMap: Record<string, { orders: number; revenue: number }> = {}
  for (const o of active) {
    const m = o.payment?.method || 'desconocido'
    if (!methodMap[m]) methodMap[m] = { orders: 0, revenue: 0 }
    methodMap[m].orders++
    methodMap[m].revenue += o.total
  }
  const paymentMethodBreakdown = Object.entries(methodMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([method, data]) => ({ method, ...data }))

  return {
    locationName,
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    totalOrders: active.length,
    totalRevenue,
    totalNetRevenue,
    totalSurcharge,
    avgTicket: active.length > 0 ? Math.round(totalRevenue / active.length) : 0,
    avgTicketNet: active.length > 0 ? Math.round(totalNetRevenue / active.length) : 0,
    topItems,
    promoCount,
    promoItemsSold,
    totalDiscounts,
    deliveryCount: deliveryOrders.length,
    deliveryCosts,
    deliveryRevenue,
    takeawayCount: takeawayOrders.length,
    takeawayRevenue,
    dineinCount: dineinOrders.length,
    dineinRevenue,
    cancelledCount: cancelled.length,
    cancelledAmount,
    paymentApproved,
    paymentPending,
    paymentRejected,
    paymentMethodBreakdown,
  }
}

// ── ESC/POS helpers mirrored from agent.js ──────────────────────────────

const ESC_POS = {
  INIT:          Buffer.from([0x1b, 0x40]),
  CODE_PAGE:     Buffer.from([0x1b, 0x74, 43]), // CP858 (Latin-1 + Euro)
  CUT:           Buffer.from([0x1d, 0x56, 0x01]),
  BOLD_ON:       Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF:      Buffer.from([0x1b, 0x45, 0x00]),
  ALIGN_LEFT:    Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_CENTER:  Buffer.from([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT:   Buffer.from([0x1b, 0x61, 0x02]),
  SIZE_NORMAL:   Buffer.from([0x1d, 0x21, 0x00]),
  SIZE_LARGE:    Buffer.from([0x1d, 0x21, 0x11]),
}

const SANITIZE_MAP: Record<string, string> = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
  'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U',
  '¿': '', '¡': '', '€': 'EUR', 'º': 'o', 'ª': 'a',
}

const NON_LATIN1_RE = /[^\x00-\xFF]/g

function sanitize(str: string): string {
  return str.replace(NON_LATIN1_RE, '')
    .replace(/[áéíóúÁÉÍÓÚñÑüÜ¿¡€ºª]/g, c => SANITIZE_MAP[c] || c)
}

function buf(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input
  return Buffer.from(sanitize(input), 'latin1')
}

function money(v: number): string {
  return toPesos(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateRange(isoFrom: string, isoTo: string): string {
  const f = new Date(isoFrom)
  const t = new Date(isoTo)
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
  return `${f.toLocaleDateString('es-AR', opts)} -> ${t.toLocaleDateString('es-AR', opts)}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function buildPreCloseBuffer(data: PreCloseData, columns: number = 32): string {
  const chunks: Buffer[] = []

  chunks.push(ESC_POS.INIT, ESC_POS.CODE_PAGE)
  chunks.push(ESC_POS.ALIGN_CENTER)

  // Line spacing
  chunks.push(Buffer.from([0x1b, 0x33, 36]))

  // Header
  chunks.push(ESC_POS.SIZE_LARGE, ESC_POS.BOLD_ON)
  chunks.push(buf(`${sanitize(data.locationName.toUpperCase())}\n`))
  chunks.push(buf(`CIERRE DE TURNO\n`))
  chunks.push(ESC_POS.SIZE_NORMAL, ESC_POS.BOLD_OFF)

  const lineStr = '-'.repeat(columns)
  const doubleLine = '='.repeat(columns)

  chunks.push(buf(`\n${doubleLine}\n`))
  chunks.push(ESC_POS.ALIGN_LEFT)

  // Date range
  chunks.push(ESC_POS.BOLD_ON)
  chunks.push(buf(`Periodo:\n`))
  chunks.push(ESC_POS.BOLD_OFF)
  chunks.push(buf(`  ${formatDateRange(data.from, data.to)}\n`))
  chunks.push(buf(`  Hora: ${formatTime(data.generatedAt)}\n`))
  chunks.push(buf(`\n${lineStr}\n`))

  // ── Summary ──────────────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
  chunks.push(buf(`RESUMEN GENERAL\n`))
  chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)
  chunks.push(buf(`\n`))

  function line(label: string, value: string) {
    const text = `${label}: `
    const dots = '.'.repeat(Math.max(1, columns - text.length - value.length))
    chunks.push(buf(`${text}${dots}${value}\n`))
  }

  line('Total ordenes', data.totalOrders.toString())
  line('Ingreso bruto', `$${money(data.totalRevenue)}`)
  line('Ingreso neto', `$${money(data.totalNetRevenue)}`)
  if (data.totalSurcharge > 0) {
    line('Recargos MP', `$${money(data.totalSurcharge)}`)
  }
  line('Ticket promedio bruto', `$${money(data.avgTicket)}`)
  line('Ticket promedio neto', `$${money(data.avgTicketNet)}`)
  line('Ordenes canceladas', data.cancelledCount.toString())
  if (data.cancelledCount > 0) {
    line('  Monto cancelado', `$${money(data.cancelledAmount)}`)
  }

  chunks.push(buf(`\n${lineStr}\n`))

  // ── Payment summary ──────────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
  chunks.push(buf(`PAGOS\n`))
  chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)

  line('Aprobados', data.paymentApproved.toString())
  line('Pendientes', data.paymentPending.toString())
  line('Rechazados', data.paymentRejected.toString())

  // ── Payment method breakdown ──────────────────────────────────────────
  if (data.paymentMethodBreakdown.length > 0) {
    chunks.push(buf(`\n${lineStr}\n`))
    chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
    chunks.push(buf(`FORMA DE PAGO\n`))
    chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)

    const methodLabels: Record<string, string> = {
      mercadopago: 'Mercado Pago',
      kripton: 'Kripton',
      transfer: 'Transferencia',
    }

    for (const m of data.paymentMethodBreakdown) {
      const label = methodLabels[m.method] || m.method
      const value = `${m.orders}u  $${money(m.revenue)}`
      const text = `  ${label}`
      const dots = '.'.repeat(Math.max(1, columns - text.length - value.length))
      chunks.push(buf(`${text}${dots}${value}\n`))
    }
  }

  chunks.push(buf(`\n${lineStr}\n`))

  // ── Top 10 Items ─────────────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
  chunks.push(buf(`PRODUCTOS MAS VENDIDOS\n`))
  chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)

  if (data.topItems.length === 0) {
    chunks.push(buf(`  Sin ventas en el periodo\n`))
  } else {
    data.topItems.forEach((item, i) => {
      const rank = `${i + 1}.`
      const name = sanitize(item.name)
      const rest = `${item.quantity}u  $${money(item.revenue)}`
      const lineText = `${rank} ${name}`
      const dots = '.'.repeat(Math.max(1, columns - lineText.length - rest.length))
      chunks.push(buf(`${lineText}${dots}${rest}\n`))
    })
  }

  chunks.push(buf(`\n${lineStr}\n`))

  // ── Promociones ──────────────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
  chunks.push(buf(`PROMOCIONES\n`))
  chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)

  line('Pedidos con promo', data.promoCount.toString())
  line('Items en promo', data.promoItemsSold.toString())

  chunks.push(buf(`\n${lineStr}\n`))

  // ── Discounts ────────────────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
  chunks.push(buf(`DESCUENTOS\n`))
  chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)

  line('Total descontado', `$${money(data.totalDiscounts)}`)

  chunks.push(buf(`\n${lineStr}\n`))

  // ── Delivery & Takeaway ─────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON)
  chunks.push(buf(`MODO DE ENTREGA\n`))
  chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT)

  line('Delivery pedidos', data.deliveryCount.toString())
  line('Delivery ingresos', `$${money(data.deliveryRevenue)}`)
  line('Delivery costo', `$${money(data.deliveryCosts)}`)
  chunks.push(buf(`\n`))
  line('TakeAway pedidos', data.takeawayCount.toString())
  line('TakeAway ingresos', `$${money(data.takeawayRevenue)}`)
  if (data.dineinCount > 0) {
    chunks.push(buf(`\n`))
    line('En local pedidos', data.dineinCount.toString())
    line('En local ingresos', `$${money(data.dineinRevenue)}`)
  }

  chunks.push(buf(`\n${doubleLine}\n`))

  // ── Footer ───────────────────────────────────────────────────────────
  chunks.push(ESC_POS.ALIGN_CENTER)
  chunks.push(buf(`\n`))
  chunks.push(buf(`Firma del responsable:\n`))
  chunks.push(buf(`________________________\n`))
  chunks.push(buf(`\n`))
  chunks.push(ESC_POS.SIZE_LARGE, ESC_POS.BOLD_ON)
  chunks.push(buf(`GRACIAS\n`))
  chunks.push(ESC_POS.SIZE_NORMAL, ESC_POS.CUT)

  return Buffer.concat(chunks).toString('base64')
}
