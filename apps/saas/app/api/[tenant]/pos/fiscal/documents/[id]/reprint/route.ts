import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { findPosFiscalDocument } from '@/lib/fiscal/pos-documents'

// POST /api/[tenant]/pos/fiscal/documents/[id]/reprint — Fase L: vuelve a
// imprimir el ticket fiscal (con QR) de un comprobante autorizado en la
// impresora de caja.
export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  const doc = await findPosFiscalDocument(ctx.tenantId, ctx.locationId, id)
  if (doc.status !== 'authorized') throw PosError.conflict('Solo se reimprime un comprobante autorizado')
  const res = await enqueueFiscalTicket(doc)
  if (!res.ok) {
    throw PosError.conflict(
      res.reason === 'no_profile'
        ? 'Faltan los datos fiscales del comercio (razón social, CUIT, condición de IVA)'
        : 'No hay impresora de caja activa en esta sede'
    )
  }
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.fiscal.reprint',
    entity: 'FiscalDocument',
    entityId: String(doc._id),
    details: { number: doc.number, printer: res.printerName },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ printed: true, printerName: res.printerName })
})
