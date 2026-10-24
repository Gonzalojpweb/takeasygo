import iconv from 'iconv-lite'
import { CASH_EXPENSE_CATEGORY_LABELS, toPesos } from '@takeasygo/business'
import type { CashExpenseCategory, PaymentMethod, ZReport } from '@takeasygo/types'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'

// ============================================================================
// Ticket térmico del reporte Z (ESC/POS) — Fase 2 de caja (2026-10)
// ============================================================================
// Lee SOLO el snapshot inmutable (`register.zReport`): el ticket impreso, el
// PDF y la vista web muestran siempre los mismos números.
// El buffer viaja como `PreClosePrintJob` (mismo canal que el cierre de
// turno): el printer-agent del local lo imprime en la impresora de caja.
// Documentación: ADMIN/FASE2_Z_PARA_LLEVARSE.md.
// ============================================================================

const ESC_POS = {
  INIT: Buffer.from([0x1b, 0x40]),
  CODE_PAGE: Buffer.from([0x1b, 0x74, 43]), // CP858
  CUT: Buffer.from([0x1d, 0x56, 0x01]),
  BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
  ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
  SIZE_NORMAL: Buffer.from([0x1d, 0x21, 0x00]),
  SIZE_LARGE: Buffer.from([0x1d, 0x21, 0x11]),
}

const NON_LATIN1_RE = /[^\u0000-ÿ€]/g

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  mercadopago: 'MercadoPago',
  posnet_debit: 'Debito',
  posnet_credit: 'Credito',
  kripton: 'Kripton',
  transfer: 'Transferencia',
}

function enc(text: string): Buffer {
  return iconv.encode(text.replace(NON_LATIN1_RE, ''), 'cp858')
}

export function money(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${toPesos(Math.abs(cents)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface ZTicketContext {
  tenantName: string
  locationName: string
  openedAt: Date
  /** 32 (58 mm) o 48 (80 mm). */
  columns: number
  timezone?: string
  /** true en una reimpresión (se marca en el ticket). */
  reprint?: boolean
}

/** Líneas de texto del ticket (sin códigos de control): base del buffer y de los tests. */
export function zTicketLines(z: ZReport, ctx: ZTicketContext): { text: string; bold?: boolean; center?: boolean; large?: boolean }[] {
  const tz = ctx.timezone || DEFAULT_TIMEZONE
  const cols = ctx.columns
  const when = (d: Date | string) =>
    new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz })
  const row = (label: string, value: string) => {
    const dots = '.'.repeat(Math.max(1, cols - label.length - value.length - 1))
    return { text: `${label} ${dots}${value}` }
  }
  const rule = (c = '-') => ({ text: c.repeat(cols) })
  const title = (t: string) => ({ text: t, bold: true, center: true })

  const diff = z.difference
  const result = diff === 0 ? 'CAJA EXACTA' : diff > 0 ? `SOBRANTE ${money(diff)}` : `FALTANTE ${money(Math.abs(diff))}`

  const out: { text: string; bold?: boolean; center?: boolean; large?: boolean }[] = [
    { text: ctx.locationName.toUpperCase(), bold: true, center: true, large: true },
    { text: 'CIERRE DE CAJA (Z)', bold: true, center: true },
  ]
  if (ctx.reprint) out.push({ text: '*** REIMPRESION ***', center: true })
  out.push(
    rule('='),
    { text: `Abrio:  ${when(ctx.openedAt)}` },
    { text: `Cerro:  ${when(z.closedAt)}` },
    { text: `Por:    ${z.closedBy}` },
    rule(),
    title('EFECTIVO'),
    row('Fondo inicial', money(z.initialAmount)),
    row('Esperado', money(z.expectedAmount)),
    row('Contado', money(z.finalAmount))
  )
  if (z.closingCount && z.closingCount.bills.length > 0) {
    for (const b of z.closingCount.bills) {
      out.push(row(`  ${money(b.value).replace(',00', '')} x ${b.count}`, money(b.value * b.count)))
    }
    if (z.closingCount.coins > 0) out.push(row('  Monedas', money(z.closingCount.coins)))
  }
  out.push({ text: result, bold: true, center: true, large: true }, rule(), title('VENTAS POR MEDIO DE PAGO'))

  const methods = Object.entries(z.byPaymentMethod ?? {}).filter(([, v]) => v !== 0)
  if (methods.length === 0) out.push({ text: 'Sin ventas' })
  for (const [m, v] of methods) out.push(row(METHOD_LABELS[m as PaymentMethod] ?? m, money(v)))
  out.push(row('Total ventas', money(z.salesTotal)))
  if (z.refundTotal > 0) out.push(row('Devoluciones', money(-z.refundTotal)))
  if ((z.voidCount ?? 0) > 0) out.push(row('Ventas anuladas', String(z.voidCount)))
  if (z.fiscal) {
    out.push(row(`Facturado (${z.fiscal.invoices})`, money(z.fiscal.invoicedCents)))
    if (z.fiscal.creditNotes > 0) out.push(row(`Notas de credito (${z.fiscal.creditNotes})`, money(-z.fiscal.creditedCents)))
    if (z.fiscal.pending > 0) out.push(row('Facturas sin CAE', String(z.fiscal.pending)))
  }

  const categories = Object.entries(z.byCategory ?? {}).filter(([, v]) => (v ?? 0) > 0)
  if (categories.length > 0) {
    out.push(rule(), title('GASTOS Y RETIROS'))
    for (const [c, v] of categories) {
      out.push(row(CASH_EXPENSE_CATEGORY_LABELS[c as CashExpenseCategory] ?? c, money(-(v ?? 0))))
    }
  }

  out.push(
    rule(),
    row('Movimientos', String(z.totalMovements)),
    rule('='),
    { text: '' },
    { text: 'Firma del responsable:', center: true },
    { text: '', center: true },
    { text: '________________________', center: true },
    { text: '' }
  )
  return out
}

/** Buffer ESC/POS del Z en base64 (lo imprime el printer-agent). */
export function buildZTicketBuffer(z: ZReport, ctx: ZTicketContext): string {
  return escPosFromLines(zTicketLines(z, ctx))
}

export type TicketLine = { text: string; bold?: boolean; center?: boolean; large?: boolean }

/**
 * Líneas de texto → buffer ESC/POS en base64 (CP858, corte al final). Lo
 * comparten el Z y la precuenta del POS (Fase E): mismo canal, mismo agente.
 */
export function escPosFromLines(lines: TicketLine[]): string {
  const chunks: Buffer[] = [ESC_POS.INIT, ESC_POS.CODE_PAGE, Buffer.from([0x1b, 0x33, 36])]
  for (const line of lines) {
    chunks.push(line.center ? ESC_POS.ALIGN_CENTER : ESC_POS.ALIGN_LEFT)
    if (line.large) chunks.push(ESC_POS.SIZE_LARGE)
    if (line.bold) chunks.push(ESC_POS.BOLD_ON)
    chunks.push(enc(`${line.text}\n`))
    if (line.bold) chunks.push(ESC_POS.BOLD_OFF)
    if (line.large) chunks.push(ESC_POS.SIZE_NORMAL)
  }
  chunks.push(enc('\n\n'), ESC_POS.CUT)
  return Buffer.concat(chunks).toString('base64')
}
