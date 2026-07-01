import { validateEventSignature } from "@takeasygo/business"
import { config } from "../config"

const MAX_EVENT_AGE_MS = config.eventMaxAgeDays * 24 * 60 * 60 * 1000

export interface ValidatedEvent {
  id: string
  type: string
  payload: unknown
  timestamp: string
  nonce: string
  signature: string
}

const seenNonces = new Set<string>()

setInterval(() => {
  if (seenNonces.size > 10000) {
    seenNonces.clear()
  }
}, 60_000 * 10)

export function validateEvent(
  event: {
    id: string
    type: string
    payload: unknown
    timestamp: string
    nonce: string
    signature: string
  },
  tenantSecret: string
): { valid: true; event: ValidatedEvent } | { valid: false; reason: string } {
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

  if (seenNonces.has(event.nonce)) {
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

  seenNonces.add(event.nonce)

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
