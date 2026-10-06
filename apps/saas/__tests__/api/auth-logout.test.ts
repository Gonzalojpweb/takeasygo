import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { generateKeyPairSync } from 'node:crypto'
import { signJwt } from '@takeasygo/business/jwt'
import { POST } from '@/app/api/auth/logout/route'
import { verifyPosToken } from '@/lib/posJwt'
import { __resetJtiDenylistForTests } from '@/lib/jtiDenylist'
import { __resetRateLimitForTests } from '@/lib/rateLimit'

/**
 * S1-5 — POST /api/auth/logout.
 *
 * El POS llama a este endpoint (y al de sync) en su logout. El contrato:
 *  - solo con Bearer válido → 401 sin él o con token inválido/revocado;
 *  - 200 deja el jti en la denylist: verifyPosToken pasa a rechazarlo;
 *  - idempotencia: un segundo intento con el mismo token da 401;
 *  - 503 `revoke_unavailable` si la denylist no persiste (G2: el POS lo
 *    registra como revocación PARCIAL y reintenta);
 *  - rate limit 60/min por IP (antes de verificar) y 20/min por sub.
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
  NODE_ENV: process.env.NODE_ENV,
}

function restoreEnv() {
  if (ORIGINAL_ENV.POS_JWT_PUBLIC_KEY === undefined) delete process.env.POS_JWT_PUBLIC_KEY
  else process.env.POS_JWT_PUBLIC_KEY = ORIGINAL_ENV.POS_JWT_PUBLIC_KEY
  if (ORIGINAL_ENV.UPSTASH_REDIS_REST_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL
  else process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_ENV.UPSTASH_REDIS_REST_URL
  if (ORIGINAL_ENV.UPSTASH_REDIS_REST_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
  else process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_ENV.UPSTASH_REDIS_REST_TOKEN
  if (ORIGINAL_ENV.NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV
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
  __resetRateLimitForTests()
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

describe('503 si la denylist no persiste (G2 — defectos 1 y 2)', () => {
  it('producción sin Upstash: error ruidoso + 503, NO finge revocación', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      process.env.NODE_ENV = 'production'
      const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)

      const res = await POST(logoutRequest(token))
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ code: 'revoke_unavailable' })

      // Fallo ruidoso: el misconfig aparece en los logs de producción.
      expect(
        errorSpy.mock.calls.some((c) => String(c[0]).includes('UPSTASH_REDIS_REST_URL'))
      ).toBe(true)

      // No finge revocación: el token sigue vivo y verificable.
      expect(await verifyPosToken(token)).not.toBeNull()
    } finally {
      errorSpy.mockRestore()
      restoreEnv()
    }
  })
})

describe('rate limit de logout (G2 — defecto 4)', () => {
  it('60/min por IP: el 61º request da 429', async () => {
    __resetRateLimitForTests()
    let last = 0
    for (let i = 0; i < 61; i++) {
      // Sub distinta por request: el límite por sub (20/min) no debe
      // dispararse antes que el de IP.
      const payload = { ...basePayload, sub: `64b00000000000000000${i.toString(16).padStart(4, '0')}` }
      const token = signJwt(payload, PRIVATE_PEM, 10 * 60 * 1000)
      last = (await POST(logoutRequest(token))).status
      if (i < 60) expect(last).toBe(200)
    }
    expect(last).toBe(429)
  })

  it('20/min por sub: el 21º logout da 429 code=rate_limited', async () => {
    __resetRateLimitForTests()
    let last = 0
    for (let i = 0; i < 21; i++) {
      const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
      const res = await POST(logoutRequest(token))
      last = res.status
      if (i < 20) expect(last).toBe(200)
    }
    expect(last).toBe(429)

    const token = signJwt(basePayload, PRIVATE_PEM, 10 * 60 * 1000)
    const res = await POST(logoutRequest(token))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ code: 'rate_limited' })
  })
})
