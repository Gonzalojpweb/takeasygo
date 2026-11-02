import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { requireManagerApproval } from '@/lib/pos-online/approval'
import FiscalControllerJob from '@/models/FiscalControllerJob'
import {
  controllerDocumentSummary,
  creditNoteForControllerOrder,
  expireControllerJobs,
  resolveControllerJob,
  retryControllerJob,
} from '@/lib/fiscal/controller'
import { FiscalIssueError } from '@/lib/fiscal/issue'

// ============================================================================
// /api/[tenant]/pos/fiscal/controller/documents/[id]
// ============================================================================
// GET: estado de un comprobante (el cierre de venta lo consulta hasta que hay
//      resultado).
// POST { action }:
//   · retry: vuelve a mandar uno que se sabe que NO salió. Cualquiera que cobra.
//   · resolve { emitted, number? }: una persona miró el papel y define un
//     resultado desconocido. Encargado o PIN.
//   · credit_note: nota de crédito de un comprobante emitido. Encargado o PIN.
// ============================================================================

async function findJob(tenantId: string, locationId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw PosError.notFound('Comprobante no encontrado')
  const job = await FiscalControllerJob.findOne({ _id: id, tenantId, locationId, operation: { $in: ['invoice', 'credit_note'] } })
  if (!job) throw PosError.notFound('Comprobante no encontrado')
  return job
}

export const GET = posRoute<{ tenant: string; id: string }>('orders.pay', async (ctx, { id }) => {
  await expireControllerJobs(new mongoose.Types.ObjectId(ctx.tenantId), new mongoose.Types.ObjectId(ctx.locationId))
  return NextResponse.json({ document: controllerDocumentSummary(await findJob(ctx.tenantId, ctx.locationId, id)) })
})

export const POST = posRoute<{ tenant: string; id: string }>('orders.pay', async (ctx, { id }) => {
  const body = await readPosBody<{ action?: unknown; emitted?: unknown; number?: unknown }>(ctx.request)
  const job = await findJob(ctx.tenantId, ctx.locationId, id)
  let approvedBy: string | null = null

  try {
    let result = job
    let action: string
    if (body.action === 'retry') {
      action = 'pos.fiscal.controller.retry'
      result = await retryControllerJob(ctx.tenantId, ctx.locationId, id)
    } else if (body.action === 'resolve') {
      if (typeof body.emitted !== 'boolean') throw PosError.validation('Indicá si el comprobante salió')
      approvedBy = (await requireManagerApproval(ctx, 'fiscal.controller.resolve', 'Definir el resultado de un comprobante necesita la aprobación de un encargado')).approvedBy
      action = 'pos.fiscal.controller.resolve'
      result = await resolveControllerJob({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        id,
        emitted: body.emitted,
        number: typeof body.number === 'number' ? body.number : undefined,
        userId: ctx.user.id,
      })
    } else if (body.action === 'credit_note') {
      if (job.operation !== 'invoice' || job.status !== 'confirmed') throw PosError.conflict('La nota de crédito se emite sobre un comprobante ya emitido')
      approvedBy = (await requireManagerApproval(ctx, 'fiscal.credit_note', 'Emitir una nota de crédito necesita la aprobación de un encargado')).approvedBy
      action = 'pos.fiscal.controller.credit_note'
      const out = await creditNoteForControllerOrder({ tenantId: ctx.tenantId, orderId: String(job.orderId), userId: ctx.user.id })
      if (out.kind !== 'queued') throw PosError.conflict('No se pudo emitir la nota de crédito')
      result = out.job
    } else {
      throw PosError.validation('Acción inválida')
    }

    await logAudit({
      tenantId: ctx.tenantId,
      action,
      entity: 'FiscalControllerJob',
      entityId: String(result._id),
      details: { from: job.status, status: result.status, number: result.result?.number ?? null, approvedBy },
      request: ctx.request,
      userId: ctx.user.id,
      userRole: ctx.user.role,
    })
    return NextResponse.json({ document: controllerDocumentSummary(result) })
  } catch (err) {
    if (err instanceof FiscalIssueError) throw err.status === 400 ? PosError.validation(err.message) : PosError.conflict(err.message)
    throw err
  }
})
