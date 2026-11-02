import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import FiscalProfile, { type IFiscalController } from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalControllerJob, { type IFiscalControllerJob } from '@/models/FiscalControllerJob'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { FiscalIssueError, resolveReceiver, type ReceiverInput } from './issue'
import { buildFiscalLines, ivaRatesForLocation } from './order-lines'

// ============================================================================
// Controladores fiscales homologados — orden de ejecución 31/10 (fase 3)
// ============================================================================
// Estado real (02/11/2026): driver Epson TM-T900FA (Vesta) probado en equipo con
// tique a consumidor final y cierre Z. Tique Factura y notas de crédito tienen
// driver según el manual, todavía sin emisión real. Este módulo tiene lo que no
// depende del protocolo del equipo:
//
//   · Modalidad fiscal EXPLÍCITA por sede: 'electronic' (ARCA, CAE) o
//     'controller' (equipo homologado). Excluyentes: una venta nunca termina
//     con factura electrónica Y comprobante de controlador.
//   · Operación persistida e idempotente (una por venta) con su propio ciclo
//     de vida y reserva atómica para el agente local.
//   · Desconexión a mitad de una emisión ⇒ `unknown`: NUNCA se reemite solo;
//     se reconcilia consultando el equipo (operación `query_last`) o lo
//     resuelve una persona.
//
// El agente (printer-agent) ejecuta la operación con el driver del fabricante.
// Sin driver para esa marca, informa `driver_unavailable` y la operación queda
// bloqueada con ese motivo (no se finge una emisión).
//
// Anular una venta: si el comprobante salió, nota de crédito en el equipo; si
// todavía no salió, se frena; si el resultado es incierto, no se decide hasta
// que una persona lo resuelva. Lo que nadie toma a tiempo vence.
// ============================================================================

export type FiscalModality = 'electronic' | 'controller' | 'none'

const CLAIM_TTL_MS = 45_000
const SENDING_TTL_MS = 180_000
/**
 * Un informe sin tomar vence: un Z pedido con el agente apagado no puede quedar
 * en cola y dispararse horas después, cuando alguien prenda la PC.
 */
const REPORT_PENDING_TTL_MS = 2 * 60_000
const REPORT_OPERATIONS = ['x_report', 'z_report'] as const
/** Un comprobante sin tomar en 15 min vence: no sale horas después de la venta. */
const DOCUMENT_PENDING_TTL_MS = 15 * 60_000
/** Se sabe que NO se emitió: se puede volver a mandar. */
const NOT_EMITTED = ['failed', 'expired', 'driver_unavailable'] as const

interface ProfileForModality {
  enabled?: boolean
  pointsOfSale?: { locationId: mongoose.Types.ObjectId }[]
  controllers?: IFiscalController[]
}

/** Modalidad fiscal de una sede, con el perfil ya leído. */
/**
 * Modalidad fiscal de una sede, con el perfil ya leído. 02/11: el controlador
 * NO depende de `enabled` (eso es la factura electrónica de ARCA).
 */
export function modalityFor(profile: ProfileForModality | null, locationId: string | mongoose.Types.ObjectId): FiscalModality {
  if (!profile) return 'none'
  const loc = String(locationId)
  if ((profile.controllers ?? []).some((c) => c.active && String(c.locationId) === loc)) return 'controller'
  if (profile.enabled && (profile.pointsOfSale ?? []).some((p) => String(p.locationId) === loc)) return 'electronic'
  return 'none'
}

export async function loadModality(tenantId: string, locationId: string): Promise<{ modality: FiscalModality; controller: IFiscalController | null }> {
  const profile = await FiscalProfile.findOne({ tenantId }).select('enabled pointsOfSale controllers').lean<ProfileForModality>()
  const modality = modalityFor(profile, locationId)
  const controller = modality === 'controller' ? (profile?.controllers ?? []).find((c) => c.active && String(c.locationId) === String(locationId)) ?? null : null
  return { modality, controller }
}

/**
 * Crea (o devuelve) la operación de controlador para facturar una orden
 * cobrada. Idempotente por orden. Falla si la orden ya tiene factura
 * electrónica (o viceversa: ver prepareInvoiceForOrder).
 */
