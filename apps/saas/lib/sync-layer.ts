import mongoose from 'mongoose'

const SYNC_LAYER_URL = process.env.SYNC_LAYER_URL ?? ""
const SYNC_LAYER_SECRET = process.env.SYNC_LAYER_SECRET ?? ""

// Todo destino y todo fallo deja URL en el log: con console.error solo no se
// distingue "variable sin cargar" de "401" de "timeout".
const target = SYNC_LAYER_URL || "(SYNC_LAYER_URL sin definir)"
const secretState = SYNC_LAYER_SECRET ? "presente" : "AUSENTE"

/** true = falta env; deja el motivo en el log y el caller aborta. */
function envMissing(fn: string): boolean {
  if (SYNC_LAYER_URL && SYNC_LAYER_SECRET) return false
  const missing = [
    !SYNC_LAYER_URL ? "SYNC_LAYER_URL" : "",
    !SYNC_LAYER_SECRET ? "SYNC_LAYER_SECRET" : "",
  ]
    .filter(Boolean)
    .join(" y ")
  console.warn(`[sync-layer] SKIP ${fn}: falta ${missing}. Nada se envi\u00f3 al Sync Layer.`)
  return true
}

interface SyncOrderPayload {
  tenantId: string
  externalOrderId: string
  locationId?: string
  items: { productId?: string; name: string; quantity: number; unitPrice: number; total: number; modifiers?: { name: string; price: number }[] }[]
  total: number
  baseTotal?: number
  surchargeAmount?: number
  notes?: string
  menuVersion?: number
  paymentMethod?: string
  /** dine-in | takeaway | delivery | business — alimenta los filtros de Entrantes del POS. */
  orderMode?: string
  /** Pedidos App (30/10): número, cliente y entrega para atenderlo en el POS. */
  display?: {
    orderNumber?: string
    customerName?: string
    customerPhone?: string
    deliveryAddress?: string
  }
}

const PUSH_TIMEOUT_MS = 8000
const PUSH_RETRY_DELAYS_MS = [1000, 3000]

/**
 * Alta del pedido online en el Sync (→ `order:created` a los POS de la sede).
 * Reintenta ante red caída / timeout / 5xx: es idempotente porque el Sync
 * deduplica por `externalOrderId`. Un 4xx no se reintenta (payload inválido).
 * Devuelve true si el Sync lo aceptó. Nunca lanza.
 */
export async function pushOrderToSyncLayer(payload: SyncOrderPayload): Promise<boolean> {
  if (envMissing("pushOrderToSyncLayer")) return false

  for (let attempt = 0; attempt <= PUSH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(`${SYNC_LAYER_URL}/api/v1/internal/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": SYNC_LAYER_SECRET,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      })

      if (res.ok) return true
      const text = await res.text().catch(() => "unknown")
      console.error(`[sync-layer] push POST ${target}/api/v1/internal/orders -> ${res.status}: ${text} (pedido ${payload.externalOrderId}, intento ${attempt + 1})`)
      if (res.status < 500) return false
    } catch (err) {
      console.error(`[sync-layer] push error -> ${target}/api/v1/internal/orders (pedido ${payload.externalOrderId}, intento ${attempt + 1}):`, err)
    }
    const delay = PUSH_RETRY_DELAYS_MS[attempt]
    if (delay === undefined) break
    await new Promise((r) => setTimeout(r, delay))
  }
  console.error(`[sync-layer] push ABORTED: el pedido ${payload.externalOrderId} no llegó al Sync (el POS lo recupera recién si se reintenta). target=${target} secret=${secretState}`)
  return false
}

export async function confirmOrderInSyncLayer(
  orderId: string,
  tenantId: string
): Promise<boolean> {
  if (envMissing("confirmOrderInSyncLayer")) return false

  const MAX_RETRIES = 3
  const DELAYS_MS = [2000, 4000, 8000]

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${SYNC_LAYER_URL}/api/v1/internal/orders/${orderId}/confirm`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": SYNC_LAYER_SECRET,
        },
        body: JSON.stringify({ tenantId }),
      })

      if (res.ok) {
        return true
      }

      const text = await res.text().catch(() => "unknown")
      console.warn(
        `[sync-layer] confirm attempt ${attempt}/${MAX_RETRIES} -> PATCH ${target}/api/v1/internal/orders/${orderId}/confirm -> ${res.status}: ${text}`
      )
    } catch (err) {
      console.warn(
        `[sync-layer] confirm attempt ${attempt}/${MAX_RETRIES} -> PATCH ${target}/api/v1/internal/orders/${orderId}/confirm error:`,
        err
      )
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, DELAYS_MS[attempt - 1]))
    }
  }

  console.error(
    `[sync-layer] confirm ABORTED - SyncLayer unreachable after ${MAX_RETRIES} retries. target=${target} secret=${secretState}`,
    { orderId, tenantId }
  )
  return false
}

