import { validateEventSignature } from "@takeasygo/business"
import Redis from "ioredis"
import { config } from "../config"

const MAX_EVENT_AGE_MS = config.eventMaxAgeDays * 24 * 60 * 60 * 1000
const NONCE_TTL_SECONDS = config.eventMaxAgeDays * 86400

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
  }
  return redis
}

process.on("SIGTERM", () => {
  if (redis) {
    redis.quit()
    redis = null
  }
})

export interface ValidatedEvent {
  id: string
  type: string
  payload: unknown
  timestamp: string
  nonce: string
  signature: string
}

export async function validateEvent(
  event: {
    id: string
    type: string
    payload: unknown
    timestamp: string
    nonce: string
    signature: string
  },
  tenantSecret: string,
  tenantId: string
): Promise<{ valid: true; event: ValidatedEvent } | { valid: false; reason: string }> {
  const eventTime = new Date(event.timestamp).getTime()
  const now = Date.now()

  if (now - eventTime > MAX_EVENT_AGE_MS) {
    return { valid: false, reason: "Event too old" }
  }

  if (eventTime > now + 60_000) {
    return { valid: false, reason: "Event from future" }
  }

  if (!event.nonce || event.nonce.length < 8) {
    return { valid: false, reason: "Invalid nonce" }
  }

  const r = getRedis()
  const nonceKey = `nonce:${tenantId}:${event.nonce}`
  const exists = await r.exists(nonceKey)
  if (exists) {
    return { valid: false, reason: "Duplicate nonce (replay)" }
  }

  const payloadStr =
    typeof event.payload === "string"
      ? event.payload
      : JSON.stringify(event.payload)

  const timestampMs = new Date(event.timestamp).getTime()

  const isValid = validateEventSignature(
    payloadStr,
    event.nonce,
    timestampMs,
    event.signature,
    tenantSecret
  )

  if (!isValid) {
    return { valid: false, reason: "Invalid signature" }
  }

  await r.set(nonceKey, "1", "EX", NONCE_TTL_SECONDS)

  return {
    valid: true,
    event: {
      id: event.id,
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp,
      nonce: event.nonce,
      signature: event.signature,
    },
  }
}