export async function enqueueControllerInvoice(input: {
  tenantId: string
  orderId: string
  receiver: ReceiverInput
  userId: string
}): Promise<IFiscalControllerJob> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const idempotencyKey = `controller:invoice:${input.orderId}`
  const existing = await FiscalControllerJob.findOne({ tenantId, idempotencyKey })
  if (existing) return existing

  const order = await Order.findOne({ _id: input.orderId, tenantId })
    .select('_id locationId total status items deliveryCost posPayments payment.method')
    .lean<{
      _id: mongoose.Types.ObjectId
      locationId: mongoose.Types.ObjectId
      total: number
      status: string
      items: { menuItemId?: mongoose.Types.ObjectId; name: string; quantity: number; subtotal: number }[]
      deliveryCost?: number
      posPayments?: { method: string; amount: number }[]
      payment?: { method?: string }
    }>()
  if (!order) throw new FiscalIssueError('Orden no encontrada', 404)
  if (order.status === 'cancelled') throw new FiscalIssueError('La orden está anulada: no se factura')

  const { modality, controller } = await loadModality(input.tenantId, String(order.locationId))
  if (modality !== 'controller' || !controller) throw new FiscalIssueError('Esta sede no emite con controlador fiscal')
  if (await FiscalDocument.exists({ tenantId, orderId: order._id, kind: 'invoice', status: { $ne: 'rejected' } })) {
    throw new FiscalIssueError('La venta ya tiene factura electrónica: no se emite otra con el controlador')
  }

  const profile = await FiscalProfile.findOne({ tenantId }).select('ivaCondition defaultIvaRate').lean<{ ivaCondition?: 'responsable_inscripto' | 'monotributo' | 'exento' | null; defaultIvaRate?: number }>()
  const { receiver } = resolveReceiver(profile?.ivaCondition ?? 'responsable_inscripto', input.receiver, order.total)
  const rates = await ivaRatesForLocation(tenantId, order.locationId, profile?.defaultIvaRate ?? 21)
  const { lines, discountCents } = buildFiscalLines(order as never, rates, profile?.defaultIvaRate ?? 21)

  try {
    return await FiscalControllerJob.create({
      tenantId,
      locationId: order.locationId,
      orderId: order._id,
      operation: 'invoice',
      device: { brand: controller.brand, model: controller.model, firmware: controller.firmware, connection: controller.connection, address: controller.address },
      payload: {
        receiver: { ...receiver, address: (input.receiver.address ?? '').trim().slice(0, 120) },
        // totalCents: importe del ítem con IVA (el driver arma el precio unitario
        // con 4 decimales para que cantidad × precio dé exacto este total).
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: Math.round(l.grossCents / Math.max(1, l.quantity)),
          totalCents: l.grossCents,
          ivaRate: l.ivaRate,
        })),
        totalCents: order.total,
        discountCents,
        // Pedido online: no tiene partes de cobro del POS, sí un medio de pago.
        payments: order.posPayments?.length
          ? order.posPayments.map((p) => ({ method: p.method, amountCents: p.amount }))
          : order.payment?.method
            ? [{ method: order.payment.method, amountCents: order.total }]
            : [],
        issuerIvaCondition: profile?.ivaCondition ?? null,
      },
      expiresAt: new Date(Date.now() + DOCUMENT_PENDING_TTL_MS),
      idempotencyKey,
      createdBy: input.userId,
    })
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const winner = await FiscalControllerJob.findOne({ tenantId, idempotencyKey })
      if (winner) return winner
    }
    throw err
  }
}

export type ControllerReportKind = 'x' | 'z'

/**
 * Pide un informe al equipo de la sede: X (salida de cajero) o Z (cierre de la
 * jornada fiscal, irreversible). `requestId` lo genera el POS: reenviar el mismo
 * pedido devuelve la misma operación. Uno a la vez por sede.
 */
export async function enqueueControllerReport(input: {
  tenantId: string
  locationId: string
  kind: ControllerReportKind
  requestId: string
  userId: string
}): Promise<IFiscalControllerJob> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const locationId = new mongoose.Types.ObjectId(input.locationId)
  const idempotencyKey = `controller:report:${input.requestId}`
  const existing = await FiscalControllerJob.findOne({ tenantId, idempotencyKey })
  if (existing) return existing

  const { modality, controller } = await loadModality(input.tenantId, input.locationId)
  if (modality !== 'controller' || !controller) throw new FiscalIssueError('Esta sede no tiene impresora fiscal activa')

  const active = await FiscalControllerJob.exists({
    tenantId,
    locationId,
    operation: { $in: REPORT_OPERATIONS },
    status: { $in: ['pending', 'claimed', 'sending'] },
    createdAt: { $gte: new Date(Date.now() - REPORT_PENDING_TTL_MS - SENDING_TTL_MS) },
  })
  if (active) throw new FiscalIssueError('Ya hay un informe en curso en la impresora fiscal. Esperá a que termine.')

  try {
    return await FiscalControllerJob.create({
      tenantId,
      locationId,
      orderId: null,
      operation: input.kind === 'z' ? 'z_report' : 'x_report',
      device: { brand: controller.brand, model: controller.model, firmware: controller.firmware, connection: controller.connection, address: controller.address },
      payload: null,
      idempotencyKey,
      createdBy: input.userId,
    })
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const winner = await FiscalControllerJob.findOne({ tenantId, idempotencyKey })
      if (winner) return winner
    }
    throw err
  }
}

