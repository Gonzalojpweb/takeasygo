import mongoose from 'mongoose'
import Order from '@/models/Order'
import FiscalProfile from '@/models/FiscalProfile'
import { issueCreditNoteForOrder, issueInvoiceForOrder } from './issue'
import { enqueueFiscalTicket } from './ticket'

// ============================================================================
// Facturas de pedidos ONLINE (delivery, take away, en mesa por QR) — Fase 6
// ============================================================================
// Docs: ADMIN/FASE6_ONLINE_POINT_CAEA_LIBRO_DIGITAL.md
//
// Con «Facturar pedidos online automáticamente» activado:
//   · pago online aprobado (MercadoPago, Kripton, transferencia) → Factura a
//     consumidor final apenas se confirma el pago;
//   · efectivo al recibir → al entregarse (panel, repartidor, retiro o POS:
//     todos pasan por confirmOrderPaymentCore al cobrar);
//   · pedido cancelado que estaba facturado → nota de crédito.
// La factura sale impresa en la caja de la sede (para ir con el pedido).
// Una factura con CUIT para un pedido online se hace a mano desde el panel.
// Nunca frena el pedido: cualquier error queda logueado y la factura, si se
// creó, queda pendiente de reintento.
// ============================================================================

interface OrderLean {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  source?: string
  status: string
  payment?: { status?: string; method?: string }
  customer?: { name?: string }
}

async function autoEnabled(tenantId: mongoose.Types.ObjectId): Promise<boolean> {
  const p = await FiscalProfile.findOne({ tenantId }).select('enabled onlineInvoicing ivaCondition').lean<{
    enabled?: boolean
    onlineInvoicing?: string
    ivaCondition?: string | null
  }>()
  return Boolean(p?.enabled && p.ivaCondition && p.onlineInvoicing === 'auto')
}

/**
 * Factura automática de un pedido online cobrado. Idempotente (la factura es
 * única por orden). `trigger` solo sirve para el log.
 */
export async function autoInvoiceOnlineOrder(orderId: string, trigger: 'paid' | 'delivered'): Promise<void> {
  try {
    const order = await Order.findById(orderId)
      .select('tenantId source status payment.status payment.method customer.name')
      .lean<OrderLean>()
    if (!order || order.source === 'pos' || order.status === 'cancelled') return
    if (order.payment?.status !== 'approved') return
    // Efectivo: se factura recién entregado (es cuando se cobra). El cobro al
    // entregar pasa siempre por confirmOrderPaymentCore (registerCashSaleOnDelivery).
    if (order.payment.method === 'cash' && order.status !== 'delivered') return
    if (!(await autoEnabled(order.tenantId))) return

    const doc = await issueInvoiceForOrder({
      tenantId: String(order.tenantId),
      orderId: String(order._id),
      receiver: { condition: 'consumidor_final', name: order.customer?.name ?? null },
      userId: 'system:online',
    })
    if (doc.status === 'authorized') await enqueueFiscalTicket(doc).catch(() => undefined)
  } catch (err) {
    console.error(`[fiscal/online] factura del pedido ${orderId} (${trigger}):`, err instanceof Error ? err.message : err)
  }
}

/** Pedido online cancelado: nota de crédito si estaba facturado. */
export async function creditNoteForCancelledOrder(orderId: string): Promise<void> {
  try {
    const order = await Order.findById(orderId).select('tenantId').lean<{ tenantId: mongoose.Types.ObjectId }>()
    if (!order) return
    const nc = await issueCreditNoteForOrder({ tenantId: String(order.tenantId), orderId, userId: 'system:online' })
    if (nc?.status === 'authorized') await enqueueFiscalTicket(nc).catch(() => undefined)
  } catch (err) {
    console.error(`[fiscal/online] nota de crédito del pedido ${orderId}:`, err instanceof Error ? err.message : err)
  }
}
