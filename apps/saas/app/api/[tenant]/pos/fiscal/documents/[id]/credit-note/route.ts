import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { requireManagerApproval } from '@/lib/pos-online/approval'
import { documentSummary, issueCreditNoteForOrder } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { ArcaError } from '@/lib/fiscal/arca/wsfe'
import { findPosFiscalDocument } from '@/lib/fiscal/pos-documents'

// ============================================================================
// POST /api/[tenant]/pos/fiscal/documents/[id]/credit-note — Fase L
// ============================================================================
// Emite la nota de crédito de una factura autorizada (anula la factura ante
// ARCA por el total). Idempotente: si ya existe, devuelve la misma. Es una
// anulación fiscal ⇒ el cajero necesita el PIN de un encargado; encargado y
// admin directo. Si se autoriza, imprime el comprobante.
// ============================================================================

export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const invoice = await findPosFiscalDocument(ctx.tenantId, ctx.locationId, id)
  if (invoice.kind !== 'invoice') throw PosError.validation('La nota de crédito se emite sobre una factura')
  if (invoice.status !== 'authorized') throw PosError.conflict('La factura todavía no está autorizada por ARCA')

  const approval = await requireManagerApproval(ctx, 'fiscal.credit_note', 'Emitir una nota de crédito necesita la aprobación de un encargado')

  let note
  try {
    note = await issueCreditNoteForOrder({ tenantId: ctx.tenantId, orderId: invoice.orderId, userId: ctx.user.id })
  } catch (err) {
    if (err instanceof ArcaError) throw PosError.conflict(err.message)
    throw err
  }
  if (!note) throw PosError.conflict('No se pudo emitir la nota de crédito para esta factura')
  if (note.status === 'authorized') await enqueueFiscalTicket(note).catch(() => undefined)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.fiscal.credit_note',
    entity: 'FiscalDocument',
    entityId: String(note._id),
    details: { invoiceId: String(invoice._id), status: note.status, number: note.number, approvedBy: approval.approvedBy },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ document: documentSummary(note) })
})
