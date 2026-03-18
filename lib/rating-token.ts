import { createHmac } from 'crypto'

/**
 * Genera un token determinístico por orderId usando HMAC-SHA256.
 * No requiere almacenarlo en DB — se verifica recomputando.
 */
export function generateRatingToken(orderId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(orderId)
    .digest('hex')
    .slice(0, 24)
}

export function verifyRatingToken(orderId: string, token: string): boolean {
  if (!token || token.length !== 24) return false
  return generateRatingToken(orderId) === token
}
