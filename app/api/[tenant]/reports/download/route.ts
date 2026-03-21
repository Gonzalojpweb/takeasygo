import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { safeDecrypt } from '@/lib/crypto'

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

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
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

    const sp = request.nextUrl.searchParams
    const format = sp.get('format') || 'excel'

    const now = new Date()
    const fromRaw = sp.get('from')
    const toRaw = sp.get('to')
    const from = fromRaw ? new Date(fromRaw) : new Date(now.getFullYear(), now.getMonth(), 1)
    const to = toRaw ? new Date(toRaw) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    to.setHours(23, 59, 59, 999)

    const rawOrders = await Order.find({
      tenantId: tenant._id,
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
    if (format === 'data') {
      return NextResponse.json({ orders, from: from.toISOString(), to: to.toISOString(), tenantSlug })
    }

    // ─── Excel generation ────────────────────────────────────────────────────
    const active = orders.filter(o => o.status !== 'cancelled')
    const cancelled = orders.filter(o => o.status === 'cancelled')
    const totalRevenue = active.reduce((s, o) => s + o.total, 0)
    const avgTicket = active.length > 0 ? totalRevenue / active.length : 0

    // Daily breakdown
    const dailyMap: Record<string, { count: number; total: number }> = {}
    active.forEach(o => {
      const day = new Date(o.createdAt).toLocaleDateString('es-AR')
      if (!dailyMap[day]) dailyMap[day] = { count: 0, total: 0 }
      dailyMap[day].count++
      dailyMap[day].total += o.total
    })

    // Top items
    const itemMap: Record<string, { quantity: number; revenue: number }> = {}
    active.forEach(o => {
      o.items.forEach((item: any) => {
        if (!itemMap[item.name]) itemMap[item.name] = { quantity: 0, revenue: 0 }
        itemMap[item.name].quantity += item.quantity
        itemMap[item.name].revenue += item.subtotal
      })
    })
    const topItems = Object.entries(itemMap)
      .sort((a, b) => b[1].quantity - a[1].quantity)

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

    const periodoRow = ws1.addRow(['Período analizado', `${from.toLocaleDateString('es-AR')} → ${to.toLocaleDateString('es-AR')}`])
    periodoRow.getCell(1).font = { bold: true, color: { argb: '666666' }, italic: true }

    ws1.addRow([])

    const summaryHeaders = ws1.addRow(['Indicador', 'Valor'])
    styleHeader(summaryHeaders.getCell(1))
    styleHeader(summaryHeaders.getCell(2))

    const summaryRows = [
      ['Total de órdenes (período)', orders.length],
      ['Órdenes activas', active.length],
      ['Órdenes canceladas', cancelled.length],
      ['Ventas netas', totalRevenue],
      ['Ticket promedio', avgTicket],
      ['Mes anterior (comparativo)', '—'],
    ]

    summaryRows.forEach(([label, value], i) => {
      const row = ws1.addRow([label, value])
      row.getCell(1).font = { bold: true }
      if (i % 2 === 0) {
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
      }
      if (typeof value === 'number' && (label as string).includes('$') || label === 'Ventas netas' || label === 'Ticket promedio') {
        styleCurrency(row.getCell(2))
      }
      row.height = 22
    })

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
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Pago', key: 'payment', width: 14 },
      { header: 'Notas', key: 'notes', width: 30 },
    ]

    const headerRow2 = ws2.getRow(1)
    headerRow2.eachCell(cell => styleHeader(cell))
    headerRow2.height = 28

    orders.forEach((order, idx) => {
      const itemsStr = order.items.map((i: any) => `${i.quantity}x ${i.name}`).join(' | ')
      const subtotalsStr = order.items.map((i: any) => `$${fmt(i.subtotal)}`).join(' | ')
      const isCancelled = order.status === 'cancelled'

      const row = ws2.addRow({
        n: idx + 1,
        orderNumber: order.orderNumber,
        date: fmtDate(order.createdAt as Date),
        customer: order.customer.name,
        phone: order.customer.phone || '—',
        email: order.customer.email || '—',
        items: itemsStr,
        subtotals: subtotalsStr,
        total: order.total,
        status: STATUS_LABELS[order.status] || order.status,
        payment: PAYMENT_LABELS[order.payment?.status] || order.payment?.status,
        notes: order.notes || '',
      })

      row.getCell('total').numFmt = '"$"#,##0.00'
      row.alignment = { vertical: 'top', wrapText: true }
      row.height = 36

      if (isCancelled) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CANCELLED_BG } }
          cell.font = { color: { argb: 'FF999999' }, italic: true }
        })
      } else if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } }
        })
      }
    })

    ws2.autoFilter = { from: 'A1', to: 'L1' }

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

    topItems.forEach(([name, data], i) => {
      const row = ws3.addRow({ rank: i + 1, name, quantity: data.quantity, revenue: data.revenue })
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

    const dailyEntries = Object.entries(dailyMap).sort((a, b) =>
      new Date(a[0].split('/').reverse().join('-')).getTime() -
      new Date(b[0].split('/').reverse().join('-')).getTime()
    )

    dailyEntries.forEach(([date, data], i) => {
      const row = ws4.addRow({ date, count: data.count, total: data.total })
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
      total: totalRevenue,
    })
    totalRow.getCell('date').font = { bold: true, color: { argb: PRIMARY } }
    totalRow.getCell('count').font = { bold: true }
    totalRow.getCell('total').numFmt = '"$"#,##0.00'
    totalRow.getCell('total').font = { bold: true, color: { argb: PRIMARY } }
    totalRow.eachCell(cell => {
      cell.border = { top: { style: 'medium', color: { argb: PRIMARY } } }
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
