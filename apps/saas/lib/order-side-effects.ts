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
 * efectivo desde el flujo de emergencia tienen que registrar EXACTAMENTE la
 * misma venta en caja. Si cada endpoint tuviera su propia copia de estas
 * llamadas, el día que una cambie la otra quedaría desincronizada y una venta en
 * efectivo no aparecería en el reporte de caja.
 *
 * Puntos de entrada (a propósito):
 *   1. `POST /api/[tenant]/orders` con `payment.method === 'cash'` (checkout normal)
 *   2. `POST /api/[tenant]/orders/[orderId]/change-payment-method` → `cash` (emergencia)
 *
 * ── SEMÁNTICA DE EFECTIVO (no inventar otra) ──────────────────────────────────
 * Un pedido de efectivo normal queda `confirmed` + `payment.status: 'approved'`
 * AL INSTANTE. NO espera a que el cajero confirme: la confirmación del cajero es
 * para transferencia. El cajero cobra en el momento de la entrega.
 * Eso significa que este camino debe correr las mismas llamadas que el checkout
 * normal, sin importar desde qué endpoint venga.
 */

export interface OrderEffectItem {
  menuItemId?: unknown
  name: string
  quantity: number
  price: number
  subtotal: number
}

/**
 * Efectos EXCLUSIVOS de efectivo: aviso al admin + registro de la venta en caja.
 *
 * Fire-and-forget (setImmediate) igual que en el checkout normal: el pedido ya
 * está guardado y confirmado; un fallo acá no debe tumbar la respuesta.
 */
export async function registerCashSale(args: {
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

  setImmediate(async () => {
    try {
      await confirmOrderPaymentCore(order, tenant)
    } catch (err) {
      console.error(
        `[order-side-effects] CRITICAL: confirmOrderPaymentCore FAILED for cash order ${order.orderNumber} ` +
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
 * `registerCashSale`. En la creación de pedidos aplica a cash, deferred,
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