/**
 * Lo que nadie tomó a tiempo (agente apagado) no se ejecuta después. Reservado
 * sin inicio también: el agente solo envía tras confirmar el inicio.
 */
export async function expireControllerJobs(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId, now = new Date()): Promise<void> {
  const base = { tenantId, locationId, status: { $in: ['pending', 'claimed'] } }
  // Comprobantes: `expiresAt`, porque un reintento manual les da otro plazo. Los
  // creados antes del 02/11 no lo tienen y se cuentan desde la creación.
  const lateDocument = {
    $or: [{ expiresAt: { $ne: null, $lt: now } }, { expiresAt: null, createdAt: { $lt: new Date(now.getTime() - DOCUMENT_PENDING_TTL_MS) } }],
  }
  const message = 'El agente de impresión no lo tomó a tiempo. No se envió nada al equipo.'
  await FiscalControllerJob.updateMany(
    { ...base, createdAt: { $lt: new Date(now.getTime() - REPORT_PENDING_TTL_MS) }, operation: { $in: REPORT_OPERATIONS } },
    { $set: { status: 'cancelled', completedAt: now, claimId: null, lastError: `${message} Pedilo de nuevo.` } }
  )
  await FiscalControllerJob.updateMany(
    { ...base, ...lateDocument, operation: { $nin: REPORT_OPERATIONS } },
    { $set: { status: 'expired', completedAt: now, claimId: null, lastError: `${message} Reintentalo desde Facturación.` } }
  )
}

export type ControllerCreditNoteResult =
  | { kind: 'none' }
  /** El comprobante todavía no había salido: se frenó y no hace falta NC. */
  | { kind: 'stopped' }
  | { kind: 'queued'; job: IFiscalControllerJob }

/**
 * Nota de crédito del comprobante de una venta. Si todavía no se emitió, lo
 * frena. Con el resultado incierto no decide: hay que resolverlo primero.
 */
export async function creditNoteForControllerOrder(input: {
  tenantId: string
  orderId: string
  userId: string
}): Promise<ControllerCreditNoteResult> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const invoice = await FiscalControllerJob.findOne({ tenantId, idempotencyKey: `controller:invoice:${input.orderId}` })
  if (!invoice) return { kind: 'none' }

  if (invoice.status === 'cancelled') return { kind: 'stopped' }
  if (invoice.status !== 'confirmed') {
    // Solo reservado/pendiente (el agente aún no confirmó el inicio) se frena:
    // sin el inicio confirmado, el agente no le manda nada al equipo.
    const stopped = await FiscalControllerJob.findOneAndUpdate(
      { _id: invoice._id, status: { $in: ['pending', 'claimed', ...NOT_EMITTED] } },
      { $set: { status: 'cancelled', completedAt: new Date(), claimId: null, lastError: 'Venta anulada antes de emitir el comprobante.' } },
      { new: true }
    )
    if (stopped) return { kind: 'stopped' }
    throw new FiscalIssueError('El comprobante está en curso o con resultado desconocido: revisalo en Facturación antes de emitir la nota de crédito.')
  }

  const idempotencyKey = `controller:credit:${input.orderId}`
  const existing = await FiscalControllerJob.findOne({ tenantId, idempotencyKey })
  if (existing) return { kind: 'queued', job: existing }
  try {
    const job = await FiscalControllerJob.create({
      tenantId,
      locationId: invoice.locationId,
      orderId: invoice.orderId,
      operation: 'credit_note',
      device: invoice.device,
      payload: {
        ...invoice.payload,
        origin: { documentType: invoice.result.documentType, pointOfSale: invoice.result.pointOfSale, number: invoice.result.number },
      },
      expiresAt: new Date(Date.now() + DOCUMENT_PENDING_TTL_MS),
      idempotencyKey,
      createdBy: input.userId,
    })
    return { kind: 'queued', job }
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const winner = await FiscalControllerJob.findOne({ tenantId, idempotencyKey })
      if (winner) return { kind: 'queued', job: winner }
    }
    throw err
  }
}

