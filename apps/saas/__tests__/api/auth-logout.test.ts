import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { generateKeyPairSync } from 'node:crypto'
import { signJwt } from '@takeasygo/business/jwt'
import { POST } from '@/app/api/auth/logout/route'
import { verifyPosToken } from '@/lib/posJwt'
import { __resetJtiDenylistForTests } from '@/lib/jtiDenylist'

/**
 * S1-5 — POST /api/auth/logout.
 *
 * El POS llama a este endpoint (y al de sync) en su logout. El contrato:
 *  - solo con Bearer válido → 401 sin él o con token inválido/revocado;
 *  - 200 deja el jti en la denylist: verifyPosToken pasa a rechazarlo;
 *  - idempotencia: un segundo intento con el mismo token da 401.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }) as string

const basePayload = {
  sub: '64b0000000000000000000a1',
  tenantId: '64b0000000000000000000b2',
  role: 'cashier' as const,
  deviceType: 'hub' as const,
  locationId: '64b0000000000000000000c3',
}

const ORIGINAL_ENV = {
  POS_JWT_PUBLIC_KEY: process.env.POS_JWT_PUBLIC_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
}

function restoreEnv() {
  if (ORIGINAL_ENV.POS_JWT_PUBLIC_KEY === undefined) delete process.env.POS_JWT_PUBLIC_KEY
  else process.env.POS_JWT_PUBLIC_KEY = ORIGINAL_ENV.POS_JWT_PUBLIC_KEY
  if (ORIGINAL_ENV.UPSTASH_REDIS_REST_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL
  else process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_ENV.UPSTASH_REDIS_REST_URL
  if (ORIGINAL_ENV.UPSTASH_REDIS_REST_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
  else process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_ENV.UPSTASH_REDIS_REST_TOKEN
}

function logoutRequest(accessToken: string | null): NextRequest {
  const headers = new Headers()
  if (accessToken !== null) headers.set('authorization', `Bearer ${accessToken}`)
  return new NextRequest('http://localhost/api/auth/logout', { method: 'POST', headers })
}

beforeEach(() => {
  process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  __resetJtiDenylistForTests()
})

afterEach(() => {
  restoreEnv()
  __resetJtiDenylistForTests()
})

describe('POST /api/auth/logout', () => {
  it('401 sin header Authorization', async () => {
    const res = await POST(logoutRequest(null))
    expect(res.status).toBe(401)
  })

  it('401 con un token que no verifica (firma de otra clave)', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const token = signJwt(
      basePayload,
      other.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    )
    const res = await POST(logoutRequest(token))
    expect(res.status).toBe(401)
  })

  it('200 y el token queda revocado (verifyPosToken pasa a dar null)', async () => {
    const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
    expect(await verifyPosToken(token)).not.toBeNull()

    const res = await POST(logoutRequest(token))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revoked: true })

    // E2E: la misma firma ahora es inválida para todo el SaaS.
    expect(await verifyPosToken(token)).toBeNull()
  })

  it('es idempotente: el segundo logout con el mismo token da 401', async () => {
    const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
    expect((await POST(logoutRequest(token))).status).toBe(200)
    expect((await POST(logoutRequest(token))).status).toBe(401)
  })

  it('revocar un token no afecta a los demás', async () => {
    const revoked = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
    const other = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)

    expect((await POST(logoutRequest(revoked))).status).toBe(200)

    expect(await verifyPosToken(revoked)).toBeNull()
    expect(await verifyPosToken(other)).not.toBeNull()
  })
})
