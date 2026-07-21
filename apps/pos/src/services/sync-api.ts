const SYNC_URL = import.meta.env.VITE_SYNC_URL;

export interface ReplayEvent {
  id: string
  type: string
  payload: unknown
  timestamp: string
  nonce: string
  signature: string
}

export interface ReplayResponse {
  pendingOrders: unknown[]
  eventsProcessed: number
  tenantId: string
}

export async function replayEvents(
  events: ReplayEvent[],
  jwt: string
): Promise<ReplayResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/sync/replay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ events }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Replay failed (${res.status})`)
  }

  return res.json()
}

// ============================================================================
// Cash Sale ACK — Confirma al Sync Layer que el POS recibió el evento
// ============================================================================
// Nota: si este fetch falla (POS se desconecta justo después de procesar),
// el evento sigue en "pending" y BullMQ reintenta. La idempotencia en
// handleTakeasyGOSale absorbe el reproceso sin duplicar. No es necesario
// reintentar el ACK — el reproceso es seguro.
// ============================================================================

export async function acknowledgeCashSale(
  eventId: string,
  jwt: string
): Promise<void> {
  try {
    await fetch(`${SYNC_URL}/api/v1/cash-sale/${eventId}/deliver`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    })
  } catch {
    // ACK es fire-and-forget. Si falla:
    // - El evento queda en "pending"
    // - BullMQ reintenta (el POS lo absorbe con idempotencia)
    // - No hay riesgo de duplicado ni pérdida
    console.warn(`[sync-api] ACK failed for event ${eventId} (will retry via BullMQ)`)
  }
}

// ============================================================================
// Failed Cash Sale Events — Fetch de eventos fallidos para mostrar en POS
// ============================================================================

export interface FailedCashSaleEvent {
  _id: string
  orderId: string
  tenantId: string
  amount: number
  paymentMethod: string
  orderMode: string
  timestamp: string
  attempts: number
  lastError?: string
  createdAt: string
}

export async function fetchFailedCashSaleEvents(
  tenantId: string,
  jwt: string
): Promise<FailedCashSaleEvent[]> {
  try {
    const res = await fetch(
      `${SYNC_URL}/api/v1/cash-sale?status=failed&tenantId=${tenantId}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.events ?? []
  } catch {
    return []
  }
}

export async function retryCashSaleEvent(
  eventId: string,
  jwt: string
): Promise<boolean> {
  try {
    const res = await fetch(`${SYNC_URL}/api/v1/cash-sale/${eventId}/retry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    })
    return res.ok
  } catch {
    return false
  }
}

// ============================================================================
// Pending Orders — Fetch órdenes pendientes del SyncLayer (reconnect recovery)
// ============================================================================

export interface PendingSyncOrder {
  orderId: string
  tenantId: string
  source: string
  status: string
  paymentMethod?: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>
  total: number
  createdAt: string
}

export async function fetchPendingOrders(
  _tenantId: string,
  jwt: string
): Promise<PendingSyncOrder[]> {
  try {
    const res = await fetch(
      `${SYNC_URL}/api/v1/orders/pending`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      }
    )
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

// ============================================================================
// Confirm Transfer Payment — POS confirms a transfer order
// ============================================================================

export async function confirmTransferPayment(
  orderId: string,
  tenantId: string,
  jwt: string
): Promise<boolean> {
  try {
    const res = await fetch(`${SYNC_URL}/api/v1/internal/orders/${orderId}/confirm`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ tenantId }),
    })
    return res.ok
  } catch {
    return false
  }
}
