/**
 * Descarga de la vista 360 del grupo (etapa 4, 08/11/2026): Excel con una hoja
 * por tema y PDF de resumen para el contador. Mismos números que la pantalla
 * (sale de loadOrgDashboard); solo totales, sin datos de clientes.
 */
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import { SALE_CHANNELS } from '@/lib/metrics/sales'
import type { OrgDashboard } from './dashboard'

const CHANNEL_LABEL: Record<string, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Delivery externo' }
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', mercadopago: 'Mercado Pago', posnet_debit: 'Débito', posnet_credit: 'Crédito',
  transfer: 'Transferencia', kripton: 'Kripton', mixed: 'Mixto', otro: 'Otro',
}

const pesos = (cents: number) => `$${Math.round(cents / 100).toLocaleString('es-AR')}`
const num = (cents: number) => Math.round(cents) / 100
/** Variación en % o null (sin base). */
export function change(cur: number, prev: number): number | null {
  return prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null
}
const changeText = (cur: number, prev: number) => {
  const c = change(cur, prev)
  if (c === null) return cur ? 'nuevo' : '-'
  return `${c > 0 ? '+' : ''}${c.toLocaleString('es-AR')}%`
}
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
export const rangeLabel = (r: { from: string; to: string }) => (r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} al ${fmtDate(r.to)}`)

export function dashboardFileName(d: OrgDashboard, ext: 'xlsx' | 'pdf'): string {
  return `${d.organization.slug}-${d.range.from}_${d.range.to}.${ext}`
}

export async function buildDashboardXlsx(d: OrgDashboard): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TakeasyGO'
  const MONEY = '"$"#,##0.00'
  const PCT = '0.0"%"'
  const sheet = (name: string, columns: { header: string; key: string; width?: number; money?: boolean; pct?: boolean }[]) => {
    const ws = wb.addWorksheet(name)
    ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.money ? { numFmt: MONEY } : c.pct ? { numFmt: PCT } : {} }))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    return ws
  }

  const r = sheet('Resumen', [{ header: 'Indicador', key: 'k', width: 30 }, { header: 'Período', key: 'cur', width: 18 }, { header: 'Período anterior', key: 'prev', width: 18 }, { header: 'Variación', key: 'chg', width: 12, pct: true }])
  const t = d.totals, p = d.compare.totals
  r.addRow({ k: d.organization.name })
  r.addRow({ k: 'Período', cur: rangeLabel(d.range), prev: rangeLabel(d.compare.range) })
  const kpi = (k: string, cur: number, prev: number, isMoney: boolean) => {
    const row = r.addRow({ k, cur: isMoney ? num(cur) : cur, prev: isMoney ? num(prev) : prev, chg: change(cur, prev) })
    if (isMoney) { row.getCell('cur').numFmt = MONEY; row.getCell('prev').numFmt = MONEY }
  }
  kpi('Facturación', t.revenue, p.revenue, true)
  kpi('Ventas', t.sales, p.sales, false)
  kpi('Ticket promedio', t.avgTicket, p.avgTicket, true)
  kpi('Comensales en salón', t.guests, p.guests, false)
  kpi('Descuentos', d.extras.discounts, d.compare.extras.discounts, true)
  kpi('Ventas anuladas ($)', d.extras.voided.amount, d.compare.extras.voided.amount, true)
  kpi('Platos anulados ($)', d.extras.itemVoids.amount, d.compare.extras.itemVoids.amount, true)

  const s = sheet('Sedes', [{ header: 'Marca', key: 'brand', width: 22 }, { header: 'Sede', key: 'name', width: 22 }, { header: 'Facturación', key: 'rev', money: true }, { header: 'Período anterior', key: 'prev', money: true }, { header: 'Variación', key: 'chg', width: 12, pct: true }, { header: 'Ventas', key: 'sales', width: 10 }, { header: 'Ticket', key: 'ticket', money: true }, { header: '% del total', key: 'share', width: 12, pct: true }])
  for (const l of d.locations) s.addRow({ brand: l.brandName, name: l.name, rev: num(l.revenue), prev: num(l.prevRevenue), chg: change(l.revenue, l.prevRevenue), sales: l.sales, ticket: num(l.avgTicket), share: l.share })

  const b = sheet('Marcas', [{ header: 'Marca', key: 'name', width: 24 }, { header: 'Facturación', key: 'rev', money: true }, { header: 'Período anterior', key: 'prev', money: true }, { header: 'Variación', key: 'chg', width: 12, pct: true }, { header: 'Ventas', key: 'sales', width: 10 }, { header: 'Ticket', key: 'ticket', money: true }, { header: 'Margen teórico', key: 'margin', width: 14, pct: true }, { header: 'Ventas con receta', key: 'cov', width: 16, pct: true }])
  for (const x of d.brands) b.addRow({ name: x.name, rev: num(x.totals.revenue), prev: num(x.prevTotals.revenue), chg: change(x.totals.revenue, x.prevTotals.revenue), sales: x.totals.sales, ticket: num(x.totals.avgTicket), margin: x.margin?.marginPct ?? null, cov: x.margin?.coveragePct ?? null })

  const day = sheet(d.series.unit === 'hour' ? 'Por hora' : 'Por día', [{ header: d.series.unit === 'hour' ? 'Hora' : 'Día', key: 'l', width: 14 }, { header: 'Total', key: 'total', money: true }, ...d.series.byBrand.map(x => ({ header: x.name, key: x.slug, money: true })), { header: 'Período anterior', key: 'prev', money: true }])
  d.series.labels.forEach((l, i) => {
    const row: Record<string, unknown> = { l: d.series.unit === 'hour' ? `${l}:00` : fmtDate(l), total: num(d.series.total[i] ?? 0), prev: num(d.series.prevTotal[i] ?? 0) }
    for (const x of d.series.byBrand) row[x.slug] = num(x.values[i] ?? 0)
    day.addRow(row)
  })

  const pr = sheet('Productos', [{ header: 'Producto', key: 'name', width: 32 }, { header: 'Marcas', key: 'brands', width: 24 }, { header: 'Unidades', key: 'q', width: 10 }, { header: 'Facturación', key: 'rev', money: true }, { header: 'Período anterior', key: 'prev', money: true }, { header: 'Variación', key: 'chg', width: 12, pct: true }])
  for (const x of d.products) pr.addRow({ name: x.name, brands: x.brands.join(', '), q: x.quantity, rev: num(x.revenue), prev: num(x.prevRevenue), chg: change(x.revenue, x.prevRevenue) })

  const c = sheet('Categorías', [{ header: 'Categoría', key: 'name', width: 28 }, { header: 'Unidades', key: 'q', width: 10 }, { header: 'Facturación', key: 'rev', money: true }, { header: 'Período anterior', key: 'prev', money: true }, { header: 'Variación', key: 'chg', width: 12, pct: true }])
  for (const x of d.categories) c.addRow({ name: x.category, q: x.quantity, rev: num(x.revenue), prev: num(x.prevRevenue), chg: change(x.revenue, x.prevRevenue) })

  const pm = sheet('Medios de pago', [{ header: 'Medio', key: 'name', width: 20 }, { header: 'Cobros', key: 'count', width: 10 }, { header: 'Monto', key: 'amount', money: true }, { header: 'Período anterior', key: 'prev', money: true }, { header: 'Variación', key: 'chg', width: 12, pct: true }])
  for (const x of d.byPayment) pm.addRow({ name: METHOD_LABEL[x.method] ?? x.method, count: x.count, amount: num(x.amount), prev: num(x.prevAmount), chg: change(x.amount, x.prevAmount) })

  const ch = sheet('Canales', [{ header: 'Canal', key: 'name', width: 20 }, { header: 'Ventas', key: 'sales', width: 10 }, { header: 'Facturación', key: 'rev', money: true }, { header: 'Período anterior', key: 'prev', money: true }, { header: 'Variación', key: 'chg', width: 12, pct: true }])
  for (const k of SALE_CHANNELS) ch.addRow({ name: CHANNEL_LABEL[k], sales: d.byChannel[k].sales, rev: num(d.byChannel[k].revenue), prev: num(d.prevByChannel[k].revenue), chg: change(d.byChannel[k].revenue, d.prevByChannel[k].revenue) })

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function buildDashboardPdf(d: OrgDashboard): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, L = 16, R = W - 16
  let y = 18
  const ensure = (space: number) => { if (y + space > 282) { doc.addPage(); y = 18 } }
  const section = (title: string) => {
    ensure(24)
    y += 3
    doc.setDrawColor(220)
    doc.line(L, y - 4, R, y - 4)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(title.toUpperCase(), L, y)
    doc.setFontSize(9)
    y += 6
  }
  /** Fila de tabla: primera columna a la izquierda, el resto alineado a la derecha en `cols` (mm desde la izquierda). */
  const row = (cells: string[], cols: number[], bold = false) => {
    ensure(6)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(cells[0], L, y, { maxWidth: cols[0] - L - 2 })
    cells.slice(1).forEach((c, i) => doc.text(c, cols[i + 1], y, { align: 'right' }))
    y += 5.5
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(d.organization.name, L, y); y += 7
  doc.setFontSize(11); doc.setFont('helvetica', 'normal')
  doc.text(`Resumen del grupo — ${rangeLabel(d.range)}`, L, y); y += 5
  doc.setFontSize(9); doc.setTextColor(110)
  doc.text(`Comparado con ${rangeLabel(d.compare.range)}`, L, y); doc.setTextColor(0); y += 6

  const t = d.totals, p = d.compare.totals
  section('Totales')
  const K = [100, 140, 172, R]
  row(['', 'Período', 'Anterior', 'Variación'], K, true)
  row(['Facturación', pesos(t.revenue), pesos(p.revenue), changeText(t.revenue, p.revenue)], K, true)
  row(['Ventas', String(t.sales), String(p.sales), changeText(t.sales, p.sales)], K)
  row(['Ticket promedio', pesos(t.avgTicket), pesos(p.avgTicket), changeText(t.avgTicket, p.avgTicket)], K)
  row(['Comensales en salón', String(t.guests), String(p.guests), changeText(t.guests, p.guests)], K)
  row(['Descuentos', pesos(d.extras.discounts), pesos(d.compare.extras.discounts), changeText(d.extras.discounts, d.compare.extras.discounts)], K)
  row(['Ventas anuladas', `${d.extras.voided.count} (${pesos(d.extras.voided.amount)})`, `${d.compare.extras.voided.count} (${pesos(d.compare.extras.voided.amount)})`, changeText(d.extras.voided.amount, d.compare.extras.voided.amount)], K)

  if (d.brands.length > 1) {
    section('Por marca')
    const B = [90, 125, 150, 170, R]
    row(['Marca', 'Facturación', 'Variación', 'Ventas', 'Margen'], B, true)
    for (const x of d.brands) row([x.name, pesos(x.totals.revenue), changeText(x.totals.revenue, x.prevTotals.revenue), String(x.totals.sales), x.margin ? `${x.margin.marginPct.toLocaleString('es-AR')}%` : '-'], B)
  }

  section('Ranking de sedes')
  const S = [95, 128, 152, 172, R]
  row(['Sede', 'Facturación', 'Variación', 'Ventas', '% total'], S, true)
  for (const l of d.locations) row([d.brands.length > 1 ? `${l.brandName} · ${l.name}` : l.name, pesos(l.revenue), changeText(l.revenue, l.prevRevenue), String(l.sales), `${l.share.toLocaleString('es-AR')}%`], S)

  section('Productos que más facturan')
  const P = [120, 145, 170, R]
  row(['Producto', 'Unidades', 'Facturación', 'Variación'], P, true)
  for (const x of d.products.filter(x => x.revenue > 0).slice(0, 15)) row([x.name, String(x.quantity), pesos(x.revenue), changeText(x.revenue, x.prevRevenue)], P)

  section('Categorías')
  for (const x of d.categories.filter(x => x.revenue > 0).slice(0, 15)) row([x.category, String(x.quantity), pesos(x.revenue), changeText(x.revenue, x.prevRevenue)], P)

  section('Medios de pago')
  const M = [120, 145, 170, R]
  row(['Medio', 'Cobros', 'Monto', 'Variación'], M, true)
  for (const x of d.byPayment) row([METHOD_LABEL[x.method] ?? x.method, String(x.count), pesos(x.amount), changeText(x.amount, x.prevAmount)], M)

  section('Por canal')
  for (const k of SALE_CHANNELS) {
    if (!d.byChannel[k].sales && !d.prevByChannel[k].sales) continue
    row([CHANNEL_LABEL[k], String(d.byChannel[k].sales), pesos(d.byChannel[k].revenue), changeText(d.byChannel[k].revenue, d.prevByChannel[k].revenue)], M)
  }

  y += 4
  ensure(10)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(120)
  doc.text(`Generado por TakeasyGO el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Mismos números que el panel de cada marca. El margen es teórico (recetas de Inventario). No válido como comprobante fiscal.`, L, y, { maxWidth: R - L })
  return Buffer.from(doc.output('arraybuffer'))
}
