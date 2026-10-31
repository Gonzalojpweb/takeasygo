import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import PreClosePrintJob, { type IPreClosePrintJob, type PrintOutcome } from '@/models/PreClosePrintJob'
import FiscalDocument, { type FiscalPrintStatus } from '@/models/FiscalDocument'
import Order from '@/models/Order'

// ============================================================================
// Ciclo de vida de los trabajos de impresión — orden de ejecución 31/10 (P0.2)
// ============================================================================
// Problema: el servidor devolvía en cada poll (cada 3–5 s) TODOS los trabajos
// pendientes sin marcarlos, y el agente no descartaba repetidos: si la
// impresora tardaba o se perdía la confirmación, el mismo ticket (factura
// incluida) salía varias veces.
//
// Reglas:
//   · Reserva ATÓMICA por trabajo (findOneAndUpdate con claimId): dos polls o
//     dos agentes nunca toman el mismo.
//   · El agente confirma «voy a imprimir» (start) con el claimId ANTES de
//     mandar los bytes. Sin esa confirmación, la reserva vence y el trabajo
//     vuelve a pendiente: nunca se mandó, reintentar es seguro.
//   · Resultado con claimId: una confirmación tardía o de otra reserva no
//     altera el estado (se ignora).
//   · Falla SEGURA (nada llegó a la impresora) ⇒ reintento con espera, hasta
//     maxAttempts. Falla a mitad de envío, o «imprimiendo» sin resultado ⇒
//     `unknown`: NO se reimprime solo; una persona decide.
//   · Éxito = bytes entregados al dispositivo (TCP) o aceptados por el spooler
//     (USB). No es confirmación física: ESC/POS no la da. Queda en `outcome`.
// ============================================================================

/** Reserva sin confirmación de inicio: vuelve a pendiente al vencer. */
export const CLAIM_TTL_MS = 45_000
/** «Imprimiendo» sin resultado más de esto ⇒ resultado desconocido. */
export const PRINTING_TTL_MS = 120_000
/** Espera entre reintentos de fallas seguras. */
const RETRY_DELAYS_MS = [10_000, 30_000, 90_000]

export interface AgentJobResult {
  claimId?: string | null
  success: boolean
  /** El agente sabe que nada llegó a la impresora (conexión rechazada, impresora inexistente…). */
  safeToRetry?: boolean
  outcome?: PrintOutcome | null
  errorMsg?: string | null
}

const FISCAL_PRINT_STATUS: Record<string, FiscalPrintStatus> = {
  pending: 'queued',
  claimed: 'queued',
  printing: 'printing',
  success: 'printed',
  error: 'failed',
  unknown: 'unknown',
  cancelled: 'failed',
}

/** Refleja el estado del trabajo en el comprobante (estado de impresión, no fiscal). */
export async function syncFiscalPrintState(job: Pick<IPreClosePrintJob, '_id' | 'fiscalDocumentId' | 'status' | 'lastError' | 'completedAt'>): Promise<void> {
  if (!job.fiscalDocumentId) return
  const status = FISCAL_PRINT_STATUS[job.status] ?? 'unknown'
  await FiscalDocument.updateOne(
    // Solo el último trabajo del comprobante manda (una reimpresión nueva no
    // la pisa el resultado tardío de la anterior).
    { _id: job.fiscalDocumentId, 'printing.lastJobId': job._id },
    {
      $set: {
        'printing.status': status,
        'printing.lastError': job.lastError ?? '',
        ...(status === 'printed' ? { 'printing.printedAt': job.completedAt ?? new Date() } : {}),
      },
    }
  )
}

/**
 * Pasa a `unknown` los trabajos que quedaron «imprimiendo» sin resultado y
 * devuelve a pendiente las reservas vencidas sin confirmación de inicio.
 */
export async function sweepStaleJobs(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId | string): Promise<void> {
  const now = new Date()
  const loc = new mongoose.Types.ObjectId(String(locationId))
  const stuck = await PreClosePrintJob.find({
    tenantId,
    locationId: loc,
    status: 'printing',
    startedAt: { $lt: new Date(now.getTime() - PRINTING_TTL_MS) },
  })
    .select('_id fiscalDocumentId status lastError completedAt')
    .limit(50)
  for (const job of stuck) {
    const updated = await PreClosePrintJob.findOneAndUpdate(
      { _id: job._id, status: 'printing' },
      { $set: { status: 'unknown', lastError: 'El agente no informó el resultado: pudo haber impreso. Verificar antes de reimprimir.' } },
      { new: true }
    )
    if (updated) await syncFiscalPrintState(updated)
  }
  await PreClosePrintJob.updateMany(
    { tenantId, locationId: loc, status: 'claimed', claimExpiresAt: { $lt: now } },
    { $set: { status: 'pending', claimId: null, claimedAt: null, claimExpiresAt: null } }
  )
}

