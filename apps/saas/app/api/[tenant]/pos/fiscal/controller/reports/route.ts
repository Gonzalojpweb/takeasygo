import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosCapability } from '@/lib/pos-online/permissions'
import FiscalControllerJob, { type IFiscalControllerJob } from '@/models/FiscalControllerJob'
import { enqueueControllerReport, loadModality } from '@/lib/fiscal/controller'
import { FiscalIssueError } from '@/lib/fiscal/issue'

// ============================================================================
// /api/[tenant]/pos/fiscal/controller/reports — informes de la impresora fiscal
// ============================================================================
// GET: modalidad de la sede y últimos informes con su estado.
// POST { kind: 'x' | 'z', requestId }: pide un informe al equipo.
//   · X (salida de cajero): cualquier rol que cobra.
//   · Z (cierre de la jornada fiscal, irreversible): admin o encargado.
// El informe lo ejecuta el agente de la PC de caja; el POS consulta el estado.
// ============================================================================

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/

function summary(j: IFiscalControllerJob) {
  return {
    id: String(j._id),
    kind: j.operation === 'z_report' ? 'z' : 'x',
    status: j.status,
    number: j.result?.number ?? null,
    message: j.lastError || null,
    createdAt: j.createdAt,
  }
}

export const GET = posRoute('orders.pay', async (ctx) => {
  const { modality, controller } = await loadModality(ctx.tenantId, ctx.locationId)
  const jobs =
    modality === 'controller'
      ? await FiscalControllerJob.find({
          tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
          locationId: new mongoose.Types.ObjectId(ctx.locationId),
          operation: { $in: ['x_report', 'z_report'] },
        })
          .sort({ createdAt: -1 })
          .limit(5)
      : []
  return NextResponse.json({
    modality,
    device: controller ? { brand: controller.brand, model: controller.model } : null,
    reports: jobs.map(summary),
  })
})

export const POST = posRoute('orders.pay', async (ctx) => {
  const body = await readPosBody<{ kind?: unknown; requestId?: unknown }>(ctx.request)
  if (body.kind !== 'x' && body.kind !== 'z') throw PosError.validation('Informe inválido')
  if (typeof body.requestId !== 'string' || !REQUEST_ID_RE.test(body.requestId)) throw PosError.validation('Pedido inválido')
  if (body.kind === 'z') assertPosCapability(ctx.user.role, 'config.manage')

  let job: IFiscalControllerJob
  try {
    job = await enqueueControllerReport({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      kind: body.kind,
      requestId: body.requestId,
      userId: ctx.user.id,
    })
  } catch (err) {
    if (err instanceof FiscalIssueError) throw PosError.conflict(err.message)
    throw err
  }
  await logAudit({
    tenantId: ctx.tenantId,
    action: body.kind === 'z' ? 'pos.fiscal.z_report' : 'pos.fiscal.x_report',
    entity: 'FiscalControllerJob',
    entityId: String(job._id),
    details: { status: job.status },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ report: summary(job) }, { status: 202 })
})
