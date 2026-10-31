import { timingSafeEqual } from 'node:crypto'

/**
 * Compara dos secretos (tokens de seguimiento, claves compartidas) en tiempo
 * constante: el tiempo de respuesta no revela cuántos caracteres coinciden.
 * Auditoría 30/10/2026 (B2). Distinto largo o valores vacíos ⇒ false.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