/** Reserva atómicamente hasta `limit` trabajos de la sede para este poll. */
export async function claimPreCloseJobs(
  tenantId: mongoose.Types.ObjectId,
  locationId: mongoose.Types.ObjectId | string,
  agentVersion: string | null,
  limit = 10
): Promise<IPreClosePrintJob[]> {
  await sweepStaleJobs(tenantId, locationId)
  const loc = new mongoose.Types.ObjectId(String(locationId))
  const claimed: IPreClosePrintJob[] = []
  for (let i = 0; i < limit; i++) {
    const now = new Date()
    const job = await PreClosePrintJob.findOneAndUpdate(
      {
        tenantId,
        locationId: loc,
        status: 'pending',
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }],
      },
      {
        $set: {
          status: 'claimed',
          claimId: randomUUID(),
          claimedAt: now,
          claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
          agentVersion,
        },
      },
      { new: true, sort: { createdAt: 1 } }
    )
    if (!job) break
    claimed.push(job)
    await syncFiscalPrintState(job)
  }
  return claimed
}

/** El agente confirma que va a mandar los bytes. false ⇒ NO debe imprimir. */
export async function startPreCloseJob(jobId: string, claimId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(jobId) || !claimId) return false
  const job = await PreClosePrintJob.findOneAndUpdate(
    { _id: jobId, status: 'claimed', claimId, claimExpiresAt: { $gte: new Date() } },
    { $set: { status: 'printing', startedAt: new Date() } },
    { new: true }
  )
  if (job) await syncFiscalPrintState(job)
  return Boolean(job)
}

/**
 * Resultado del agente. Devuelve el trabajo actualizado, o null si la
 * confirmación no corresponde a la reserva vigente (se ignora).
 */
export async function completePreCloseJob(jobId: string, result: AgentJobResult): Promise<IPreClosePrintJob | null> {
  if (!mongoose.isValidObjectId(jobId)) return null
  const current = await PreClosePrintJob.findById(jobId)
  if (!current) return null

  // Agente nuevo: el claimId tiene que ser el de la reserva. Un `unknown` con
  // el mismo claimId SÍ acepta el resultado tardío (es el mismo intento).
  // Agente viejo (sin claimId): solo sobre trabajos reservados o imprimiendo.
  const filter: Record<string, unknown> = { _id: current._id }
  if (result.claimId) {
    filter.claimId = result.claimId
    filter.status = { $in: ['claimed', 'printing', 'unknown'] }
  } else {
    filter.status = { $in: ['claimed', 'printing'] }
  }

  const now = new Date()
  const errorMsg = (result.errorMsg ?? '').slice(0, 300)
  let set: Record<string, unknown>
  let inc: Record<string, number> = { attempts: 1 }
  if (result.success) {
    set = { status: 'success', completedAt: now, outcome: result.outcome ?? null, lastError: '' }
  } else if (result.safeToRetry) {
    const attempts = current.attempts + 1
    const exhausted = attempts >= current.maxAttempts
    set = exhausted
      ? { status: 'error', completedAt: now, lastError: errorMsg || 'No se pudo imprimir', claimId: null }
      : {
          status: 'pending',
          lastError: errorMsg,
          nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]),
          claimId: null,
          claimedAt: null,
          claimExpiresAt: null,
          startedAt: null,
        }
  } else {
    set = {
      status: 'unknown',
      lastError: errorMsg ? `${errorMsg} — pudo haber impreso: verificar antes de reimprimir.` : 'Resultado desconocido: verificar antes de reimprimir.',
    }
    inc = { attempts: 1 }
  }

  const updated = await PreClosePrintJob.findOneAndUpdate(filter, { $set: set, $inc: inc }, { new: true })
  if (updated) await syncFiscalPrintState(updated)
  return updated
}

// ── Comandas (printJobs embebidos en la orden) ──────────────────────────────

/** Reserva atómica de un print job de orden; null si otro poll ya lo tiene. */
export async function claimOrderPrintJob(orderId: mongoose.Types.ObjectId, printJobId: mongoose.Types.ObjectId): Promise<string | null> {
  const now = new Date()
  const claimId = randomUUID()
  const res = await Order.updateOne(
    {
      _id: orderId,
      printJobs: {
        $elemMatch: {
          _id: printJobId,
          status: { $in: ['pending', 'error'] },
          $or: [{ claimedUntil: null }, { claimedUntil: { $exists: false } }, { claimedUntil: { $lt: now } }],
        },
      },
    },
    { $set: { 'printJobs.$.claimId': claimId, 'printJobs.$.claimedUntil': new Date(now.getTime() + CLAIM_TTL_MS) } }
  )
  return res.modifiedCount === 1 ? claimId : null
}
