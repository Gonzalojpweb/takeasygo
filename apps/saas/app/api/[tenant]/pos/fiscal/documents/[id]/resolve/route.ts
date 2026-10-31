import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { FiscalIssueError, documentSummary } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { ArcaError } from '@/lib/fiscal/arca/wsfe'
import { findPosFiscalDocument } from '@/lib/fiscal/pos-documents'
import { resolveFiscalReview, type ReviewAction } from '@/lib/fiscal/review'

// POST /api/[tenant]/pos/fiscal/documents/[id]/resolve — orden 31/10.
// Body: { action: 'retry_new_number' | 'reissue' | 'retry_caea_report' |
//                 'discard' | 'caea_manual' }
// Resolución controlada de un comprobante en revisión (o contingencia CAEA
// decidida por una persona). Solo administradores: tiene efecto fiscal.
const ACTIONS = new Set<ReviewAction>(['retry_new_number', 'reissue', 'retry_caea_report', 'discard', 'caea_manual'])

export const POST = posRoute('config.fiscal', async (ctx, { id }) => {
  const body = await readPosBody<{ action?: unknown }>(ctx.request)
  if (typeof body.action !== 'string' || !ACTIONS.has(body.action as ReviewAction)) {
    throw PosError.validation('Acción inválida')
  }
  const action = body.action as ReviewAction
  const doc = await findPosFiscalDocument(ctx.tenantId, ctx.locationId, id)
  const before = { status: doc.status, reviewCode: doc.review?.code ?? null }

  let out
  try {
    out = await resolveFiscalReview(doc, action, ctx.user.id)
  } catch (err) {
    if (err instanceof FiscalIssueError || err instanceof ArcaError) throw PosError.conflict(err.message)
    throw err
  }
  const issued = out.replacement ?? out.document
  if (issued.status === 'authorized') await enqueueFiscalTicket(issued).catch(() => undefined)

  await logAudit({
    tenantId: ctx.tenantId,
    action: `pos.fiscal.review.${action}`,
    entity: 'FiscalDocument',
    entityId: String(doc._id),
    details: { before, after: out.document.status, replacementId: out.replacement ? String(out.replacement._id) : null },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({
    document: documentSummary(out.document),
    replacement: out.replacement ? documentSummary(out.replacement) : null,
  })
})
