import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import FiscalDocument from '@/models/FiscalDocument'
import { findPosFiscalDocument } from '@/lib/fiscal/pos-documents'

// POST /api/[tenant]/pos/fiscal/documents/[id]/print-status — orden 31/10
// (P0.2). Body: { printed: true }
// Un ticket con resultado DESCONOCIDO (se cortó a mitad de envío) no se
// reimprime solo. La persona que lo tiene delante confirma que salió bien;
// si no salió, usa «Reimprimir». Queda auditado.
export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const body = await readPosBody<{ printed?: unknown }>(ctx.request)
  if (body.printed !== true) throw PosError.validation('Indicá printed: true')
  const doc = await findPosFiscalDocument(ctx.tenantId, ctx.locationId, id)
  const job = doc.printing?.lastJobId ? await PreClosePrintJob.findById(doc.printing.lastJobId) : null
  if (!job || !['unknown', 'error'].includes(job.status)) {
    throw PosError.conflict('Solo se confirma un ticket con resultado desconocido o fallido')
  }
  job.status = 'success'
  job.resolvedBy = ctx.user.id
  job.completedAt = new Date()
  job.lastError = 'Confirmado a mano por el operador'
  await job.save()
  await FiscalDocument.updateOne(
    { _id: doc._id },
    { $set: { 'printing.status': 'printed', 'printing.printedAt': new Date(), 'printing.lastError': '' } }
  )
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.fiscal.print_confirmed',
    entity: 'FiscalDocument',
    entityId: String(doc._id),
    details: { jobId: String(job._id), previous: 'unknown' },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ ok: true })
})
