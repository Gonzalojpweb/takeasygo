import mongoose from 'mongoose'
import CustomerEvent from '@/models/CustomerEvent'

// ─────────────────────────────────────────────────────────────────────────────
// lib/events-server.ts — Único writer server-side de CustomerEvent
// ─────────────────────────────────────────────────────────────────────────────
// Design:
// - Toda escritura server-side (webhooks, status, verify, endpoints admin)
//   pasa por acá, para que el dedup viva en UN solo lugar.
// - checkout_completed usa upsert con $setOnInsert sobre el índice único
//   parcial {tenantId, type, data.orderId} → idempotente ante reintentos de
//   webhook/polling, sin condición de carrera (no es "find then create").
// - Fire-and-forget: los callers server normalmente hacen `.catch()`.
// ─────────────────────────────────────────────────────────────────────────────

export type EventMetadataSource =
  | 'order' | 'posthog' | 'posthog_sync' | 'explore' | 'loyalty' | 'cron' | 'manual' | 'client_side'

export interface CustomerEventInput {
  tenantId: mongoose.Types.ObjectId | string
  type: string
  phoneHash?: string
  data?: Record<string, unknown>
  metadata?: {
    source: EventMetadataSource
    sessionId?: string
    device?: string
    locationId?: mongoose.Types.ObjectId | string
    abTest?: string
    latencyMs?: number
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000)
}

export async function writeCustomerEvent(input: CustomerEventInput): Promise<void> {
  const tenantId = input.tenantId
  const phoneHash = input.phoneHash || ''
  const data = input.data || {}
  const metadata = input.metadata || { source: 'manual' as EventMetadataSource }

  try {
    // Dedup atómico: un solo checkout_completed por orden y tenant.
    if (input.type === 'checkout_completed' && data.orderId) {
      await CustomerEvent.updateOne(
        { tenantId, type: 'checkout_completed', 'data.orderId': data.orderId },
        { $setOnInsert: { phoneHash, tenantId, type: input.type, data, metadata } },
        { upsert: true }
      )
      return
    }

    await CustomerEvent.create({ phoneHash, tenantId, type: input.type, data, metadata })
  } catch (err) {
    // Carrera de upsert concurrente: otro request ya insertó el mismo doc — ok.
    if (isDuplicateKeyError(err)) return
    throw err
  }
}

// ── Checkout completado (punto canónico) ─────────────────────────────────────
// Lo llaman (los 10 puntos): webhook Mercado Pago, webhook Kripton,
// verify-payment, verify-payment-by-number, track (polling MP),
// orders/[orderId]/status, confirm-transfer-admin, change-payment-method,
// payments/reconcile, POST /orders (creación confirmada) — y el fallback
// client vía POST /api/[tenant]/events (mismo dedup, no puede duplicar).
//
// ── CRITERIO ÚNICO de "checkout_completed" ───────────────────────────────────
// Una orden cuenta como COMPLETADA únicamente cuando, dentro de ESTA request,
// transiciona por primera vez a un estado post-compra. Estados post-compra:
//
//     confirmed | preparing | ready | delivered
//
// Casos concretos (los 10 puntos usan este mismo criterio vía `previousStatus`):
//   - Efectivo (cash): la orden NACE en 'confirmed' al crearse (POST /orders)
//     o al cambiarse a cash desde awaiting_payment (change-payment-method).
//     payment queda pending (se cobra contra entrega), pero el CHECKOUT ya se
//     completó: el cliente terminó el flujo de compra.
//   - Transferencia: al confirmarla el admin (confirm-transfer-admin) o vía
//     PATCH status (transición →confirmed con payment approved).
//   - MercadoPago / Kripton: al aprobarse el pago (webhooks, verify-payment,
//     verify-payment-by-number, track polling, payments/reconcile) pasando de
//     'awaiting_payment' a 'confirmed'.
//
// Si `previousStatus` YA era un estado post-compra, NO se emite: relecturas,
// polling y reintentos no inflan el funnel. Segunda capa (concurrencia): el
// upsert único {tenantId, type, data.orderId} en writeCustomerEvent.

const POST_COMPLETION_STATUSES = ['confirmed', 'preparing', 'ready', 'delivered']

/**
 * true solo cuando la orden PASA a un estado post-compra en esta request
 * (previousStatus no era post-compra y el actual sí). Usado por los 10
 * puntos de emisión de checkout_completed.
 */
export function becameCompleted(
  previousStatus: string | undefined,
  currentStatus: string | undefined
): boolean {
  const wasDone = Boolean(previousStatus && POST_COMPLETION_STATUSES.includes(previousStatus))
  const isDone = Boolean(currentStatus && POST_COMPLETION_STATUSES.includes(currentStatus))
  return isDone && !wasDone
}

export async function captureCheckoutCompletedServer(params: {
  tenantId: mongoose.Types.ObjectId | string
  orderId: mongoose.Types.ObjectId | string
  phoneHash?: string
  /** Monto total en centavos. @storedAs cents */
  amount?: number
  quantity?: number
  orderMode?: string
  paymentMethod?: string
  source?: EventMetadataSource
}): Promise<void> {
  await writeCustomerEvent({
    tenantId: params.tenantId,
    type: 'checkout_completed',
    phoneHash: params.phoneHash,
    data: {
      orderId: params.orderId,
      ...(params.amount !== undefined ? { amount: params.amount } : {}),
      ...(params.quantity !== undefined ? { quantity: params.quantity } : {}),
      ...(params.orderMode ? { orderMode: params.orderMode } : {}),
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    },
    metadata: { source: params.source || 'order' },
  })
}

// ── Atajo desde un doc Order ─────────────────────────────────────────────────
// Extrae amount/quantity/orderMode/paymentMethod consistentes en todos los
// puntos de confirmación (webhooks MP/Kripton, verify, status, POST /orders).

interface OrderLike {
  _id: mongoose.Types.ObjectId | string
  status?: string
  customer?: { phoneHash?: string }
  payment?: { baseTotal?: number; method?: string }
  orderMode?: string
  items?: Array<{ quantity?: number }>
}

/**
 * Única puerta de emisión server-side de checkout_completed.
 *
 * @param previousStatus estado de la orden ANTES de que esta request la
 *   mutara (undefined solo en creación: la orden nace directa en su estado
 *   inicial). El gate `becameCompleted` decide si corresponde emitir — ver
 *   CRITERIO ÚNICO arriba.
 */
export async function captureCheckoutCompletedFromOrder(
  order: OrderLike,
  tenantId: mongoose.Types.ObjectId | string,
  previousStatus: string | undefined,
  source: EventMetadataSource = 'order'
): Promise<void> {
  if (!becameCompleted(previousStatus, order.status)) return
  await captureCheckoutCompletedServer({
    tenantId,
    orderId: order._id,
    phoneHash: order.customer?.phoneHash,
    amount: order.payment?.baseTotal,
    quantity: order.items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    orderMode: order.orderMode,
    paymentMethod: order.payment?.method,
    source,
  })
}
