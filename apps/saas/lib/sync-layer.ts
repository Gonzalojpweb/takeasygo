import mongoose from 'mongoose'

const SYNC_LAYER_URL = process.env.SYNC_LAYER_URL ?? ""
const SYNC_LAYER_SECRET = process.env.SYNC_LAYER_SECRET ?? ""

interface SyncOrderPayload {
  tenantId: string
  externalOrderId: string
  locationId?: string
  items: { productId?: string; name: string; quantity: number; unitPrice: number; total: number }[]
  total: number
  baseTotal?: number
  surchargeAmount?: number
  notes?: string
  menuVersion?: number
  paymentMethod?: string
}

export async function pushOrderToSyncLayer(payload: SyncOrderPayload): Promise<void> {
  if (!SYNC_LAYER_URL || !SYNC_LAYER_SECRET) {
    console.warn("[sync-layer] SYNC_LAYER_URL or SYNC_LAYER_SECRET not configured, skipping")
    return
  }

  try {
    const res = await fetch(`${SYNC_LAYER_URL}/api/v1/internal/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SYNC_LAYER_SECRET,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown")
      console.error(`[sync-layer] push failed (${res.status}): ${text}`)
      return
    }
  } catch (err) {
    console.error("[sync-layer] push error:", err)
  }
}

export async function confirmOrderInSyncLayer(
  orderId: string,
  tenantId: string
): Promise<boolean> {
  if (!SYNC_LAYER_URL || !SYNC_LAYER_SECRET) return false

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
      console.warn(`[sync-layer] confirm attempt ${attempt}/${MAX_RETRIES} failed (${res.status}): ${text}`)
    } catch (err) {
      console.warn(`[sync-layer] confirm attempt ${attempt}/${MAX_RETRIES} error:`, err)
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, DELAYS_MS[attempt - 1]))
    }
  }

  console.error(
    `[sync-layer] confirm ABORTED — SyncLayer unreachable after ${MAX_RETRIES} retries`,
    { orderId, tenantId }
  )
  return false
}

interface CashSalePayload {
  orderId: string
  tenantId: string
  total: number
  items: { name: string; quantity: number; unitPrice: number; total: number }[]
  paymentMethod: string
  channel: string
}

export async function notifyCashSale(payload: CashSalePayload): Promise<void> {
  if (!SYNC_LAYER_URL || !SYNC_LAYER_SECRET) return

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
      console.error(`[sync-layer] cash-sale notify failed (${res.status}): ${text}`)
      return
    }
  } catch (err) {
    console.error("[sync-layer] cash-sale notify error:", err)
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
}

interface ConfirmableTenant {
  _id: mongoose.Types.ObjectId
}

export async function confirmOrderPayment(
  order: ConfirmableOrder,
  tenant: ConfirmableTenant
): Promise<void> {
  if (!SYNC_LAYER_URL || !SYNC_LAYER_SECRET) return

  const orderId = order._id.toString()
  const tenantId = tenant._id.toString()

  // 1. Confirm in SyncLayer — ABORT on failure (no cash sale, no CIS)
  const confirmed = await confirmOrderInSyncLayer(orderId, tenantId)
  if (!confirmed) {
    console.error(
      `[confirmOrderPayment] ABORTED — SyncLayer unreachable after retries. ` +
      `Nothing registered in cash or CIS. Caller can retry.`,
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
  await notifyCashSale({
    orderId,
    tenantId,
    total: order.total,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      total: item.subtotal,
    })),
    paymentMethod: order.payment?.method ?? 'mercadopago',
    channel: 'online',
  })

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
  if (!SYNC_LAYER_URL || !SYNC_LAYER_SECRET) return

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
      const text = await res.text().catch(() => "unknown")
      console.error(`[sync-layer] notify status failed (${res.status}): ${text}`)
      return
    }
  } catch (err) {
    console.error("[sync-layer] notify status error:", err)
  }
}
