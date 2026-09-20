import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { hashPhone } from '@/lib/crypto'

const SECRET = process.env.MEMBER_TOKEN_SECRET || process.env.ENCRYPTION_KEY
const ALG = 'HS256'
const EXPIRY = '90d'

export interface MemberTokenPayload extends JWTPayload {
  memberId: string
  tenantId: string
  phoneHash: string
  version: number
}

/**
 * Firma un token de miembro del club.
 * Emitido al registrarse o al hacer login al club.
 * Validado en checkout para aplicar descuentos de promo club.
 */
export async function signMemberToken(
  memberId: string,
  tenantId: string,
  phone: string,
  version: number = 1,
): Promise<string> {
  if (!SECRET) throw new Error('MEMBER_TOKEN_SECRET or ENCRYPTION_KEY not configured')

  const secret = new TextEncoder().encode(SECRET)
  return new SignJWT({
    memberId,
    tenantId,
    phoneHash: hashPhone(phone),
    version,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret)
}

/**
 * Verifica un token de miembro.
 * Devuelve el payload si es válido, o null si es inválido/expirado.
 *
 * El caller DEBE validar:
 * 1. Que el member exista y esté activo
 * 2. Que phoneHash del token coincida con el phone del form
 * 3. Que member.tokenVersion === payload.version
 */
export async function verifyMemberToken(
  token: string,
): Promise<{ valid: true; payload: MemberTokenPayload } | { valid: false; reason: string }> {
  if (!SECRET) return { valid: false, reason: 'MEMBER_TOKEN_SECRET not configured' }
  if (!token) return { valid: false, reason: 'No token provided' }

  try {
    const secret = new TextEncoder().encode(SECRET)
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] })
    const p = payload as unknown as MemberTokenPayload

    if (!p.memberId || !p.tenantId || !p.phoneHash || p.version == null) {
      return { valid: false, reason: 'Invalid token payload' }
    }

    return { valid: true, payload: p }
  } catch (err: any) {
    if (err.code === 'ERR_JWT_EXPIRED') return { valid: false, reason: 'Token expired' }
    if (err.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return { valid: false, reason: 'Invalid signature' }
    return { valid: false, reason: err.message || 'Token verification failed' }
  }
}
