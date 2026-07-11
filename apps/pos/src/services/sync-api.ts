const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "http://localhost:3001"

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
