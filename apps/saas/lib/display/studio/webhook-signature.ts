import crypto from 'node:crypto'

/** Firma x-signature de MercadoPago (HMAC-SHA256, manifest id/request-id/ts). */
export function validMpSignature(header: string | null, requestId: string | null, dataId: string, secret: string): boolean {
  if (!header || !requestId) return false
  const parts: Record<string, string> = {}
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=')
    if (k && v) parts[k.trim()] = v.trim()
  }
  if (!parts.ts || !parts.v1) return false
  const expected = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${parts.ts};`).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex'))
  } catch {
    return false
  }
}
