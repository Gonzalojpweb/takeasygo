import iconv from 'iconv-lite'
import mongoose from 'mongoose'
import Printer from '@/models/Printer'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import FiscalProfile from '@/models/FiscalProfile'
import type { IFiscalDocument } from '@/models/FiscalDocument'
import { ISSUER_IVA_CONDITION_LABELS, RECEIVER_IVA_CONDITION_LABELS, formatCuit, toPesos, type IssuerIvaCondition } from '@takeasygo/business'

// ============================================================================
// Ticket del comprobante electrónico (ESC/POS) — Fase 5 de caja (2026-10)
// ============================================================================
// Datos que lleva el comprobante impreso (RG 1415 / RG 4291 / RG 4892):
// emisor (razón social, CUIT, domicilio, IIBB, inicio de actividades,
// condición frente al IVA), letra y código, punto de venta y número, fecha,
// receptor, detalle, totales, CAE y vencimiento, y el QR de ARCA.
// Factura B a consumidor final: «IVA contenido» (Ley 27.743, RG 5614).
// Sale por la impresora de caja de la sede (PreClosePrintJob).
// ============================================================================

const ESC = {
  INIT: Buffer.from([0x1b, 0x40]),
  CODE_PAGE: Buffer.from([0x1b, 0x74, 43]),
  CUT: Buffer.from([0x1d, 0x56, 0x01]),
  BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
  LEFT: Buffer.from([0x1b, 0x61, 0x00]),
  CENTER: Buffer.from([0x1b, 0x61, 0x01]),
  NORMAL: Buffer.from([0x1d, 0x21, 0x00]),
  LARGE: Buffer.from([0x1d, 0x21, 0x11]),
}

