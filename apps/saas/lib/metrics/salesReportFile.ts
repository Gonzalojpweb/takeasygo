import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import type { SalesMetrics, SaleChannel, SalesRange } from './sales'
import type { SaleRow } from './salesList'

// ============================================================================
// Reporte de ventas descargable — PDF «Cierre» y Excel (Fase I, 2026-10)
// ============================================================================
// Mismos números que el Resumen y Ventas del POS (lib/metrics/sales).
//   · PDF: una hoja de cierre (del día o del período): ingresos, ventas,
//     ticket, comensales y ticket por comensal; por canal; métodos de pago;
//     categorías; top productos; descuentos, anuladas y merma.
//   · Excel: hojas Resumen, Por canal, Métodos de pago, Categorías,
//     Productos y Ventas (una fila por venta).
// ============================================================================

export interface SalesFileData {
  tenantName: string
  locationName: string
  range: SalesRange
  metrics: SalesMetrics
  rows: SaleRow[]
}

const CHANNEL_LABEL: Record<SaleChannel, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Delivery externo' }
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', mercadopago: 'MercadoPago', posnet_debit: 'Débito', posnet_credit: 'Crédito',
  transfer: 'Transferencia', kripton: 'Kripton', mixed: 'Mixto', otro: 'Otro',
}

