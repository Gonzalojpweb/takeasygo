import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { FiscalIssueError, documentSummary, issueInvoiceForOrder } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { ArcaError } from '@/lib/fiscal/arca/wsfe'

// ============================================================================
// POST /api/[tenant]/admin/fiscal/invoice — facturar un pedido a mano
// ============================================================================
// Fase 6 de caja (2026-10). Para el pedido que no se facturó solo: un pedido
// online que el cliente pide con Factura A (CUIT), o uno cobrado cuando la
// facturación automática estaba apagada. Body:
//   { orderNumber, receiver: { condition, docNumber?, name? } }
// Si la orden ya tiene factura, devuelve esa (no emite otra).
// ============================================================================

const bodySchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  receiver: z.object({
    condition: z.enum(['consumidor_final', 'responsable_inscripto', 'monotributo', 'exento']),
    docNumber: z.string().max(20).optional(),
    name: z.string().max(120).optional(),
  }),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await fiscalAdminContext(request, (await params).tenant, 'fiscal.configure')
  if ('error' in ctx) return ctx.error

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Cargá el número de pedido y el tipo de factura' }, { status: 400 })
  const { orderNumber, receiver } = parsed.data

  const order = await Order.findOne({ tenantId: ctx.tenant._id, orderNumber: orderNumber.replace(/^#/, '') })
    .select('_id source status posPayments payment.status')
    .lean<{ _id: unknown; source?: string; status: string; posPayments?: unknown[]; payment?: { status?: string } }>()
  if (!order) return NextResponse.json({ error: `No encontramos el pedido #${orderNumber}` }, { status: 404 })
  const paid = (order.posPayments?.length ?? 0) > 0 || (order.source !== 'pos' && order.payment?.status === 'approved')
  if (!paid) return NextResponse.json({ error: 'El pedido todavía no está cobrado' }, { status: 409 })

  try {
    const doc = await issueInvoiceForOrder({
      tenantId: ctx.tenantId,
      orderId: String(order._id),
      receiver: { condition: receiver.condition, docNumber: receiver.docNumber ?? null, name: receiver.name ?? null },
      userId: ctx.user?.id ?? 'admin',
    })
    if (doc.status === 'authorized') await enqueueFiscalTicket(doc).catch(() => undefined)
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.invoice.manual',
      entity: 'FiscalDocument',
      entityId: String(doc._id),
      details: { orderNumber, status: doc.status, letter: doc.letter },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })
    return NextResponse.json({ document: documentSummary(doc) })
  } catch (err) {
    if (err instanceof FiscalIssueError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof ArcaError) return NextResponse.json({ error: err.message }, { status: 502 })
    console.error('[admin/fiscal/invoice]', err)
    return NextResponse.json({ error: 'No se pudo facturar el pedido' }, { status: 500 })
  }
}
