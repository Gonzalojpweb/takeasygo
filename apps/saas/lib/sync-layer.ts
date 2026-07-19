const SYNC_LAYER_URL = process.env.SYNC_LAYER_URL ?? ""
const SYNC_LAYER_SECRET = process.env.SYNC_LAYER_SECRET ?? ""

interface SyncOrderPayload {
  tenantId: string
  items: { productId?: string; name: string; quantity: number; unitPrice: number; total: number }[]
  total: number
  notes?: string
  menuVersion?: number
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
        Authorization: `Bearer ${SYNC_LAYER_SECRET}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown")
      console.error(`[sync-layer] push failed (${res.status}): ${text}`)
      return
    }

    console.log("[sync-layer] order pushed successfully")
  } catch (err) {
    console.error("[sync-layer] push error:", err)
  }
}