/** Vuelve a mandar un comprobante que se sabe NO emitido. */
export async function retryControllerJob(tenantId: string, locationId: string, id: string): Promise<IFiscalControllerJob> {
  const current = await FiscalControllerJob.findOne({ _id: id, tenantId, locationId }).select('operation orderId').lean<{ operation: string; orderId: mongoose.Types.ObjectId | null }>()
  if (current?.operation === 'invoice' && (await Order.exists({ _id: current.orderId, tenantId, status: 'cancelled' }))) {
    throw new FiscalIssueError('La venta está anulada: no se emite el comprobante')
  }
  const job = await FiscalControllerJob.findOneAndUpdate(
    {
      _id: id,
      tenantId,
      locationId,
      operation: { $in: ['invoice', 'credit_note'] },
      status: { $in: NOT_EMITTED },
    },
    {
      $set: { status: 'pending', claimId: null, claimExpiresAt: null, startedAt: null, completedAt: null, lastError: '', expiresAt: new Date(Date.now() + DOCUMENT_PENDING_TTL_MS) },
    },
    { new: true }
  )
  if (!job) throw new FiscalIssueError('Solo se reintenta un comprobante que se sabe que no se emitió')
  return job
}

/** Una persona que miró el equipo resuelve un resultado desconocido. */
export async function resolveControllerJob(input: {
  tenantId: string
  locationId: string
  id: string
  emitted: boolean
  number?: number
  userId: string
}): Promise<IFiscalControllerJob> {
  if (input.emitted && (!Number.isInteger(input.number) || (input.number as number) <= 0)) {
    throw new FiscalIssueError('Indicá el número que figura en el comprobante', 400)
  }
  const job = await FiscalControllerJob.findOneAndUpdate(
    { _id: input.id, tenantId: input.tenantId, locationId: input.locationId, status: 'unknown' },
    {
      $set: input.emitted
        ? { status: 'confirmed', 'result.number': input.number, 'result.issuedAt': new Date(), completedAt: new Date(), lastError: '', resolvedBy: input.userId }
        : { status: 'failed', completedAt: new Date(), lastError: 'Una persona verificó que no se emitió.', resolvedBy: input.userId },
    },
    { new: true }
  )
  if (!job) throw new FiscalIssueError('El comprobante no tiene resultado desconocido')
  return job
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Comprobante de la impresora fiscal tal como lo ve el POS. */
export function controllerDocumentSummary(
  j: IFiscalControllerJob,
  extra: { orderPosId?: string | null; orderNumber?: string | null; orderCancelled?: boolean; hasCreditNote?: boolean } = {}
) {
  const receiver = j.payload?.receiver
  return {
    id: String(j._id),
    kind: j.operation === 'credit_note' ? ('credit_note' as const) : ('invoice' as const),
    status: j.status,
    documentType: j.result?.documentType ?? null,
    pointOfSale: j.result?.pointOfSale ?? null,
    number: j.result?.number ?? null,
    totalCents: j.result?.totalCents ?? j.payload?.totalCents ?? 0,
    message: j.lastError || null,
    createdAt: j.createdAt,
    receiver: { name: receiver?.name ?? '', condition: receiver?.condition ?? 'consumidor_final', docNumber: receiver?.docNumber ?? '0' },
    orderPosId: extra.orderPosId ?? null,
    orderNumber: extra.orderNumber ?? null,
    orderCancelled: Boolean(extra.orderCancelled),
    hasCreditNote: Boolean(extra.hasCreditNote),
  }
}

/** Comprobantes de la impresora fiscal de una sede en un rango de días. */
export async function listControllerDocuments(tenantIdRaw: string, locationIdRaw: string, range: { from?: string | null; to?: string | null }) {
  const tenantId = new mongoose.Types.ObjectId(tenantIdRaw)
  const locationId = new mongoose.Types.ObjectId(locationIdRaw)
  await expireControllerJobs(tenantId, locationId)
  const location = await Location.findOne({ _id: locationId, tenantId }).select('timezone').lean<{ timezone?: string }>()
  const tz = location?.timezone || DEFAULT_TIMEZONE
  const from = range.from && DATE_RE.test(range.from) ? range.from : getTodayStrInTimezone(tz)
  const to = range.to && DATE_RE.test(range.to) && range.to >= from ? range.to : from
  const jobs = await FiscalControllerJob.find({
    tenantId,
    locationId,
    operation: { $in: ['invoice', 'credit_note'] },
    createdAt: { $gte: getDayAndMidnightInTimezone(from, tz).date, $lt: getDayAndMidnightInTimezone(nextDay(to), tz).date },
  })
    .sort({ createdAt: -1 })
    .limit(500)

  const orderIds = jobs.map((j) => j.orderId).filter(Boolean)
  const orders = await Order.find({ tenantId, _id: { $in: orderIds } })
    .select('posId orderNumber status')
    .lean<{ _id: mongoose.Types.ObjectId; posId?: string; orderNumber?: string; status: string }[]>()
  const byId = new Map(orders.map((o) => [String(o._id), o]))
  const credited = new Set(
    (await FiscalControllerJob.find({ tenantId, operation: 'credit_note', orderId: { $in: orderIds } }).select('orderId').lean<{ orderId: mongoose.Types.ObjectId }[]>()).map((c) => String(c.orderId))
  )
  const documents = jobs.map((j) => {
    const order = byId.get(String(j.orderId))
    return controllerDocumentSummary(j, {
      orderPosId: order?.posId ?? null,
      orderNumber: order?.orderNumber ?? null,
      orderCancelled: order?.status === 'cancelled',
      hasCreditNote: credited.has(String(j.orderId)),
    })
  })
  const emitted = documents.filter((d) => d.status === 'confirmed')
  const sum = (kind: string) => emitted.filter((d) => d.kind === kind).reduce((s, d) => s + d.totalCents, 0)
  return {
    range: { from, to },
    counts: {
      confirmed: emitted.length,
      pending: documents.filter((d) => ['pending', 'claimed', 'sending'].includes(d.status)).length,
      attention: documents.filter((d) => d.status === 'unknown' || (NOT_EMITTED as readonly string[]).includes(d.status)).length,
    },
    totals: { invoicedCents: sum('invoice'), creditedCents: sum('credit_note'), netCents: sum('invoice') - sum('credit_note') },
    documents,
  }
}

export interface ControllerAttention {
  /** Pudo haber salido o no: hay que mirar el equipo. */
  unknown: number
  /** Venta cobrada cuyo comprobante se sabe que no salió. */
  notEmitted: number
  /** Venta anulada con comprobante emitido y sin nota de crédito. */
  voidedWithoutCredit: number
}

/** Lo que necesita a una persona. Solo mira los últimos 7 días. */
export async function controllerAttention(tenantId: mongoose.Types.ObjectId, loc: { locationId?: mongoose.Types.ObjectId }, now = new Date()): Promise<ControllerAttention> {
  const since = new Date(now.getTime() - 7 * 86_400_000)
  const base = { tenantId, ...loc, createdAt: { $gte: since } }
  const documents = { $in: ['invoice', 'credit_note'] }
  const [unknown, notEmittedJobs, confirmed] = await Promise.all([
    FiscalControllerJob.countDocuments({ ...base, operation: documents, status: 'unknown' }),
    FiscalControllerJob.find({ ...base, operation: documents, status: { $in: NOT_EMITTED } }).select('orderId operation').limit(200).lean<{ orderId: mongoose.Types.ObjectId; operation: string }[]>(),
    FiscalControllerJob.find({ ...base, operation: 'invoice', status: 'confirmed' }).select('orderId').limit(2000).lean<{ orderId: mongoose.Types.ObjectId }[]>(),
  ])
  const ids = [...notEmittedJobs, ...confirmed].map((j) => j.orderId)
  const cancelled = new Set((await Order.find({ tenantId, _id: { $in: ids }, status: 'cancelled' }).select('_id').lean<{ _id: mongoose.Types.ObjectId }[]>()).map((o) => String(o._id)))
  const credited = new Set(
    (await FiscalControllerJob.find({ tenantId, operation: 'credit_note', orderId: { $in: [...cancelled].map((id) => new mongoose.Types.ObjectId(id)) } }).select('orderId').lean<{ orderId: mongoose.Types.ObjectId }[]>()).map((c) => String(c.orderId))
  )
  return {
    unknown,
    // Una venta anulada no necesita el comprobante que no salió.
    notEmitted: notEmittedJobs.filter((j) => j.operation === 'credit_note' || !cancelled.has(String(j.orderId))).length,
    voidedWithoutCredit: confirmed.filter((j) => cancelled.has(String(j.orderId)) && !credited.has(String(j.orderId))).length,
  }
}

/** Reserva atómica de operaciones de controlador para el poll del agente. */
export async function claimControllerJobs(
  tenantId: mongoose.Types.ObjectId,
  locationId: mongoose.Types.ObjectId | string,
  agentVersion: string | null,
  limit = 5
): Promise<IFiscalControllerJob[]> {
  const loc = new mongoose.Types.ObjectId(String(locationId))
  const now = new Date()
  // «Enviando» sin resultado: el equipo pudo haber emitido ⇒ desconocido.
  await FiscalControllerJob.updateMany(
    { tenantId, locationId: loc, status: 'sending', startedAt: { $lt: new Date(now.getTime() - SENDING_TTL_MS) } },
    { $set: { status: 'unknown', lastError: 'El agente no informó el resultado: consultar el equipo antes de reintentar.' } }
  )
  await expireControllerJobs(tenantId, loc, now)
  // Reserva vencida sin inicio: nunca se mandó al equipo ⇒ vuelve a pendiente.
  await FiscalControllerJob.updateMany(
    { tenantId, locationId: loc, status: 'claimed', claimExpiresAt: { $lt: now } },
    { $set: { status: 'pending', claimId: null, claimExpiresAt: null } }
  )
  const out: IFiscalControllerJob[] = []
  for (let i = 0; i < limit; i++) {
    const job = await FiscalControllerJob.findOneAndUpdate(
      { tenantId, locationId: loc, status: 'pending' },
      { $set: { status: 'claimed', claimId: randomUUID(), claimExpiresAt: new Date(Date.now() + CLAIM_TTL_MS), agentVersion } },
      { new: true, sort: { createdAt: 1 } }
    )
    if (!job) break
    out.push(job)
  }
  return out
}

/** El agente confirma que va a mandar la operación al equipo. */
export async function startControllerJob(jobId: string, claimId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(jobId) || !claimId) return false
  const job = await FiscalControllerJob.findOneAndUpdate(
    { _id: jobId, status: 'claimed', claimId, claimExpiresAt: { $gte: new Date() } },
    { $set: { status: 'sending', startedAt: new Date() }, $inc: { attempts: 1 } },
    { new: true }
  )
  return Boolean(job)
}

