import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import FiscalProfile, { type IFiscalController } from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalControllerJob, { type IFiscalControllerJob } from '@/models/FiscalControllerJob'
import Order from '@/models/Order'
import { FiscalIssueError, resolveReceiver, type ReceiverInput } from './issue'
import { buildFiscalLines, ivaRatesForLocation } from './order-lines'

// ============================================================================
// Controladores fiscales homologados — orden de ejecución 31/10 (fase 3)
// ============================================================================
// Estado real (31/10/2026): NO hay driver de ningún fabricante validado. Este
// módulo deja listo TODO lo que no depende del protocolo del equipo:
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
// Mientras el driver no exista, informa `driver_unavailable` y la operación
// queda bloqueada con ese motivo (no se finge una emisión).
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
    .select('_id locationId total status items deliveryCost posPayments')
    .lean<{
      _id: mongoose.Types.ObjectId
      locationId: mongoose.Types.ObjectId
      total: number
      status: string
      items: { menuItemId?: mongoose.Types.ObjectId; name: string; quantity: number; subtotal: number }[]
      deliveryCost?: number
      posPayments?: { method: string; amount: number }[]
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
        receiver,
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
        payments: (order.posPayments ?? []).map((p) => ({ method: p.method, amountCents: p.amount })),
        issuerIvaCondition: profile?.ivaCondition ?? null,
      },
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
  // Informe que nadie tomó a tiempo (agente apagado): se cancela, no espera.
  await FiscalControllerJob.updateMany(
    {
      tenantId,
      locationId: loc,
      operation: { $in: REPORT_OPERATIONS },
      status: { $in: ['pending', 'claimed'] },
      createdAt: { $lt: new Date(now.getTime() - REPORT_PENDING_TTL_MS) },
    },
    { $set: { status: 'cancelled', completedAt: now, lastError: 'El agente de impresión no lo tomó a tiempo. No se envió nada al equipo: pedilo de nuevo.' } }
  )
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