/**
 * Contrato con `POST /api/v1/cash-sale` del Sync (apps/sync/src/routes/
 * cash-sale.ts). BUG 2026-10-25: el SaaS mandaba `total` y no `orderMode`,
 * pero el Sync exige `amount` y `orderMode` → 400 «Invalid payload» en TODAS
 * las ventas cobradas de la App: ninguna llegaba a la caja del POS.
 * `locationId` permite al Sync avisar a los POS multisede (sala de la sede).
 */
interface CashSalePayload {
  orderId: string
  tenantId: string
  /** @storedAs cents */
  amount: number
  orderMode: "takeaway" | "delivery" | "dine-in" | "business"
  paymentMethod: "cash" | "mercadopago" | "posnet_debit" | "posnet_credit" | "kripton" | "transfer"
  locationId?: string
  items: { name: string; quantity: number; unitPrice: number; total: number }[]
  channel: string
}

const CASH_SALE_METHODS = new Set(["cash", "mercadopago", "posnet_debit", "posnet_credit", "kripton", "transfer"])
const CASH_SALE_MODES = new Set(["takeaway", "delivery", "dine-in", "business"])

/** Arma el payload que el Sync acepta (pura, testeable). */
export function buildCashSalePayload(order: ConfirmableOrder, tenantId: string): CashSalePayload {
  const method = order.payment?.method ?? "mercadopago"
  const mode = order.orderMode ?? "takeaway"
  return {
    orderId: order._id.toString(),
    tenantId,
    amount: order.total,
    orderMode: (CASH_SALE_MODES.has(mode) ? mode : "takeaway") as CashSalePayload["orderMode"],
    paymentMethod: (CASH_SALE_METHODS.has(method) ? method : "mercadopago") as CashSalePayload["paymentMethod"],
    ...(order.locationId ? { locationId: order.locationId.toString() } : {}),
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      total: item.subtotal,
    })),
    channel: "online",
  }
}

