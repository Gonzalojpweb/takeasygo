import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import FiscalDocument from '@/models/FiscalDocument'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { authorizeDocument, documentSummary } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { ArcaError } from '@/lib/fiscal/arca/wsfe'

// ============================================================================
// POST /api/[tenant]/admin/fiscal/documents/[id]/retry — reintentar un CAE
// ============================================================================
// Fase 5 de caja (2026-10). Para comprobantes pendientes o en reintento (ARCA
// caída). Un rechazado se puede reintentar después de corregir el motivo
// (p. ej. el CUIT del cliente): vuelve a pendiente y se pide de nuevo.
// ============================================================================

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params
  const ctx = await fiscalAdminContext(request, tenant, 'fiscal.configure')
  if ('error' in ctx) return ctx.error
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })

  const doc = await FiscalDocument.findOne({ _id: id, tenantId: ctx.tenant._id })
  if (!doc) return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
  if (doc.status === 'authorized') return NextResponse.json({ document: documentSummary(doc) })

  if (doc.status === 'rejected') {
    doc.status = 'pending'
    await doc.save()
  }
  try {
    const result = await authorizeDocument(doc)
    if (result.status === 'authorized') await enqueueFiscalTicket(result).catch(() => undefined)
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.document.retry',
      entity: 'FiscalDocument',
      entityId: id,
      details: { status: result.status, number: result.number },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })
    return NextResponse.json({ document: documentSummary(result) })
  } catch (err) {
    const message = err instanceof ArcaError ? err.message : 'No se pudo reintentar'
    if (!(err instanceof ArcaError)) console.error('[admin/fiscal/retry]', err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
