import mongoose from 'mongoose'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import CaeaPeriod from '@/models/CaeaPeriod'
import Order from '@/models/Order'
import PreClosePrintJob from '@/models/PreClosePrintJob'

// ============================================================================
// Salud fiscal del comercio — orden de ejecución 31/10 (P1.3, P1.4, P1.5, P7.3)
// ============================================================================
// Una sola foto para el POS y el panel: qué está pendiente, qué necesita a una
// persona y qué está por vencer. Sin datos sensibles (ni CUIT de clientes, ni
// CAE, ni credenciales): conteos, números de comprobante y motivos.
// ============================================================================

export type FiscalAlertLevel = 'critical' | 'warning' | 'info'

export interface FiscalAlert {
  level: FiscalAlertLevel
  code: string
  message: string
  count?: number
}

export interface FiscalHealth {
  enabled: boolean
  environment: 'homologation' | 'production' | null
  counts: {
    pending: number
    needsReview: number
    rejectedLast24h: number
    caeaToReport: number
    printUnknown: number
    paidWithoutInvoice: number
  }
  oldestPendingMinutes: number | null
  certificateExpiresInDays: number | null
  alerts: FiscalAlert[]
}

/** Pendiente más viejo que esto ⇒ alerta. */
const PENDING_ALERT_MIN = 15
/** Venta cobrada sin comprobante más vieja que esto ⇒ alerta (modo «siempre»). */
const PAID_WITHOUT_INVOICE_MIN = 10
const DAY = 86_400_000

