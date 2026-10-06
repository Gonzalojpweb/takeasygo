import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyPosToken } from '@/lib/posJwt'
import { denyJti } from '@/lib/jtiDenylist'

/**
 * POST /api/auth/logout — revoca el token POS al instante (S1-5).
 *
 * El POS llama a este endpoint (y al de sync) en su logout. Escribe el
 * `jti` en la denylist: a partir de ahí `verifyPosToken` rechaza el token
 * aunque su firma y `exp` sigan siendo válidos.
 *
 * Idempotente: un segundo intento con el mismo token falla la verificación
 * (ya está deny-listeado) y responde 401 — el cliente es best-effort.
 */
export async function POST(request: NextRequest) {
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

  // Veto por la vida restante del token + 60s de margen de reloj.
  const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 0) + 60
  await denyJti(jti, ttl)

  return NextResponse.json({ revoked: true })
}
