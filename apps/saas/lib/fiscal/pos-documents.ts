import mongoose from 'mongoose'
import FiscalDocument, { type IFiscalDocument } from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import Location from '@/models/Location'
import { PosError } from '@/lib/pos-online/errors'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { documentSummary } from './issue'

// ============================================================================
// Factura electrónica en el POS (Fase L, 2026-10)
// ============================================================================
// Pedido 24/10: «la factura electrónica es del POS» (hay comercios con POS y
// sin SaaS). El POS opera los comprobantes de SU sede: lista del día o rango,
// reintentar, reimprimir, nota de crédito. Mismas funciones que el panel
// (lib/fiscal/issue) y mismo ambiente que el perfil (producción o pruebas,
// nunca mezclados). La configuración (CUIT, certificado) sigue siendo de
// admin porque maneja secretos.
// ============================================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function fiscalEnvironment(tenantId: string): Promise<string> {
  const profile = await FiscalProfile.findOne({ tenantId }).select('environment').lean<{ environment?: string }>()
  return profile?.environment ?? 'homologation'
}

export async function listPosFiscalDocuments(tenantId: string, locationId: string, range: { from?: string | null; to?: string | null }) {
  const location = await Location.findOne({ _id: locationId, tenantId }).select('timezone').lean<{ timezone?: string }>()
  const tz = location?.timezone || DEFAULT_TIMEZONE
  const from = range.from && DATE_RE.test(range.from) ? range.from : getTodayStrInTimezone(tz)
  const to = range.to && DATE_RE.test(range.to) && range.to >= from ? range.to : from
  const environment = await fiscalEnvironment(tenantId)
  const docs = await FiscalDocument.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    locationId: new mongoose.Types.ObjectId(locationId),
    environment,
    issuedAt: { $gte: getDayAndMidnightInTimezone(from, tz).date, $lt: getDayAndMidnightInTimezone(nextDay(to), tz).date },
  })
    .sort({ issuedAt: -1 })
    .limit(500)

  const authorized = docs.filter((d) => d.status === 'authorized')
  // Facturas que ya tienen nota de crédito (no se ofrece emitir otra).
  const credited = new Set(
    (await FiscalDocument.find({ tenantId, kind: 'credit_note', 'associated.documentId': { $in: docs.map((d) => d._id) } }).select('associated.documentId').lean<{ associated?: { documentId?: unknown } }[]>())
      .map((c) => String(c.associated?.documentId))
  )
  const sum = (kind: string) => authorized.filter((d) => d.kind === kind).reduce((s, d) => s + d.amounts.totalCents, 0)
  return {
    range: { from, to },
    environment,
    counts: {
      authorized: authorized.length,
      pending: docs.filter((d) => d.status === 'pending' || d.status === 'retrying').length,
      rejected: docs.filter((d) => d.status === 'rejected').length,
    },
    totals: { invoicedCents: sum('invoice'), creditedCents: sum('credit_note'), netCents: sum('invoice') - sum('credit_note') },
    documents: docs.map((d) => ({
      ...documentSummary(d),
      issuedAt: d.issuedAt,
      orderId: String(d.orderId),
      orderPosId: d.orderPosId ?? null,
      orderNumber: d.orderNumber ?? null,
      receiver: { name: d.receiver.name, docType: d.receiver.docType, docNumber: d.receiver.docNumber, condition: d.receiver.condition },
      qrUrl: d.qrUrl ?? null,
      hasCreditNote: credited.has(String(d._id)),
    })),
  }
}

/** Comprobante de la sede del token (404 si es de otra sede o no existe). */
export async function findPosFiscalDocument(tenantId: string, locationId: string, id: unknown): Promise<IFiscalDocument> {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw PosError.notFound('Comprobante no encontrado')
  const doc = await FiscalDocument.findOne({ _id: id, tenantId, locationId })
  if (!doc) throw PosError.notFound('Comprobante no encontrado')
  return doc
}
