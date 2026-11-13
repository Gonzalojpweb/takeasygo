import { printerForDocument } from '@/lib/printers/select'
import mongoose from 'mongoose'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument, { type IFiscalDocument } from '@/models/FiscalDocument'
import Order from '@/models/Order'
import {
  buildFiscalTicketBytes,
  escposQrBytes,
  fiscalTicketLines as sharedFiscalTicketLines,
  type FiscalTicketDoc,
  type FiscalTicketIssuer,
  type FiscalTicketSaleInfo,
} from '@takeasygo/business/escpos'

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

// El armado del ticket vive en @takeasygo/business/escpos (fiscal-ticket.ts)
// desde la etapa 5 del POS offline (12/11/2026): el equipo sin internet
// imprime la factura con CAEA con los mismos bytes.

export type IssuerForTicket = Omit<FiscalTicketIssuer, 'activityStartDate'> & { activityStartDate: Date | null }
export type TicketSaleInfo = FiscalTicketSaleInfo

/** QR nativo ESC/POS (modelo 2, módulo 5, corrección M). */
export function escposQr(data: string): Buffer {
  return Buffer.from(escposQrBytes(data))
}

/** Líneas de texto del ticket (sin control): base del buffer y de los tests. */
export function fiscalTicketLines(doc: IFiscalDocument, issuer: IssuerForTicket, columns: number, options: { reprint?: number; sale?: TicketSaleInfo | null } = {}): string[] {
  return sharedFiscalTicketLines(doc as unknown as FiscalTicketDoc, issuer, columns, options)
}

export function buildFiscalTicketBuffer(doc: IFiscalDocument, issuer: IssuerForTicket, columns: number, options: { reprint?: number; sale?: TicketSaleInfo | null } = {}): string {
  return Buffer.from(buildFiscalTicketBytes(doc as unknown as FiscalTicketDoc, issuer, columns, options)).toString('base64')
}

/** Medio de pago, mesa y número de la orden del comprobante (no fiscal; si falla, el ticket sale igual). */
async function loadSaleInfo(doc: IFiscalDocument): Promise<TicketSaleInfo | null> {
  if (!doc.orderId) return null
  const order = await Order.findOne({ _id: doc.orderId, tenantId: doc.tenantId })
    .select('orderNumber posTableNumber posPayments payment.method total')
    .lean<{ orderNumber?: string; posTableNumber?: number; posPayments?: { method: string; amount: number }[]; payment?: { method?: string }; total?: number }>()
  if (!order) return null
  const payments = (order.posPayments ?? []).length > 0
    ? (order.posPayments ?? []).map((p) => ({ method: p.method, amountCents: p.amount }))
    : order.payment?.method && order.payment.method !== 'mixed'
      ? [{ method: order.payment.method, amountCents: doc.amounts.totalCents }]
      : []
  return { orderNumber: order.orderNumber ?? null, tableNumber: order.posTableNumber ?? null, payments }
}

export type EnqueueTicketResult = {
  ok: boolean
  printerName?: string
  jobId?: string
  /** El original ya estaba encolado/impreso: no se generó otro. */
  duplicate?: boolean
  reprint?: number
  reason?: 'not_authorized' | 'no_printer' | 'no_profile' | 'in_progress'
}

/**
 * Encola el ticket del comprobante en la impresora de caja de la sede.
 *
 * Orden de ejecución 31/10 (P0.2):
 *   · Original: UNA vez por comprobante (dedupeKey único). Llamarlo de nuevo
 *     (reintento del POS, factura online que se re-procesa) no imprime otro.
 *   · Reimpresión: pedido explícito de una persona; correlativa
 *     (printing.reprints), marcada en el papel y rechazada si ya hay una en
 *     curso (doble clic). La auditoría la registra quien la pide.
 *   · Solo comprobantes AUTORIZADOS: un ticket nunca sale como válido sin CAE.
 */
export async function enqueueFiscalTicket(
  doc: IFiscalDocument,
  options: { reprint?: boolean; requestedBy?: string | null } = {}
): Promise<EnqueueTicketResult> {
  if (doc.status !== 'authorized') return { ok: false, reason: 'not_authorized' }
  const tenantId = new mongoose.Types.ObjectId(String(doc.tenantId))
  const locationId = new mongoose.Types.ObjectId(String(doc.locationId))
  const [printer, profile] = await Promise.all([
    printerForDocument(tenantId, locationId, doc.kind === 'credit_note' ? 'nota_credito' : 'factura'),
    FiscalProfile.findOne({ tenantId })
      .select('legalName cuit fiscalAddress grossIncomeNumber activityStartDate ivaCondition')
      .lean<IssuerForTicket>(),
  ])
  if (!printer) return { ok: false, reason: 'no_printer' }
  if (!profile?.ivaCondition) return { ok: false, reason: 'no_profile' }
  const sale = await loadSaleInfo(doc).catch(() => null)
  const wide = printer.paperWidth === 80

  let reprint = 0
  let dedupeKey = `fiscal:${String(doc._id)}:original`
  if (options.reprint) {
    const active = await PreClosePrintJob.exists({ fiscalDocumentId: doc._id, status: { $in: ['pending', 'claimed', 'printing'] } })
    if (active) return { ok: false, reason: 'in_progress' }
    const counted = await FiscalDocument.findOneAndUpdate(
      { _id: doc._id },
      { $inc: { 'printing.reprints': 1 } },
      { new: true, projection: { 'printing.reprints': 1 } }
    )
    reprint = counted?.printing?.reprints ?? 1
    dedupeKey = `fiscal:${String(doc._id)}:reprint:${reprint}`
  }

  let job
  try {
    job = await PreClosePrintJob.create({
      tenantId,
      locationId,
      printerName: printer.name,
      connectionType: printer.connectionType,
      ip: printer.ip,
      port: printer.port,
      paperWidth: wide ? 80 : 58,
      data: buildFiscalTicketBuffer(doc, profile, wide ? 48 : 32, { reprint: reprint || undefined, sale }),
      status: 'pending',
      kind: doc.kind === 'credit_note' ? 'fiscal_credit_note' : 'fiscal_invoice',
      fiscalDocumentId: doc._id,
      isReprint: reprint > 0,
      requestedBy: options.requestedBy ?? null,
      dedupeKey,
    })
  } catch (err) {
    // Original ya encolado (otra llamada concurrente o un reintento): no se duplica.
    if ((err as { code?: number })?.code === 11000 && !options.reprint) {
      return { ok: true, printerName: printer.name, duplicate: true }
    }
    throw err
  }
  await FiscalDocument.updateOne(
    { _id: doc._id },
    { $set: { 'printing.status': 'queued', 'printing.lastJobId': job._id, 'printing.lastError': '' } }
  )
  return { ok: true, printerName: printer.name, jobId: String(job._id), reprint: reprint || undefined }
}