const NON_LATIN1_RE = /[^\u0000-ÿ€]/g
const enc = (t: string) => iconv.encode(t.replace(NON_LATIN1_RE, ''), 'cp858')
const money = (c: number) =>
  `$${toPesos(c).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** QR nativo ESC/POS (modelo 2, módulo 5, corrección M). */
export function escposQr(data: string): Buffer {
  const bytes = Buffer.from(data, 'utf8')
  const len = bytes.length + 3
  return Buffer.concat([
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([0x1d, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30]),
    bytes,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
  ])
}

export interface IssuerForTicket {
  legalName: string
  cuit: string
  fiscalAddress: string
  grossIncomeNumber: string
  activityStartDate: Date | null
  ivaCondition: IssuerIvaCondition
}

const TYPE_LABEL: Record<string, string> = { invoice: 'FACTURA', credit_note: 'NOTA DE CREDITO' }

/** Líneas de texto del ticket (sin control): base del buffer y de los tests. */
export function fiscalTicketLines(doc: IFiscalDocument, issuer: IssuerForTicket, columns: number): string[] {
  const row = (label: string, value: string) => `${label} ${'.'.repeat(Math.max(1, columns - label.length - value.length - 1))}${value}`
  const rule = '-'.repeat(columns)
  const nro = `${String(doc.pointOfSale).padStart(5, '0')}-${String(doc.number ?? 0).padStart(8, '0')}`
  const date = new Date(doc.issuedAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const out: string[] = [
    issuer.legalName,
    `CUIT ${formatCuit(issuer.cuit)}`,
    issuer.fiscalAddress,
    `${ISSUER_IVA_CONDITION_LABELS[issuer.ivaCondition]}`,
  ]
  if (issuer.grossIncomeNumber) out.push(`IIBB ${issuer.grossIncomeNumber}`)
  if (issuer.activityStartDate) {
    out.push(`Inicio de actividades ${new Date(issuer.activityStartDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}`)
  }
  out.push(
    rule,
    `${TYPE_LABEL[doc.kind]} ${doc.letter}  Cod. ${String(doc.cbteTipo).padStart(3, '0')}`,
    `Nro ${nro}   ${date}`,
    rule,
    `Cliente: ${doc.receiver.name || RECEIVER_IVA_CONDITION_LABELS[doc.receiver.condition]}`,
    `${RECEIVER_IVA_CONDITION_LABELS[doc.receiver.condition]}${doc.receiver.docType === 99 ? '' : ` · ${doc.receiver.docType === 80 ? 'CUIT ' + formatCuit(doc.receiver.docNumber) : 'DNI ' + doc.receiver.docNumber}`}`
  )
  if (doc.associated) {
    out.push(`Asociada a ${String(doc.associated.pointOfSale).padStart(5, '0')}-${String(doc.associated.number).padStart(8, '0')}`)
  }
  out.push(rule)
  for (const line of doc.lines) {
    out.push(row(`${line.quantity} x ${line.description}`.slice(0, columns - 14), money(line.totalCents)))
  }
  out.push(rule)
  if (doc.letter === 'A') {
    out.push(row('Neto gravado', money(doc.amounts.netCents)))
    for (const g of doc.ivaGroups.filter((x) => x.ivaRate > 0)) out.push(row(`IVA ${g.ivaRate}%`, money(g.amountCents)))
    if (doc.amounts.exemptCents > 0) out.push(row('Exento', money(doc.amounts.exemptCents)))
  }
  out.push(row('TOTAL', money(doc.amounts.totalCents)))
  if (doc.letter === 'B' && doc.amounts.ivaCents > 0) {
    out.push(rule, 'Regimen de Transparencia Fiscal al', 'Consumidor (Ley 27.743)', row('IVA contenido', money(doc.amounts.ivaCents)))
  }
  out.push(
    rule,
    `${doc.authMode === 'caea' ? 'CAEA' : 'CAE'} ${doc.cae ?? ''}`,
    `Vto. ${doc.authMode === 'caea' ? 'CAEA' : 'CAE'} ${doc.caeExpiresAt ? new Date(doc.caeExpiresAt).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : ''}`
  )
  if (doc.environment === 'homologation') out.push('*** COMPROBANTE DE PRUEBA ***', '*** SIN VALIDEZ FISCAL ***')
  return out
}

export function buildFiscalTicketBuffer(doc: IFiscalDocument, issuer: IssuerForTicket, columns: number): string {
  const lines = fiscalTicketLines(doc, issuer, columns)
  const chunks: Buffer[] = [ESC.INIT, ESC.CODE_PAGE, ESC.CENTER, ESC.BOLD_ON]
  // Encabezado del emisor centrado; la letra en grande.
  const headerEnd = lines.indexOf('-'.repeat(columns))
  lines.forEach((text, i) => {
    if (i === headerEnd) chunks.push(ESC.BOLD_OFF, ESC.LEFT)
    const isType = text.startsWith('FACTURA') || text.startsWith('NOTA DE CREDITO')
    if (isType) chunks.push(ESC.CENTER, ESC.LARGE, ESC.BOLD_ON)
    chunks.push(enc(`${text}\n`))
    if (isType) chunks.push(ESC.NORMAL, ESC.BOLD_OFF, ESC.LEFT)
  })
  if (doc.qrUrl) chunks.push(ESC.CENTER, enc('\n'), escposQr(doc.qrUrl), enc('\n'))
  chunks.push(enc('\n\n'), ESC.CUT)
  return Buffer.concat(chunks).toString('base64')
}

/** Encola el ticket del comprobante en la impresora de caja de la sede. */
export async function enqueueFiscalTicket(doc: IFiscalDocument): Promise<{ ok: boolean; printerName?: string }> {
  if (doc.status !== 'authorized') return { ok: false }
  const tenantId = new mongoose.Types.ObjectId(String(doc.tenantId))
  const locationId = new mongoose.Types.ObjectId(String(doc.locationId))
  const [printer, profile] = await Promise.all([
    Printer.findOne({ tenantId, locationId, isActive: true, roles: 'cashier' })
      .sort({ name: 1 })
      .lean<{ name: string; connectionType: 'tcp' | 'usb'; ip: string; port: number; paperWidth: number }>(),
    FiscalProfile.findOne({ tenantId })
      .select('legalName cuit fiscalAddress grossIncomeNumber activityStartDate ivaCondition')
      .lean<IssuerForTicket>(),
  ])
  if (!printer || !profile?.ivaCondition) return { ok: false }
  const wide = printer.paperWidth === 80
  await PreClosePrintJob.create({
    tenantId,
    locationId,
    printerName: printer.name,
    connectionType: printer.connectionType,
    ip: printer.ip,
    port: printer.port,
    paperWidth: wide ? 80 : 58,
    data: buildFiscalTicketBuffer(doc, profile, wide ? 48 : 32),
    status: 'pending',
  })
  return { ok: true, printerName: printer.name }
}
