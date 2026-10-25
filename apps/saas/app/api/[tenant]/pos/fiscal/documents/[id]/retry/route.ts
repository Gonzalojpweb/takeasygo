import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { authorizeDocument, documentSummary } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { ArcaError } from '@/lib/fiscal/arca/wsfe'
import { findPosFiscalDocument } from '@/lib/fiscal/pos-documents'

// POST /api/[tenant]/pos/fiscal/documents/[id]/retry — Fase L: reintentar
// el CAE de un comprobante pendiente o rechazado (después de corregir el
// motivo). Si se autoriza, imprime el ticket fiscal. Misma lógica que el panel.
export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const doc = await findPosFiscalDocument(ctx.tenantId, ctx.locationId, id)
  if (doc.status === 'authorized') return NextResponse.json({ document: documentSummary(doc) })
  if (doc.status === 'rejected') {
    doc.status = 'pending'
    await doc.save()
  }
  let result
  try {
    result = await authorizeDocument(doc)
  } catch (err) {
    if (err instanceof ArcaError) throw PosError.conflict(err.message)
    throw err
  }
  if (result.status === 'authorized') await enqueueFiscalTicket(result).catch(() => undefined)
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.fiscal.retry',
    entity: 'FiscalDocument',
    entityId: String(doc._id),
    details: { status: result.status, number: result.number },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ document: documentSummary(result) })
})