export async function notifyCashSale(payload: CashSalePayload): Promise<void> {
  if (envMissing("notifyCashSale")) return

  try {
    const res = await fetch(`${SYNC_LAYER_URL}/api/v1/cash-sale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SYNC_LAYER_SECRET,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown")
      console.error(`[sync-layer] cash-sale notify POST ${target}/api/v1/cash-sale -> ${res.status}: ${text}`)
      return
    }
  } catch (err) {
    console.error(`[sync-layer] cash-sale notify error -> ${target}/api/v1/cash-sale:`, err)
  }
}

// ============================================================================
// confirmOrderPayment — Shared confirmation function (Fase 0)
// ============================================================================
// Single entry point for all 3 confirmation paths:
//   1. MP webhook → confirmOrderPayment()
//   2. Admin transfer confirm → confirmOrderPayment()
//   3. POS transfer confirm → SyncLayer → SaaS confirm-internal → confirmOrderPayment()
//
// Calls: confirmOrderInSyncLayer + notifyCashSale + captureOrderCompleted
// Idempotent: confirmOrderInSyncLayer is idempotent, notifyCashSale deduplicates
//             via (orderId, tenantId) compound unique index.
// ============================================================================

interface ConfirmableOrder {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  total: number
  items: Array<{
    name: string
    quantity: number
    price: number
    subtotal: number
    categoryName?: string
  }>
  payment?: { method?: string }
  customer?: { phoneHash?: string }
  orderMode?: string
  locationId?: mongoose.Types.ObjectId | string | null
}

interface ConfirmableTenant {
  _id: mongoose.Types.ObjectId
}

export async function confirmOrderPayment(
  order: ConfirmableOrder,
  tenant: ConfirmableTenant
): Promise<void> {
  if (envMissing("confirmOrderPayment")) return

  const orderId = order._id.toString()
  const tenantId = tenant._id.toString()

  // 1. Confirm in SyncLayer — ABORT on failure (no cash sale, no CIS)
  const confirmed = await confirmOrderInSyncLayer(orderId, tenantId)
  if (!confirmed) {
    console.error(
      `[confirmOrderPayment] ABORTED - SyncLayer unreachable after retries. ` +
        `Nothing registered in cash or CIS. Caller can retry. target=${target} secret=${secretState}`,
      { orderId, tenantId, paymentMethod: order.payment?.method }
    )
    return
  }

  // 2. Notify cash sale + CIS
  await confirmOrderPaymentCore(order, tenant)
}

// ============================================================================
// confirmOrderPaymentCore — Core confirmation without SyncLayer call
// ============================================================================
// Used by /confirm-internal when SyncLayer already confirmed the order.
// Skips confirmOrderInSyncLayer (already done) and goes directly to
// notifyCashSale + captureOrderCompleted.

export async function confirmOrderPaymentCore(
  order: ConfirmableOrder,
  tenant: ConfirmableTenant
): Promise<void> {
  const orderId = order._id.toString()
  const tenantId = tenant._id.toString()

  // 1. Notify cash sale (deduplicates via unique index)
  await notifyCashSale(buildCashSalePayload(order, tenantId))

  // 2. CIS order_completed event (fire-and-forget)
  if (order.customer?.phoneHash) {
    try {
      const { captureOrderCompleted } = await import('@/lib/cis/events')
      await captureOrderCompleted(
        order.customer.phoneHash,
        tenant._id,
        order._id,
        order.total,
        order.items.map((item) => ({
          name: item.name,
          category: item.categoryName,
        }))
      )
    } catch (err) {
      console.error('[sync-layer] CIS captureOrderCompleted error:', err)
    }
  }

  // 3. Factura electrónica automática del pedido online (Fase 6). Solo si el
  //    comercio la activó; nunca lanza. Efectivo se factura al entregar.
  const { autoInvoiceOnlineOrder } = await import('@/lib/fiscal/online')
  await autoInvoiceOnlineOrder(orderId, 'paid')
}

// ============================================================================
// notifySyncLayerStatus — Notify SyncLayer of SaaS-initiated status changes
// ============================================================================
// When the SaaS updates an order's status (via admin panel, delivery app,
// etc.), this function notifies the SyncLayer so it can:
//   1. Update its own DB
//   2. Emit order:status_updated to connected POS instances
// Uses skipForward: true to prevent the SyncLayer from forwarding back to SaaS
// (which would create an infinite loop: SaaS → SyncLayer → SaaS).
// ============================================================================

export async function notifySyncLayerStatus(
  tenantId: string,
  orderId: string,
  status: string
): Promise<void> {
  if (envMissing("notifySyncLayerStatus")) return

  try {
    const res = await fetch(`${SYNC_LAYER_URL}/api/v1/internal/orders/${orderId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SYNC_LAYER_SECRET,
      },
      body: JSON.stringify({ tenantId, status, skipForward: true }),
    })

    if (!res.ok) {
      if (res.status === 404) {
        // La orden nunca fue pusheada al Sync (p.ej. creada en efectivo sin
        // pasar por confirmed/awaiting_payment): no es error, se omite.
        console.warn(`[sync-layer] notify status: order ${orderId} not in SyncLayer (skipped)`)
        return
      }
      const text = await res.text().catch(() => "unknown")
      console.error(`[sync-layer] notify status POST ${target}/api/v1/internal/orders/${orderId}/status -> ${res.status}: ${text}`)
      return
    }
    console.log(`[sync-layer] notify status ok: ${orderId} -> ${status}`)
  } catch (err) {
    console.error(`[sync-layer] notify status error -> ${target}/api/v1/internal/orders/${orderId}/status:`, err)
  }
}
