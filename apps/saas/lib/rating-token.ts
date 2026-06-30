import { createHmac } from 'crypto'

/**
 * Genera un token determinístico por orderId usando HMAC-SHA256.
 * No requiere almacenarlo en DB — se verifica recomputando.
 */
export function generateRatingToken(orderId: string): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET no está configurado')
  return createHmac('sha256', secret)
    .update(orderId)
    .digest('hex')
    .slice(0, 24)
}

export function verifyRatingToken(orderId: string, token: string): boolean {
  if (!token || token.length !== 24) return false
  return generateRatingToken(orderId) === token
}
