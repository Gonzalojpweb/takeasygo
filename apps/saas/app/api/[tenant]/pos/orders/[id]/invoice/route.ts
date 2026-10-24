import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosId } from '@/lib/pos-online/orderRepo'
import { logAudit } from '@/lib/audit'
import { FiscalIssueError, documentSummary, issueInvoiceForOrder } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { ArcaError } from '@/lib/fiscal/arca/wsfe'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/invoice — factura una orden cobrada
// ============================================================================
// Fase 5 de caja (2026-10). Body: { receiver?: { condition, docNumber, name } }
//   · Sin receptor = consumidor final.
//   · Idempotente: la misma orden devuelve la misma factura.
//   · Autorizada ⇒ el ticket con CAE y QR sale por la impresora de caja.
//   · ARCA caída ⇒ 202 con status 'retrying': la venta sigue; la factura se
//     reintenta sola (cron) y el panel la muestra pendiente.
// ============================================================================

const CONDITIONS = new Set(['consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_categorizado'])

export const POST = posRoute<{ tenant: string; id: string }>('orders.pay', async (ctx, params) => {
  const posId = assertPosId(params.id)
  const body = await readPosBody<{ receiver?: { condition?: unknown; docNumber?: unknown; name?: unknown } }>(ctx.request)
  const r = body.receiver ?? {}
  if (r.condition !== undefined && (typeof r.condition !== 'string' || !CONDITIONS.has(r.condition))) {
    throw PosError.validation('Condición del cliente inválida')
  }

  const order = await Order.findOne({ tenantId: ctx.tenantId, locationId: ctx.locationId, posId })
    .select('_id source posPayments payment.status')
    .lean<{ _id: unknown; source?: string; posPayments?: unknown[]; payment?: { status?: string } }>()
  if (!order) throw PosError.notFound('Orden no encontrada')
  // Una orden del POS nace con payment 'approved' por defecto: lo que prueba el
  // cobro es posPayments. Un pedido online integrado sí trae su pago aprobado.
  const paid =
    (order.posPayments?.length ?? 0) > 0 || (order.source !== 'pos' && order.payment?.status === 'approved')
  if (!paid) throw PosError.conflict('Primero cobrá la orden: se factura lo cobrado')

  try {
    const doc = await issueInvoiceForOrder({
      tenantId: ctx.tenantId,
      orderId: String(order._id),
      receiver: {
        condition: r.condition as never,
        docNumber: typeof r.docNumber === 'string' ? r.docNumber : null,
        name: typeof r.name === 'string' ? r.name : null,
      },
      userId: ctx.user.id,
    })
    const printed = doc.status === 'authorized' ? await enqueueFiscalTicket(doc).catch(() => ({ ok: false })) : { ok: false }

    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.invoice.issue',
      entity: 'FiscalDocument',
      entityId: String(doc._id),
      details: { posId, status: doc.status, letter: doc.letter, number: doc.number, total: doc.amounts.totalCents },
      request: ctx.request,
      userId: ctx.user.id,
      userRole: ctx.user.role,
    })

    return NextResponse.json(
      { document: documentSummary(doc), printed },
      // 201 autorizada · 202 esperando a ARCA · 200 rechazada (el motivo va en document.message).
      { status: doc.status === 'authorized' ? 201 : doc.status === 'rejected' ? 200 : 202 }
    )
  } catch (err) {
    if (err instanceof FiscalIssueError) {
      throw err.status === 400 ? PosError.validation(err.message) : err.status === 404 ? PosError.notFound(err.message) : PosError.conflict(err.message)
    }
    if (err instanceof ArcaError) throw PosError.conflict(err.message)
    throw err
  }
})