const pesos = (cents: number) => `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const periodLabel = (r: SalesRange) => (r.from === r.to ? r.from.split('-').reverse().join('/') : `${r.from.split('-').reverse().join('/')} al ${r.to.split('-').reverse().join('/')}`)

export function buildSalesPdf(data: SalesFileData): Buffer {
  const { metrics: m } = data
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  let y = 18
  const line = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, 18, y)
    doc.text(value, W - 18, y, { align: 'right' })
    y += 6
  }
  const section = (title: string) => {
    y += 3
    doc.setDrawColor(220)
    doc.line(18, y - 4, W - 18, y - 4)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(title.toUpperCase(), 18, y)
    doc.setFontSize(10)
    y += 7
  }
  const ensure = (space: number) => { if (y + space > 280) { doc.addPage(); y = 18 } }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(data.locationName || data.tenantName, 18, y)
  y += 7
  doc.setFontSize(12)
  doc.text(`Cierre de ventas — ${periodLabel(data.range)}`, 18, y)
  doc.setFontSize(10)
  y += 9

  section('Totales')
  line('Ventas', String(m.totals.sales))
  line('Ingresos', pesos(m.totals.revenue), true)
  line('Ticket promedio', pesos(m.totals.avgTicket))
  line('Comensales (salón)', String(m.totals.guests))
  line('Ticket por comensal', pesos(m.totals.perGuest))
  line('Descuentos', `-${pesos(m.totals.discounts)}`)
  line('Ventas anuladas', `${m.totals.voided.count} (${pesos(m.totals.voided.amount)})`)
  line('Platos quitados / merma', `${m.totals.itemVoids.count} (${pesos(m.totals.itemVoids.amount)} / ${pesos(m.totals.itemVoids.wasteAmount)})`)

  section('Por canal')
  for (const [id, c] of Object.entries(m.byChannel) as [SaleChannel, SalesMetrics['byChannel'][SaleChannel]][]) {
    line(`${CHANNEL_LABEL[id]} — ${c.sales} ventas${id === 'salon' ? ` · ${c.guests} comensales` : ''}`, pesos(c.revenue))
  }

  ensure(40)
  section('Métodos de pago')
  for (const p of m.byPayment) line(`${METHOD_LABEL[p.method] ?? p.method} (${p.count})`, pesos(p.amount))
  if (m.byPayment.length === 0) line('Sin cobros', '—')

  ensure(40)
  section('Categorías')
  for (const c of m.byCategory) { ensure(8); line(`${c.category} (${c.quantity} u.)`, pesos(c.revenue)) }

  ensure(40)
  section('Más vendidos')
  for (const p of m.topProducts) { ensure(8); line(`${p.name} (${p.quantity} u.)`, pesos(p.revenue)) }

  y += 6
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.text(`Generado por TakeasyGO POS el ${new Date().toLocaleString('es-AR')}. No válido como comprobante fiscal.`, 18, Math.min(y, 288))
  return Buffer.from(doc.output('arraybuffer'))
}

export async function buildSalesXlsx(data: SalesFileData): Promise<Buffer> {
  const { metrics: m } = data
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TakeasyGO POS'
  const money = (ws: ExcelJS.Worksheet, cols: string[]) => { for (const c of cols) ws.getColumn(c).numFmt = '"$"#,##0.00' }
  const header = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }] }
  const p = (cents: number) => cents / 100

  const summary = wb.addWorksheet('Resumen')
  summary.columns = [{ header: 'Indicador', key: 'k', width: 32 }, { header: 'Valor', key: 'v', width: 20 }]
  summary.addRows([
    { k: 'Período', v: periodLabel(data.range) },
    { k: 'Sede', v: data.locationName },
    { k: 'Ventas', v: m.totals.sales },
    { k: 'Ingresos', v: p(m.totals.revenue) },
    { k: 'Ticket promedio', v: p(m.totals.avgTicket) },
    { k: 'Comensales (salón)', v: m.totals.guests },
    { k: 'Ticket por comensal', v: p(m.totals.perGuest) },
    { k: 'Descuentos', v: p(m.totals.discounts) },
    { k: 'Ventas anuladas', v: m.totals.voided.count },
    { k: 'Monto anulado', v: p(m.totals.voided.amount) },
    { k: 'Merma (platos quitados)', v: p(m.totals.itemVoids.wasteAmount) },
  ])
  header(summary)

  const ch = wb.addWorksheet('Por canal')
  ch.columns = [{ header: 'Canal', key: 'c', width: 22 }, { header: 'Ventas', key: 's', width: 10 }, { header: 'Ingresos', key: 'r', width: 16 }, { header: 'Ticket promedio', key: 't', width: 16 }, { header: 'Comensales', key: 'g', width: 12 }]
  for (const [id, c] of Object.entries(m.byChannel) as [SaleChannel, SalesMetrics['byChannel'][SaleChannel]][]) {
    ch.addRow({ c: CHANNEL_LABEL[id], s: c.sales, r: p(c.revenue), t: p(c.avgTicket), g: id === 'salon' ? c.guests : '' })
  }
  money(ch, ['r', 't']); header(ch)

  const pay = wb.addWorksheet('Métodos de pago')
  pay.columns = [{ header: 'Método', key: 'm', width: 20 }, { header: 'Cobros', key: 'n', width: 10 }, { header: 'Monto', key: 'a', width: 16 }]
  for (const x of m.byPayment) pay.addRow({ m: METHOD_LABEL[x.method] ?? x.method, n: x.count, a: p(x.amount) })
  money(pay, ['a']); header(pay)

  const cat = wb.addWorksheet('Categorías')
  cat.columns = [{ header: 'Categoría', key: 'c', width: 26 }, { header: 'Unidades', key: 'q', width: 12 }, { header: 'Ingresos', key: 'r', width: 16 }]
  for (const x of m.byCategory) cat.addRow({ c: x.category, q: x.quantity, r: p(x.revenue) })
  money(cat, ['r']); header(cat)

  const prod = wb.addWorksheet('Productos')
  prod.columns = [{ header: 'Producto', key: 'n', width: 30 }, { header: 'Unidades', key: 'q', width: 12 }, { header: 'Ingresos', key: 'r', width: 16 }]
  for (const x of m.topProducts) prod.addRow({ n: x.name, q: x.quantity, r: p(x.revenue) })
  money(prod, ['r']); header(prod)

  const sales = wb.addWorksheet('Ventas')
  sales.columns = [
    { header: 'Fecha', key: 'd', width: 18 }, { header: 'Canal', key: 'c', width: 16 }, { header: 'Venta', key: 'v', width: 20 },
    { header: 'Comensales', key: 'g', width: 11 }, { header: 'Productos', key: 'i', width: 50 }, { header: 'Pago', key: 'm', width: 22 },
    { header: 'Descuentos', key: 'x', width: 12 }, { header: 'Total', key: 't', width: 14 }, { header: 'Estado', key: 's', width: 12 },
  ]
  for (const r of data.rows) {
    sales.addRow({
      d: new Date(r.createdAt).toLocaleString('es-AR'),
      c: CHANNEL_LABEL[r.channel],
      v: r.channel === 'salon' ? `Mesa ${r.table?.number ?? '?'}` : r.orderNumber ?? r.id.slice(-6).toUpperCase(),
      g: r.guests ?? '',
      i: r.items.map((i) => `${i.quantity}× ${i.name}`).join(', '),
      m: r.payments.length ? r.payments.map((x) => METHOD_LABEL[x.method] ?? x.method).join(' + ') : METHOD_LABEL[r.paymentMethod ?? ''] ?? r.paymentMethod ?? '',
      x: p(r.discounts),
      t: p(r.total),
      s: r.voided ? 'Anulada' : 'OK',
    })
  }
  money(sales, ['x', 't']); header(sales)

  return Buffer.from(await wb.xlsx.writeBuffer())
}
