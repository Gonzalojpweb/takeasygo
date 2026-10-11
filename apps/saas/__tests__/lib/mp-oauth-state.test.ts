import { describe, it, expect, vi, afterEach } from 'vitest'
import { signMpOauthState, verifyMpOauthState } from '@/lib/mp-oauth-state'

const SECRET = 'test-mp-oauth-secret'
const TTL = 10 * 60 * 1000

afterEach(() => {
  vi.useRealTimers()
})

describe('mp-oauth-state', () => {
  it('roundtrip: firma y verifica conservando tenantSlug, accountId, nonce y exp', () => {
    const raw = signMpOauthState({ tenantSlug: 'palmyra', accountId: 'acc-1' }, SECRET)
    const state = verifyMpOauthState(raw, SECRET)

    expect(state).not.toBeNull()
    expect(state!.tenantSlug).toBe('palmyra')
    expect(state!.accountId).toBe('acc-1')
    expect(state!.nonce).toBeTruthy()
    expect(state!.exp - state!.ts).toBe(TTL)
  })

  it('omite accountId cuando no viene', () => {
    const raw = signMpOauthState({ tenantSlug: 'palmyra' }, SECRET)
    const state = verifyMpOauthState(raw, SECRET)
    expect(state).not.toBeNull()
    expect(state!.accountId).toBeUndefined()
  })

  it('rechaza el formato viejo sin firmar (JSON base64url clásico)', () => {
    const legacy = Buffer.from(
      JSON.stringify({ tenantSlug: 'palmyra', accountId: undefined, ts: Date.now() }),
      'utf8'
    ).toString('base64url')
    expect(verifyMpOauthState(legacy, SECRET)).toBeNull()
  })

  it('rechaza payload alterado', () => {
    const raw = signMpOauthState({ tenantSlug: 'palmyra' }, SECRET)
    const [payload, sig] = raw.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    decoded.tenantSlug = 'otro-tenant'
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')
    expect(verifyMpOauthState(`${forged}.${sig}`, SECRET)).toBeNull()
  })

  it('rechaza firma alterada', () => {
    const raw = signMpOauthState({ tenantSlug: 'palmyra' }, SECRET)
    const [payload] = raw.split('.')
    expect(verifyMpOauthState(`${payload}.aaaa${'b'.repeat(40)}`, SECRET)).toBeNull()
  })

  it('rechaza state firmado con otro secreto', () => {
    const raw = signMpOauthState({ tenantSlug: 'palmyra' }, 'otro-secreto')
    expect(verifyMpOauthState(raw, SECRET)).toBeNull()
  })

  it('expira a los 10 minutos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
    const raw = signMpOauthState({ tenantSlug: 'palmyra' }, SECRET)

    vi.setSystemTime(new Date('2026-10-11T12:09:00Z'))
    expect(verifyMpOauthState(raw, SECRET)).not.toBeNull()

    vi.setSystemTime(new Date('2026-10-11T12:10:01Z'))
    expect(verifyMpOauthState(raw, SECRET)).toBeNull()
  })

  it('sin secreto: sign lanza y verify devuelve null', () => {
    const prev = process.env.AUTH_SECRET
    const prevAlt = process.env.NEXTAUTH_SECRET
    delete process.env.AUTH_SECRET
    delete process.env.NEXTAUTH_SECRET
    try {
      expect(() => signMpOauthState({ tenantSlug: 'palmyra' })).toThrow()
      expect(verifyMpOauthState('x.y', undefined)).toBeNull()
      expect(verifyMpOauthState('x.y', '')).toBeNull()
    } finally {
      if (prev !== undefined) process.env.AUTH_SECRET = prev
      if (prevAlt !== undefined) process.env.NEXTAUTH_SECRET = prevAlt
    }
  })
})
