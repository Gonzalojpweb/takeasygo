import { createHmac, timingSafeEqual } from "node:crypto"

export function createEventSignature(
  payload: string,
  nonce: string,
  timestamp: number,
  secret: string
): string {
  const data = `${timestamp}.${nonce}.${payload}`
  return createHmac("sha256", secret).update(data).digest("hex")
}

export function validateEventSignature(
  payload: string,
  nonce: string,
  timestamp: number,
  signature: string,
  secret: string
): boolean {
  const expected = createEventSignature(payload, nonce, timestamp, secret)
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