export interface ControllerResult {
  claimId: string
  /** confirmed: el equipo informó el comprobante · failed: seguro que NO emitió · unknown · driver_unavailable */
  outcome: 'confirmed' | 'failed' | 'unknown' | 'driver_unavailable'
  result?: { documentType?: string; pointOfSale?: number; number?: number; issuedAt?: string; totalCents?: number; raw?: string }
  errorMsg?: string
}

/** Resultado del agente. null si no corresponde a la reserva vigente. */
export async function completeControllerJob(jobId: string, r: ControllerResult): Promise<IFiscalControllerJob | null> {
  if (!mongoose.isValidObjectId(jobId) || !r.claimId) return null
  const set: Record<string, unknown> = { completedAt: new Date(), lastError: (r.errorMsg ?? '').slice(0, 500) }
  if (r.outcome === 'confirmed') {
    // Sin número del equipo no hay evidencia: se trata como desconocido.
    if (!r.result || !Number.isInteger(r.result.number)) {
      set.status = 'unknown'
      set.lastError = 'El equipo no informó el número del comprobante: consultar el equipo.'
    } else {
      set.status = 'confirmed'
      set.result = {
        documentType: r.result.documentType ?? null,
        pointOfSale: Number.isInteger(r.result.pointOfSale) ? r.result.pointOfSale : null,
        number: r.result.number,
        issuedAt: r.result.issuedAt ? new Date(r.result.issuedAt) : new Date(),
        totalCents: Number.isInteger(r.result.totalCents) ? r.result.totalCents : null,
        raw: (r.result.raw ?? '').slice(0, 2000),
      }
    }
  } else {
    set.status = r.outcome
  }
  return FiscalControllerJob.findOneAndUpdate(
    { _id: jobId, claimId: r.claimId, status: { $in: ['claimed', 'sending', 'unknown'] } },
    { $set: set },
    { new: true }
  )
}
