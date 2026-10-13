import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { safeDecrypt } from '@/lib/crypto'
import { getDayAndMidnightInTimezone } from '@/lib/restaurant-time'
import { toPesos } from '@takeasygo/business'
import { buildReportStats, isBilledOrder } from '@/lib/report-stats'
import { computePeriodCommissions } from '@/lib/commissions'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
}

const METHOD_LABELS: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  kripton: 'Kripton',
  transfer: 'Transferencia',
}

function fmt(n: number) {
  return toPesos(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date, timezone?: string) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: timezone || DEFAULT_TIMEZONE,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    // Consolidado (todas las sedes, sin filtro de ubicación): exige
    // reports.view_consolidated (admin+auditor) en lugar de reports.read.
    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'reports.view_consolidated',
    })
    if (permError) return permError

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'reports.view_consolidated',
      entity: 'reports',
      details: { route: 'reports/download' },
      request,
    })

    const sp = request.nextUrl.searchParams
    const format = sp.get('format') || 'excel'

    const location = await Location.findOne({ tenantId: tenant._id }).select('timezone').lean() as any
    const timezone = location?.timezone || DEFAULT_TIMEZONE

    const now = new Date()
    const fromRaw = sp.get('from')
    const toRaw = sp.get('to')

    let from: Date
    let to: Date

    if (fromRaw && toRaw) {
      from = new Date(fromRaw)
      to = new Date(toRaw)
      to.setHours(23, 59, 59, 999)
    } else {
      const thisMonthStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
      const [y, m] = thisMonthStr.split('-').map(Number)
      const nextMonthM = m === 12 ? 1 : m + 1
      const nextMonthY = m === 12 ? y + 1 : y
      const { date: startOfMonth } = getDayAndMidnightInTimezone(`${y}-${String(m).padStart(2, '0')}-01`, timezone)
      const { date: startOfNextMonth } = getDayAndMidnightInTimezone(`${nextMonthY}-${String(nextMonthM).padStart(2, '0')}-01`, timezone)
      from = startOfMonth
      to = new Date(startOfNextMonth.getTime() - 1000)
    }

    const rawOrders = await Order.find({
      tenantId: tenant._id,
      deletedAt: null,
      createdAt: { $gte: from, $lte: to },
    }).sort({ createdAt: -1 }).lean()

    const orders = rawOrders.map((o: any) => ({
      ...o,
      customer: {
        ...o.customer,
        name:  safeDecrypt(o.customer.name),
        phone: safeDecrypt(o.customer.phone),
        email: safeDecrypt(o.customer.email),
      },
    }))

    // ─── Data endpoint for client-side PDF ──────────────────────────────────
    // Devuelve las MISMAS cifras precalculadas que usa el Excel para que ambos
    // formatos muestren exactamente los mismos números (fuente única: lib).
    if (format === 'data') {
      const stats = buildReportStats(orders, timezone)
      const commissions = await computePeriodCommissions(tenant._id, from, to)
      return NextResponse.json({
        orders,
        stats,
        commissions,
        from: from.toISOString(),
        to: to.toISOString(),
        tenantSlug,
        timezone,
      })
    }

    // ─── Cifras compartidas (fuente única de verdad) ────────────────────────
    const stats = buildReportStats(orders, timezone)
    const commissions = await computePeriodCommissions(tenant._id, from, to)
    const active = orders.filter(isBilledOrder)
    const totalRevenue = stats.grossRevenue
    const totalNetRevenue = stats.netRevenue
    const totalSurcharge = stats.surchargeRevenue

    const transferComm = commissions.transfer
    // Neto después de comisiones: bruto − comisiones auto-cobradas (MP/Kripton)
    // − comisión de transferencia (ya pagada + pendiente, las dos se adeudan).
    const netAfterCommissions = totalRevenue - stats.autoCollectedFee - commissions.total

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'TakeAsyGo'
    workbook.created = new Date()
    workbook.properties.date1904 = false

    const PRIMARY = 'FF6366F1'
    const PRIMARY_LIGHT = 'FFE0E7FF'
    const HEADER_BG = 'FF1E1B4B'
    const HEADER_FG = 'FFFFFFFF'
    const ROW_ALT = 'FFF8F7FF'
    const CANCELLED_BG = 'FFFFF1F2'

    function styleHeader(cell: ExcelJS.Cell, bg = HEADER_BG) {
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = {
        bottom: { style: 'medium', color: { argb: PRIMARY } },
      }
    }

    function styleCurrency(cell: ExcelJS.Cell) {
      cell.numFmt = '"$"#,##0.00'
    }

    // ── Sheet 1: RESUMEN ─────────────────────────────────────────────────────
    const ws1 = workbook.addWorksheet('Resumen')
    ws1.columns = [{ width: 32 }, { width: 22 }]

    const titleRow = ws1.addRow([`Reporte de Ventas — ${tenantSlug.toUpperCase()}`])
    ws1.mergeCells('A1:B1')
    titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: PRIMARY } }
    titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    titleRow.height = 36

    ws1.addRow([])

    const periodoRow = ws1.addRow(['Período analizado', `${from.toLocaleDateString('es-AR', { timeZone: timezone })} → ${to.toLocaleDateString('es-AR', { timeZone: timezone })}`])
    periodoRow.getCell(1).font = { bold: true, color: { argb: '666666' }, italic: true }

    ws1.addRow([])

    const summaryHeaders = ws1.addRow(['Indicador', 'Valor'])
    styleHeader(summaryHeaders.getCell(1))
    styleHeader(summaryHeaders.getCell(2))

    // kind: 'currency' = formato $, 'count' = número entero, 'text' = texto libre
    const summaryRows: { label: string; value: number | string; kind: 'currency' | 'count' | 'text' }[] = [
      { label: 'Total de órdenes (período)', value: stats.totalOrders, kind: 'count' },
      { label: 'Órdenes que facturan (no canceladas, pago válido)', value: stats.billedOrders, kind: 'count' },
      { label: 'Órdenes canceladas (NO suman a ingresos)', value: stats.cancelledOrders, kind: 'count' },
      { label: '  ↳ monto cancelado (no facturado)', value: toPesos(stats.cancelledAmount), kind: 'currency' },
      { label: 'Órdenes con pago rechazado/cancelado (NO suman)', value: stats.rejectedPaymentOrders, kind: 'count' },
      { label: '  ↳ monto por pago rechazado (no facturado)', value: toPesos(stats.rejectedAmount), kind: 'currency' },
      { label: 'Órdenes esperando pago del cliente (NO suman)', value: stats.awaitingPaymentOrders, kind: 'count' },
      { label: '  ↳ monto esperando pago (no facturado)', value: toPesos(stats.awaitingPaymentAmount), kind: 'currency' },
      { label: 'Órdenes con pago pendiente de confirmar', value: stats.pendingPaymentOrders, kind: 'count' },
      { label: '  ↳ monto pendiente de confirmar cobro', value: toPesos(stats.pendingPaymentAmount), kind: 'currency' },
      { label: 'Ventas brutas facturadas (con recargos)', value: toPesos(totalRevenue), kind: 'currency' },
      { label: 'Ventas netas de carta (sin recargos)', value: toPesos(totalNetRevenue), kind: 'currency' },
      { label: 'Recargos por método de pago (cubren fees)', value: toPesos(totalSurcharge), kind: 'currency' },
      { label: 'Ticket promedio bruto', value: toPesos(stats.avgTicketGross), kind: 'currency' },
      { label: 'Ticket promedio neto', value: toPesos(stats.avgTicketNet), kind: 'currency' },
      { label: 'Comisiones TakeasyGO — cobradas solas (MP/Kripton)', value: toPesos(stats.autoCollectedFee), kind: 'currency' },
      { label: 'Comisiones TakeasyGO — transferencia ya pagadas', value: toPesos(transferComm.settled), kind: 'currency' },
      { label: 'Comisiones TakeasyGO — transferencia pendientes de pagar', value: toPesos(transferComm.pending), kind: 'currency' },
      { label: 'Neto al restaurante (después de todas las comisiones)', value: toPesos(netAfterCommissions), kind: 'currency' },
    ]

    summaryRows.forEach(({ label, value, kind }, i) => {
      const row = ws1.addRow([label, value])
      row.getCell(1).font = { bold: !label.startsWith('  ') }
      if (i % 2 === 0) {
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
      }
      if (kind === 'currency') styleCurrency(row.getCell(2))
      if (kind === 'count') row.getCell(2).numFmt = '#,##0'
      row.height = 22
    })

    // Nota aclaratoria al pie del resumen
    ws1.addRow([])
    const notaRow = ws1.addRow([
      'Nota: MercadoPago y Kripton descuentan su propio fee de procesamiento además de la comisión ' +
      'TakeasyGO; ese fee del procesador está cubierto por el recargo que paga el cliente. ' +
      'Las comisiones de transferencia se pagan desde el panel de administración.',
    ])
    ws1.mergeCells(notaRow.number, 1, notaRow.number, 2)
    notaRow.getCell(1).font = { italic: true, size: 9, color: { argb: '666666' } }
    notaRow.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    notaRow.height = 42

    // ── Sheet 2: DETALLE DE ÓRDENES ──────────────────────────────────────────
    const ws2 = workbook.addWorksheet('Órdenes')
    ws2.columns = [
      { header: '#', key: 'n', width: 6 },
      { header: 'N° Orden', key: 'orderNumber', width: 16 },
      { header: 'Fecha', key: 'date', width: 20 },
      { header: 'Cliente', key: 'customer', width: 22 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Items', key: 'items', width: 40 },
      { header: 'Subtotales', key: 'subtotals', width: 18 },
      { header: 'Precio carta', key: 'baseTotal', width: 14 },
      { header: 'Recargo', key: 'surcharge', width: 14 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Método', key: 'method', width: 14 },
      { header: 'Comisión TO', key: 'platformFee', width: 14 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Pago', key: 'payment', width: 14 },
      { header: 'Notas', key: 'notes', width: 30 },
    ]

    const headerRow2 = ws2.getRow(1)
    headerRow2.eachCell(cell => styleHeader(cell))
    headerRow2.height = 28

    const REJECTED_BG = 'FFFFE4E4'

    orders.forEach((order, idx) => {
      const itemsStr = order.items.map((i: any) => `${i.quantity}x ${i.name}`).join(' | ')
      const subtotalsStr = order.items.map((i: any) => `$${fmt(i.subtotal)}`).join(' | ')
      const isCancelled = order.status === 'cancelled'
      const isRejected = !isCancelled && (order.payment?.status === 'rejected' || order.payment?.status === 'cancelled')

      const row = ws2.addRow({
        n: idx + 1,
        orderNumber: order.orderNumber,
        date: fmtDate(order.createdAt as Date, timezone),
        customer: order.customer.name,
        phone: order.customer.phone || '—',
        email: order.customer.email || '—',
        items: itemsStr,
        subtotals: subtotalsStr,
        baseTotal: toPesos(order.payment?.baseTotal || order.total),
        surcharge: toPesos(order.payment?.surchargeAmount || 0),
        total: toPesos(order.total),
        method: METHOD_LABELS[order.payment?.method] || order.payment?.method || '—',
        platformFee: toPesos(order.payment?.platformFeeAmount || 0),
        status: STATUS_LABELS[order.status] || order.status,
        payment: PAYMENT_LABELS[order.payment?.status] || order.payment?.status,
        notes: isRejected
          ? `⚠ No factura: el pago fue ${PAYMENT_LABELS[order.payment?.status] || order.payment?.status}. ${order.notes || ''}`.trim()
          : order.notes || '',
      })

      row.getCell('total').numFmt = '"$"#,##0.00'
      row.getCell('baseTotal').numFmt = '"$"#,##0.00'
      row.getCell('surcharge').numFmt = '"$"#,##0.00'
      row.getCell('platformFee').numFmt = '"$"#,##0.00'
      row.alignment = { vertical: 'top', wrapText: true }
      row.height = 36

      if (isCancelled) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CANCELLED_BG } }
          cell.font = { color: { argb: 'FF999999' }, italic: true }
        })
      } else if (isRejected) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REJECTED_BG } }
          cell.font = { color: { argb: 'FFB91C1C' } }
        })
      } else if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        })
      }
    })

    ws2.autoFilter = { from: 'A1', to: 'P1' }

    // ── Sheet 3: ITEMS MÁS VENDIDOS ──────────────────────────────────────────
    const ws3 = workbook.addWorksheet('Items más vendidos')
    ws3.columns = [
      { header: '#', key: 'rank', width: 6 },
      { header: 'Producto', key: 'name', width: 34 },
      { header: 'Cantidad vendida', key: 'quantity', width: 18 },
      { header: 'Ingresos generados', key: 'revenue', width: 20 },
    ]

    ws3.getRow(1).eachCell(cell => styleHeader(cell))
    ws3.getRow(1).height = 28

    stats.topItems.forEach((item, i) => {
      const row = ws3.addRow({ rank: i + 1, name: item.name, quantity: item.quantity, revenue: toPesos(item.revenue) })
      row.getCell('revenue').numFmt = '"$"#,##0.00'
      row.height = 22
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        })
      }
    })

    // ── Sheet 4: VENTAS POR DÍA ──────────────────────────────────────────────
    const ws4 = workbook.addWorksheet('Por día')
    ws4.columns = [
      { header: 'Fecha', key: 'date', width: 16 },
      { header: 'Órdenes', key: 'count', width: 12 },
      { header: 'Total del día', key: 'total', width: 18 },
    ]

    ws4.getRow(1).eachCell(cell => styleHeader(cell))
    ws4.getRow(1).height = 28

    const dailyEntries = stats.daily.slice().sort((a, b) =>
      new Date(a.date.split('/').reverse().join('-')).getTime() -
      new Date(b.date.split('/').reverse().join('-')).getTime()
    )

    dailyEntries.forEach((d, i) => {
      const row = ws4.addRow({ date: d.date, count: d.orders, total: toPesos(d.gross) })
      row.getCell('total').numFmt = '"$"#,##0.00'
      row.height = 22
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        })
      }
    })

    // Totals row for sheet 4
    const totalRow = ws4.addRow({
      date: 'TOTAL',
      count: active.length,
      total: toPesos(totalRevenue),
    })
    totalRow.getCell('date').font = { bold: true, color: { argb: PRIMARY } }
    totalRow.getCell('count').font = { bold: true }
    totalRow.getCell('total').numFmt = '"$"#,##0.00'
    totalRow.getCell('total').font = { bold: true, color: { argb: PRIMARY } }
    totalRow.eachCell(cell => {
      cell.border = { top: { style: 'medium', color: { argb: PRIMARY } } }
    })

    // ── Sheet 5: VENTAS POR MÉTODO DE PAGO ──────────────────────────────────────
    const ws5 = workbook.addWorksheet('Método de pago')
    ws5.columns = [
      { header: 'Método', key: 'method', width: 22 },
      { header: 'Órdenes', key: 'orders', width: 12 },
      { header: 'Bruto', key: 'revenue', width: 18 },
      { header: 'Neto carta', key: 'baseRevenue', width: 18 },
      { header: 'Recargo', key: 'surcharge', width: 14 },
      { header: 'Comisión TO', key: 'platformFee', width: 16 },
      { header: 'Neto restaurante', key: 'netToRestaurant', width: 20 },
      { header: '% del total', key: 'pct', width: 14 },
    ]

    ws5.getRow(1).eachCell(cell => styleHeader(cell))
    ws5.getRow(1).height = 28

    stats.methods.forEach((m, i) => {
      const pct = totalRevenue > 0 ? Math.round((m.gross / totalRevenue) * 100) : 0
      const label = METHOD_LABELS[m.method] || m.method
      const row = ws5.addRow({
        method: label,
        orders: m.orders,
        revenue: toPesos(m.gross),
        baseRevenue: toPesos(m.net),
        surcharge: toPesos(m.surcharge),
        platformFee: toPesos(m.platformFee),
        netToRestaurant: toPesos(m.netToRestaurant),
        pct: `${pct}%`,
      })
      row.getCell('revenue').numFmt = '"$"#,##0.00'
      row.getCell('baseRevenue').numFmt = '"$"#,##0.00'
      row.getCell('surcharge').numFmt = '"$"#,##0.00'
      row.getCell('platformFee').numFmt = '"$"#,##0.00'
      row.getCell('netToRestaurant').numFmt = '"$"#,##0.00'
      row.height = 22
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        })
      }
    })

    // Totals row
    const totalPlatformFee = stats.methods.reduce((s, m) => s + m.platformFee, 0)
    const totalNetToRestaurant = stats.methods.reduce((s, m) => s + m.netToRestaurant, 0)
    const totalRow5 = ws5.addRow({
      method: 'TOTAL',
      orders: stats.billedOrders,
      revenue: toPesos(totalRevenue),
      baseRevenue: toPesos(totalNetRevenue),
      surcharge: toPesos(totalSurcharge),
      platformFee: toPesos(totalPlatformFee),
      netToRestaurant: toPesos(totalNetToRestaurant),
      pct: '100%',
    })
    totalRow5.getCell('method').font = { bold: true, color: { argb: PRIMARY } }
    totalRow5.getCell('orders').font = { bold: true }
    for (const col of ['revenue', 'baseRevenue', 'surcharge', 'platformFee', 'netToRestaurant'] as const) {
      totalRow5.getCell(col).numFmt = '"$"#,##0.00'
      totalRow5.getCell(col).font = { bold: true, color: { argb: PRIMARY } }
    }
    totalRow5.getCell('pct').font = { bold: true }
    totalRow5.eachCell(cell => {
      cell.border = { top: { style: 'medium', color: { argb: PRIMARY } } }
    })

    // ── Sheet 6: COMISIONES Y CONCILIACIÓN ────────────────────────────────────
    // Usa computePeriodCommissions — la MISMA fuente que el panel de admin —
    // para que los números del reporte cierren exactamente contra el panel.
    const ws6 = workbook.addWorksheet('Comisiones')
    ws6.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 34 }]

    const commTitle = ws6.addRow(['Comisiones TakeasyGO — Conciliación del período'])
    ws6.mergeCells('A1:F1')
    commTitle.getCell(1).font = { bold: true, size: 14, color: { argb: PRIMARY } }
    commTitle.height = 30

    const commHowItWorks = ws6.addRow([
      'Mercado Pago y Kripton se cobran SOLOS con cada pago (marketplace_fee): siempre figuran 100% ' +
      'cobradas. La comisión de transferencia (delivery) la paga el restaurante desde el panel.',
    ])
    ws6.mergeCells('A2:F2')
    commHowItWorks.getCell(1).font = { italic: true, size: 9, color: { argb: '666666' } }
    commHowItWorks.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    commHowItWorks.height = 32

    ws6.addRow([])
    const commHeaders = ws6.addRow(['Método', 'Órdenes', 'Total comisión', 'Ya cobrada', 'Pendiente', 'Cómo se cobra'])
    commHeaders.eachCell(cell => styleHeader(cell))
    commHeaders.height = 28

    const COMM_HOW: Record<string, string> = {
      mercadopago: 'Automático con cada pago aprobado',
      kripton: 'Automático con cada pago aprobado',
      transfer: 'El restaurante la paga desde el panel',
    }

    commissions.breakdown.forEach((m, i) => {
      const row = ws6.addRow({
        method: METHOD_LABELS[m.method] || m.method,
        orders: m.orderCount,
        total: toPesos(m.total),
        settled: toPesos(m.settled),
        pending: toPesos(m.pending),
        how: COMM_HOW[m.method] || '—',
      })
      for (const col of ['total', 'settled', 'pending'] as const) row.getCell(col).numFmt = '"$"#,##0.00'
      row.height = 22
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        })
      }
    })

    const commTotalRow = ws6.addRow({
      method: 'TOTAL',
      orders: commissions.orderCount,
      total: toPesos(commissions.total),
      settled: toPesos(commissions.settled),
      pending: toPesos(commissions.pending),
      how: '',
    })
    commTotalRow.getCell('method').font = { bold: true, color: { argb: PRIMARY } }
    for (const col of ['total', 'settled', 'pending'] as const) {
      commTotalRow.getCell(col).numFmt = '"$"#,##0.00'
      commTotalRow.getCell(col).font = { bold: true, color: { argb: PRIMARY } }
    }
    commTotalRow.eachCell(cell => {
      cell.border = { top: { style: 'medium', color: { argb: PRIMARY } } }
    })

    // Semanas de transferencia (corte lunes a domingo)
    if (commissions.weekly.length > 0) {
      ws6.addRow([])
      const wkTitle = ws6.addRow(['Comisiones de transferencia — semana a semana (lunes a domingo)'])
      ws6.mergeCells(`A${wkTitle.number}:F${wkTitle.number}`)
      wkTitle.getCell(1).font = { bold: true, size: 11, color: { argb: PRIMARY } }

      const wkHeaders = ws6.addRow(['Semana', 'Órdenes', 'Comisión', 'Ya pagada', 'Pendiente', ''])
      wkHeaders.eachCell(cell => styleHeader(cell))
      wkHeaders.height = 24

      commissions.weekly.forEach((w, i) => {
        const row = ws6.addRow({
          week: `${w.weekStart.toLocaleDateString('es-AR', { timeZone: timezone })} → ${w.weekEnd.toLocaleDateString('es-AR', { timeZone: timezone })}`,
          orders: w.orderCount,
          total: toPesos(w.total),
          settled: toPesos(w.settled),
          pending: toPesos(w.pending),
        })
        for (const col of ['total', 'settled', 'pending'] as const) row.getCell(col).numFmt = '"$"#,##0.00'
        row.height = 20
        if (i % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
          })
        }
      })
    }

    // Ajuste por settlements viejos sin detalle de órdenes
    if (commissions.unattributedSettled > 0) {
      ws6.addRow([])
      const adjRow = ws6.addRow([
        'Ajuste: pagos registrados anteriores sin detalle de órdenes (ya descontados del pendiente)',
        '',
        toPesos(commissions.unattributedSettled),
      ])
      adjRow.getCell(3).numFmt = '"$"#,##0.00'
      adjRow.getCell(1).font = { italic: true, size: 9, color: { argb: '666666' } }
    }

    // Cierre: total bruto − comisiones = neto al restaurante
    ws6.addRow([])
    const cierreTitle = ws6.addRow(['Cómo cierra la cuenta del período'])
    cierreTitle.getCell(1).font = { bold: true, size: 11, color: { argb: PRIMARY } }
    const cierreRows: { label: string; value: number }[] = [
      { label: 'Ventas brutas facturadas', value: totalRevenue },
      { label: '− Comisiones TakeasyGO cobradas solas (MP/Kripton)', value: -stats.autoCollectedFee },
      { label: '− Comisiones TakeasyGO de transferencia (todas las del período)', value: -commissions.total },
      { label: '= Neto al restaurante', value: netAfterCommissions },
    ]
    cierreRows.forEach(({ label, value }, i) => {
      const row = ws6.addRow([label, toPesos(value)])
      row.getCell(2).numFmt = '"$"#,##0.00'
      if (i === cierreRows.length - 1) {
        row.getCell(1).font = { bold: true }
        row.getCell(2).font = { bold: true, color: { argb: PRIMARY } }
      }
    })

    // ── Return Excel ─────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()
    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-${tenantSlug}-${fromStr}-al-${toStr}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[reports/download]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
