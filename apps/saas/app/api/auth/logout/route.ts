import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyPosToken } from '@/lib/posJwt'
import { denyJti } from '@/lib/jtiDenylist'
import { rateLimit } from '@/lib/rateLimit'

/**
 * POST /api/auth/logout — revoca el token POS al instante (S1-5).
 *
 * El POS llama a este endpoint (y al de sync) en su logout. Escribe el
 * `jti` en la denylist: a partir de ahí `verifyPosToken` rechaza el token
 * aunque su firma y `exp` sigan siendo válidos.
 *
 * Rate limit: 60/min por IP ANTES de verificar (holgado: todas las
 * tablets de un local comparten IP y cierran turno casi juntas) y
 * 20/min por sub DESPUÉS de verificar.
 *
 * Si la escritura en la denylist falla → 503 (`revoke_unavailable`): el
 * POS lo registra como revocación PARCIAL y reintenta en memoria.
 *
 * Idempotente: un segundo intento con el mismo token falla la verificación
 * (ya está deny-listeado) y responde 401 — el cliente es best-effort.
 */
export async function POST(request: NextRequest) {
  const fwd = request.headers.get('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const ipLimit = await rateLimit(`logout:ip:${ip}`, 60, 60_000)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Demasiadas solicitudes', code: 'rate_limited' }, { status: 429 })
  }

  const token = extractBearerToken(request.headers.get('authorization'))
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const payload = await verifyPosToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { jti, exp } = payload
  if (!jti) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const subLimit = await rateLimit(`logout:sub:${payload.sub}`, 20, 60_000)
  if (!subLimit.success) {
    return NextResponse.json({ error: 'Demasiadas solicitudes', code: 'rate_limited' }, { status: 429 })
  }

  // Veto por la vida restante del token + 60s de margen de reloj.
  const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 0) + 60
  const ok = await denyJti(jti, ttl)
  if (!ok) {
    return NextResponse.json(
      { error: 'Revocación no persistida', code: 'revoke_unavailable' },
      { status: 503 }
    )
  }

  return NextResponse.json({ revoked: true })
}
