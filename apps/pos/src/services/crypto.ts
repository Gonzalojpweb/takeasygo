/**
 * Browser-safe HMAC-SHA256 using Web Crypto API.
 * Equivalente a createEventSignature de packages/business/src/sync-events.ts
 * que usa node:crypto — este archivo es el counterpart para el browser.
 */

function base64UrlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
}

export async function createEventSignature(
  payload: string,
  nonce: string,
  timestamp: number,
  secret: string
): Promise<string> {
  const key = await importKey(secret)
  const data = `${timestamp}.${nonce}.${payload}`
  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return base64UrlEncode(signature)
}

export function generateNonce(): string {
  return crypto.randomUUID()
}