export async function computeFiscalHealth(
  tenantIdRaw: string,
  options: { locationId?: string | null; now?: Date } = {}
): Promise<FiscalHealth> {
  const tenantId = new mongoose.Types.ObjectId(tenantIdRaw)
  const now = options.now ?? new Date()
  const loc = options.locationId ? { locationId: new mongoose.Types.ObjectId(options.locationId) } : {}

  const profile = await FiscalProfile.findOne({ tenantId })
    .select('enabled environment invoicingMode credentials.certificateExpiresAt pointsOfSale')
    .lean<{
      enabled?: boolean
      environment?: 'homologation' | 'production'
      invoicingMode?: 'ask' | 'always' | 'off'
      credentials?: { certificateExpiresAt?: Date | null }
      pointsOfSale?: { locationId: mongoose.Types.ObjectId }[]
    }>()

  const empty: FiscalHealth = {
    enabled: false,
    environment: profile?.environment ?? null,
    counts: { pending: 0, needsReview: 0, rejectedLast24h: 0, caeaToReport: 0, printUnknown: 0, paidWithoutInvoice: 0 },
    oldestPendingMinutes: null,
    certificateExpiresInDays: null,
    alerts: [],
  }
  if (!profile) return empty

  const base = { tenantId, ...loc }
  const [pending, oldest, needsReview, rejected, caeaPending, printUnknown, authErrors] = await Promise.all([
    FiscalDocument.countDocuments({ ...base, status: { $in: ['pending', 'retrying'] } }),
    FiscalDocument.findOne({ ...base, status: { $in: ['pending', 'retrying'] } }).sort({ createdAt: 1 }).select('createdAt').lean<{ createdAt: Date }>(),
    FiscalDocument.countDocuments({ ...base, status: 'needs_review' }),
    FiscalDocument.countDocuments({ ...base, status: 'rejected', updatedAt: { $gte: new Date(now.getTime() - DAY) } }),
    FiscalDocument.countDocuments({ ...base, authMode: 'caea', caeaReportStatus: 'pending' }),
    PreClosePrintJob.countDocuments({ ...base, fiscalDocumentId: { $ne: null }, status: { $in: ['unknown', 'error'] }, createdAt: { $gte: new Date(now.getTime() - 2 * DAY) } }),
    FiscalDocument.countDocuments({ ...base, status: 'retrying', 'arca.lastErrorKind': 'auth' }),
  ])

  // Ventas cobradas sin comprobante (solo cuando el comercio factura siempre:
  // con «preguntar», no facturar es una decisión válida del cajero).
  let paidWithoutInvoice = 0
  if (profile.enabled && profile.invoicingMode === 'always') {
    const fiscalLocations = (profile.pointsOfSale ?? []).map((p) => p.locationId)
    const paid = await Order.find({
      tenantId,
      ...(options.locationId ? loc : { locationId: { $in: fiscalLocations } }),
      'posPayments.0': { $exists: true },
      status: { $ne: 'cancelled' },
      total: { $gt: 0 },
      createdAt: { $gte: new Date(now.getTime() - 2 * DAY), $lte: new Date(now.getTime() - PAID_WITHOUT_INVOICE_MIN * 60_000) },
    })
      .select('_id')
      .limit(500)
      .lean<{ _id: mongoose.Types.ObjectId }[]>()
    if (paid.length > 0) {
      const invoiced = await FiscalDocument.distinct('orderId', { tenantId, kind: 'invoice', orderId: { $in: paid.map((o) => o._id) } })
      paidWithoutInvoice = paid.length - invoiced.length
    }
  }

  const expires = profile.credentials?.certificateExpiresAt ? new Date(profile.credentials.certificateExpiresAt) : null
  const certificateExpiresInDays = expires ? Math.floor((expires.getTime() - now.getTime()) / DAY) : null
  const oldestPendingMinutes = oldest ? Math.floor((now.getTime() - new Date(oldest.createdAt).getTime()) / 60_000) : null

  const alerts: FiscalAlert[] = []
  if (needsReview > 0) {
    alerts.push({ level: 'critical', code: 'needs_review', count: needsReview, message: `${needsReview} comprobante(s) necesitan revisión: el sistema no los emite solo.` })
  }
  if (authErrors > 0) {
    alerts.push({ level: 'critical', code: 'auth_error', count: authErrors, message: 'ARCA rechaza las credenciales: revisá el certificado y su asociación al servicio wsfe.' })
  }
  if (paidWithoutInvoice > 0) {
    alerts.push({ level: 'critical', code: 'paid_without_invoice', count: paidWithoutInvoice, message: `${paidWithoutInvoice} venta(s) cobrada(s) sin comprobante. Facturalas desde el panel.` })
  }
  if (oldestPendingMinutes !== null && oldestPendingMinutes >= PENDING_ALERT_MIN) {
    alerts.push({ level: 'warning', code: 'pending_old', count: pending, message: `${pending} comprobante(s) esperando a ARCA desde hace ${oldestPendingMinutes} min.` })
  }
  if (printUnknown > 0) {
    alerts.push({ level: 'warning', code: 'print_unknown', count: printUnknown, message: `${printUnknown} ticket(s) fiscal(es) sin impresión confirmada. Verificá el papel antes de reimprimir.` })
  }
  if (certificateExpiresInDays !== null && certificateExpiresInDays <= 30) {
    alerts.push({
      level: certificateExpiresInDays <= 7 ? 'critical' : 'warning',
      code: 'certificate_expiring',
      message: certificateExpiresInDays < 0 ? 'El certificado de ARCA está vencido.' : `El certificado de ARCA vence en ${certificateExpiresInDays} día(s).`,
    })
  }
  if (caeaPending > 0) {
    const deadline = await CaeaPeriod.findOne({ tenantId, environment: profile.environment, reportDeadline: { $ne: null } })
      .sort({ reportDeadline: 1 })
      .where('reportDeadline')
      .gte(new Date(now.getTime() - 30 * DAY).getTime())
      .select('reportDeadline')
      .lean<{ reportDeadline: Date }>()
    const days = deadline ? Math.floor((new Date(deadline.reportDeadline).getTime() - now.getTime()) / DAY) : null
    alerts.push({
      level: days !== null && days <= 3 ? 'critical' : 'warning',
      code: 'caea_to_report',
      count: caeaPending,
      message: `${caeaPending} comprobante(s) CAEA sin informar a ARCA${days !== null ? ` (plazo en ${days} día(s))` : ''}.`,
    })
  }
  if (rejected > 0) {
    alerts.push({ level: 'info', code: 'rejected', count: rejected, message: `${rejected} comprobante(s) rechazado(s) por ARCA en las últimas 24 h.` })
  }

  return {
    enabled: Boolean(profile.enabled),
    environment: profile.environment ?? null,
    counts: { pending, needsReview, rejectedLast24h: rejected, caeaToReport: caeaPending, printUnknown, paidWithoutInvoice },
    oldestPendingMinutes,
    certificateExpiresInDays,
    alerts,
  }
}
