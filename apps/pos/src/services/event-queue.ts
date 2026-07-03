import type { OfflineEvent, SyncEventType } from "@takeasygo/types"
import { db } from "../db/dexie"
import { createEventSignature, generateNonce } from "./crypto"
import { replayEvents } from "./sync-api"

const MAX_RETRIES = 3

export async function enqueue(
  tenantId: string,
  type: SyncEventType,
  payload: unknown
): Promise<OfflineEvent> {
  const config = await db.tenantConfig.get(tenantId)
  if (!config?.deviceSecret) {
    throw new Error(`No deviceSecret for tenant ${tenantId}`)
  }

  const id = crypto.randomUUID()
  const nonce = generateNonce()
  const timestamp = new Date()

  const payloadStr =
    typeof payload === "string" ? payload : JSON.stringify(payload)

  const signature = await createEventSignature(
    payloadStr,
    nonce,
    timestamp.getTime(),
    config.deviceSecret
  )

  const event: OfflineEvent = {
    id,
    tenantId,
    type,
    payload,
    timestamp,
    nonce,
    signature,
    status: "pending",
    retryCount: 0,
  }

  await db.pendingEvents.add(event)
  return event
}

export async function getPending(tenantId: string): Promise<OfflineEvent[]> {
  return db.pendingEvents
    .where("tenantId")
    .equals(tenantId)
    .and((e) => e.status === "pending" ||
           (e.status === "failed" && e.retryCount < MAX_RETRIES))
    .sortBy("timestamp")
}

export async function flush(
  tenantId: string,
  jwt: string
): Promise<{ synced: number; failed: number }> {
  const pending = await getPending(tenantId)
  if (pending.length === 0) return { synced: 0, failed: 0 }

  const replayPayload = pending.map((e) => ({
    id: e.id,
    type: e.type,
    payload: e.payload,
    timestamp: e.timestamp.toISOString(),
    nonce: e.nonce,
    signature: e.signature,
  }))

  try {
    const response = await replayEvents(replayPayload, jwt)

    await Promise.all(
      pending.map((e) => db.pendingEvents.delete(e.id))
    )

    return { synced: response.eventsProcessed, failed: 0 }
  } catch (err) {
    console.error("[event-queue] flush error:", err)

    await Promise.all(
      pending.map((e) => {
        const newRetryCount = e.retryCount + 1
        return db.pendingEvents.update(e.id, {
          status: newRetryCount >= MAX_RETRIES
            ? "requires_manual_attention"
            : "failed",
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
        })
      })
    )

    return { synced: 0, failed: pending.length }
  }
}

export async function remove(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => db.pendingEvents.delete(id)))
}

export async function markFailed(id: string): Promise<void> {
  const event = await db.pendingEvents.get(id)
  if (event) {
    await db.pendingEvents.update(id, {
      status: "failed",
      retryCount: event.retryCount + 1,
      lastRetryAt: new Date(),
    })
  }
}

export async function getPendingCount(tenantId: string): Promise<number> {
  return db.pendingEvents
    .where("tenantId")
    .equals(tenantId)
    .and((e) => e.status === "pending" ||
           (e.status === "failed" && e.retryCount < MAX_RETRIES))
    .count()
}
