import { sendAdminPushNotification } from '@/lib/push'
import { pushOrderToSyncLayer, confirmOrderPaymentCore, notifySyncLayerStatus } from '@/lib/sync-layer'
import type { IOrder } from '@/models/Order'
import type { ITenant } from '@/models/Tenant'

/**
 * Efectos post-creación/post-confirmación de una orden, en UNA sola función con
 * múltiples puntos de entrada.
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────────────
 * Un pedido en efectivo creado desde el checkout normal y un pedido que cambió a
 * efectivo desde el flujo de emergencia tienen que recibir EXACTAMENTE los
 * mismos efectos. Si cada endpoint tuviera su propia copia de estas llamadas,
 * el día que una cambie la otra quedaría desincronizada.
 *
 * Puntos de entrada (a propósito):
 *   1. `POST /api/[tenant]/orders` con `payment.method === 'cash'` (checkout normal)
 *   2. `POST /api/[tenant]/orders/[orderId]/change-payment-method` → `cash` (emergencia)
 *
 * ── SEMÁNTICA DE EFECTIVO (no inventar otra) ──────────────────────────────────
 * Un pedido de efectivo queda `confirmed` + `payment.status: 'pending'` AL
 * INSTANTE: el cliente aún no pagó. El cobro se confirma recién cuando el
 * pedido se marca ENTREGADO (pending → approved en delivered), que es cuando
 * el cajero cobra en mano. En ese momento se registra la venta en caja
 * (`registerCashSaleOnDelivery`), de modo que caja y estado de pago cambian
 * juntos y un pedido cancelado antes de entregar nunca deja venta fantasma.
 * El push al admin sí es a creación: el cajero necesita ver llegar el pedido.
 *
 * Si después de entregado el cliente no paga en la realidad, el cajero usa el
 * flujo existente de ajuste de caja (`POST /[tenant]/cash-adjustment`, type
 * `cash_order_not_collected` → `payment.cashAdjustmentApplied = true`) para
 * excluirlo de los reportes — misma cadena que ya existía.
 */

export interface OrderEffectItem {
  menuItemId?: unknown
  name: string
  quantity: number
  price: number
  subtotal: number
}

/**
 * Aviso al admin cuando SE CREA un pedido en efectivo (checkout o cambio de
 * método de pago). Fire-and-forget (setImmediate): el pedido ya está guardado;
 * un fallo acá no debe tumbar la respuesta. La venta en caja NO se registra
 * acá — eso pasa al entregar (registerCashSaleOnDelivery).
 */
export async function notifyCashOrderCreated(args: {
  order: IOrder
  tenant: ITenant
  tenantSlug: string
  customerName: string
}): Promise<void> {
  const { order, tenant, tenantSlug, customerName } = args

  setImmediate(async () => {
    try {
      await sendAdminPushNotification(
        tenant._id.toString(),
        tenant.plan ?? 'trial',
        tenant.name,
        tenantSlug,
        order.orderNumber,
        order.total,
        customerName
      )
    } catch (err) {
      console.error('[order-side-effects] Admin push error (cash):', (err as Error)?.message)
    }
  })
}

/**
 * Registra la venta en caja + evento CIS de un pedido en efectivo RECIÉN
 * ENTREGADO (único momento en que el cobro se considera concretado).
 *
 * Se llama SOLO cuando payment.status pasa pending → approved en delivered
 * (status route, pickup, delivery/complete, POS), lo que la hace idempotente
 * por construcción; además notifyCashSale deduplica por (orderId, tenantId).
 *
 * Fire-and-forget: la confirmación del pedido no depende de este registro.
 */
export async function registerCashSaleOnDelivery(args: {
  order: IOrder
  tenant: { _id: ITenant['_id'] }
}): Promise<void> {
  const { order, tenant } = args

  setImmediate(async () => {
    try {
      await confirmOrderPaymentCore(order, tenant)
    } catch (err) {
      console.error(
        `[order-side-effects] CRITICAL: confirmOrderPaymentCore FAILED for delivered cash order ${order.orderNumber} ` +
          `(orderId: ${order._id}). Cash sale was NOT registered. Manual reconciliation required.`,
        err
      )
    }
  })
}

/**
 * Efectos de una TRANSICIÓN de status sobre una orden que YA existe.
 *
 * A diferencia de `syncOrderAfterStatusSet` (que sirve para el alta), acá NO se
 * re-pushea la orden al SyncLayer: ya fue pusheada al crearse y un segundo
 * `POST /api/v1/internal/orders` podría abrir un pedido duplicado en el POS. Lo
 * correcto para "el SaaS cambió el status" es el endpoint de status, que
 * actualiza el registro y emite `order:status_updated` a los POS conectados.
 *
 * Los print jobs sí se generan al quedar `confirmed`, igual que en la creación de
 * un pedido en efectivo normal.
 */
export async function applyStatusTransitionSideEffects(args: {
  order: IOrder
  tenant: ITenant
}): Promise<void> {
  const { order, tenant } = args

  notifySyncLayerStatus(tenant._id.toString(), order._id.toString(), order.status)

  if (order.status === 'confirmed') {
    const { onOrderConfirmed } = await import('@/lib/printing')
    onOrderConfirmed(order).catch(() => {})
  }
}

/**
 * Efectos dirigidos por el status de la orden: bridge al POS (si está
 * habilitado) e impresión de tickets (solo `confirmed`).
 *
 * Corre para cualquier método, no solo efectivo — por eso está aparte de
 * los efectos de efectivo (`notifyCashOrderCreated` / `registerCashSaleOnDelivery`).
 * En la creación de pedidos aplica a cash, deferred,
 * transferencia, MP y Kripton; al cambiar de método en el flujo de emergencia
 * aplica al nuevo status.
 */
export async function syncOrderAfterStatusSet(args: {
  order: IOrder
  tenant: ITenant
  items: OrderEffectItem[]
  locationId?: string | null
}): Promise<void> {
  const { order, tenant, items, locationId } = args

  if (tenant.features?.posEnabled && (order.status === 'confirmed' || order.status === 'awaiting_payment')) {
    pushOrderToSyncLayer({
      tenantId: tenant._id.toString(),
      externalOrderId: order._id.toString(),
      locationId: locationId ?? undefined,
      items: items.map((i) => ({
        productId: i.menuItemId?.toString() ?? undefined,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.price,
        total: i.subtotal,
      })),
      total: order.total,
      baseTotal: order.payment?.baseTotal,
      surchargeAmount: order.payment?.surchargeAmount,
      notes: order.notes || undefined,
      paymentMethod: order.payment?.method ?? 'mercadopago',
    })
  }

  if (order.status === 'confirmed') {
    const { onOrderConfirmed } = await import('@/lib/printing')
    onOrderConfirmed(order).catch(() => {})
  }
}