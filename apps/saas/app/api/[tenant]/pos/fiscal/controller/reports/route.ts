import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosCapability } from '@/lib/pos-online/permissions'
import FiscalControllerJob, { type IFiscalControllerJob } from '@/models/FiscalControllerJob'
import { enqueueControllerReport, loadModality, type ControllerReportKind } from '@/lib/fiscal/controller'
import { FiscalIssueError } from '@/lib/fiscal/issue'

// ============================================================================
// /api/[tenant]/pos/fiscal/controller/reports — informes de la impresora fiscal
// ============================================================================
// GET: modalidad de la sede y últimos informes con su estado.
// POST { kind: 'x' | 'z', requestId }: pide un informe al equipo.
// POST { kind: 'ctd' | 'duplicates' | 'totals', month, requestId }: descarga un
//   reporte del mes a la carpeta reportes-fiscales de la PC de caja. Admin o
//   encargado. Son los archivos firmados que el local presenta con su contador.
//   · X (salida de cajero): cualquier rol que cobra.
//   · Z (cierre de la jornada fiscal, irreversible): admin o encargado.
// El informe lo ejecuta el agente de la PC de caja; el POS consulta el estado.
// ============================================================================

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/
const FILE_KINDS = new Set<ControllerReportKind>(['ctd', 'duplicates', 'totals'])
const KINDS = new Set<ControllerReportKind>(['x', 'z', ...FILE_KINDS])

/** "2026-11" → primer y último día del mes. */
function monthPeriod(month: unknown): { from: string; to: string } | undefined {
  const m = typeof month === 'string' ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month) : null
  if (!m) return undefined
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` }
}

function summary(j: IFiscalControllerJob) {
  return {
    id: String(j._id),
    kind: j.operation === 'z_report' ? 'z' : j.operation === 'download_report' ? j.payload?.report : 'x',
    file: j.operation === 'download_report' && j.status === 'confirmed' ? j.result?.raw || null : null,
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
          operation: { $in: ['x_report', 'z_report', 'download_report'] },
        })
          .sort({ createdAt: -1 })
          .limit(8)
      : []
  return NextResponse.json({
    modality,
    device: controller ? { brand: controller.brand, model: controller.model } : null,
    reports: jobs.map(summary),
  })
})

export const POST = posRoute('orders.pay', async (ctx) => {
  const body = await readPosBody<{ kind?: unknown; requestId?: unknown; month?: unknown }>(ctx.request)
  if (typeof body.kind !== 'string' || !KINDS.has(body.kind as ControllerReportKind)) throw PosError.validation('Informe inválido')
  const kind = body.kind as ControllerReportKind
  const isFile = FILE_KINDS.has(kind)
  const period = isFile ? monthPeriod(body.month) : undefined
  if (isFile && !period) throw PosError.validation('Mes inválido (formato AAAA-MM)')
  if (typeof body.requestId !== 'string' || !REQUEST_ID_RE.test(body.requestId)) throw PosError.validation('Pedido inválido')
  if (kind === 'z' || isFile) assertPosCapability(ctx.user.role, 'config.manage')

  let job: IFiscalControllerJob
  try {
    job = await enqueueControllerReport({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      kind,
      period,
      requestId: body.requestId,
      userId: ctx.user.id,
    })
  } catch (err) {
    if (err instanceof FiscalIssueError) throw PosError.conflict(err.message)
    throw err
  }
  await logAudit({
    tenantId: ctx.tenantId,
    action: isFile ? 'pos.fiscal.download_report' : kind === 'z' ? 'pos.fiscal.z_report' : 'pos.fiscal.x_report',
    entity: 'FiscalControllerJob',
    entityId: String(job._id),
    details: { status: job.status },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ report: summary(job) }, { status: 202 })
})
