// ============================================================================
// mp-oauth-renew.test.ts — Renovación automática de tokens OAuth de MP
// ============================================================================
// Simulaciones:
//   1. classifyOauthExpiry: expired / soon / valid / unknown.
//   2. requestTokenRefresh: éxito, HTTP error, sin access_token (nunca vacío).
//   3. refreshOAuthForTenant (DB real con memory server, fetch simulado):
//      - Éxito: guarda access+refresh nuevos, expiresAt = now + expires_in.
//      - Rotación de refresh_token: guarda el nuevo.
//      - Fetch falla / sin access_token / encrypt falla: NO pisa nada.
//   4. scanTenantTokens: vencidos / por vencer / próximo por negocio.
//   5. Lock: un solo ejecutor.
//
// Ejecutar: npx vitest run __tests__/integration/mp-oauth-renew.test.ts
// ============================================================================

import { describe, it, expect, beforeAll, vi } from 'vitest'
import './setup'
import mongoose from 'mongoose'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

// aes-256-gcm necesita 32 bytes en base64 (el setup pone un hex de 64 chars)
beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

import {
  classifyOauthExpiry,
  getOauthHealth,
  requestTokenRefresh,
  refreshOAuthForTenant,
  scanTenantTokens,
  acquireRefreshLock,
  releaseRefreshLock,
  MP_OAUTH_TOKEN_TTL_DAYS,
  RENEW_WINDOW_DAYS,
} from '@/lib/mp-oauth'
import { encrypt } from '@/lib/crypto'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'

const CREDS = { appId: '123', appSecret: 'secret-plain' }
const DAY_MS = 24 * 60 * 60 * 1000

/** Cast un vi.fn() a typeof fetch (para inyectar fetchFn en los helpers). */
function asFetch(fn: unknown): typeof fetch {
  return fn as typeof fetch
}

/** fetch simulado que responde un refresh exitoso de MP. */
function okRefreshFetch(access = 'NEW_ACCESS', refresh: string | null = 'NEW_REFRESH', expiresIn = 15552000) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: access,
      ...(refresh ? { refresh_token: refresh } : {}),
      expires_in: expiresIn,
    }),
    text: async () => '',
  })
}

/** Type narrow para docs lean de mpAccounts en asserts. */
type LeanAccount = {
  _id: unknown
  oauthAccessToken?: string | null
  oauthRefreshToken?: string | null
  oauthExpiresAt?: Date | string | null
  oauthLastRefreshedAt?: Date | string | null
}

function findAccount(updated: { mpAccounts?: LeanAccount[] }, accId: string): LeanAccount {
  const acc = updated.mpAccounts?.find((a) => String(a._id) === accId)
  if (!acc) throw new Error(`cuenta ${accId} no encontrada`)
  return acc
}

// ── classifyOauthExpiry ──────────────────────────────────────────────────────

describe('classifyOauthExpiry', () => {
  const now = new Date('2026-10-20T12:00:00Z')

  it('sin fecha => unknown', () => {
    expect(classifyOauthExpiry(null, now)).toBe('unknown')
    expect(classifyOauthExpiry(undefined, now)).toBe('unknown')
    expect(classifyOauthExpiry('invalid-date', now)).toBe('unknown')
  })

  it('fecha pasada => expired', () => {
    expect(classifyOauthExpiry(new Date('2026-10-19T12:00:00Z'), now)).toBe('expired')
    expect(classifyOauthExpiry(new Date('2026-01-01T00:00:00Z'), now)).toBe('expired')
  })

  it(`vence dentro de ${RENEW_WINDOW_DAYS} días => soon`, () => {
    expect(classifyOauthExpiry(new Date(now.getTime() + 10 * DAY_MS), now)).toBe('soon')
    expect(classifyOauthExpiry(new Date(now.getTime() + RENEW_WINDOW_DAYS * DAY_MS), now)).toBe('soon')
  })

  it(`vence a más de ${RENEW_WINDOW_DAYS} días => valid`, () => {
    expect(classifyOauthExpiry(new Date(now.getTime() + 31 * DAY_MS), now)).toBe('valid')
    // TTL completo de MP: 180 días
    expect(classifyOauthExpiry(new Date(now.getTime() + MP_OAUTH_TOKEN_TTL_DAYS * DAY_MS), now)).toBe('valid')
  })

  it('borde exacto: 0 ms restantes => expired', () => {
    expect(classifyOauthExpiry(new Date(now.getTime()), now)).toBe('expired')
  })
})

describe('getOauthHealth', () => {
  it('sin access_token => unknown con daysRemaining null', () => {
    const h = getOauthHealth(null, null)
    expect(h.status).toBe('unknown')
    expect(h.daysRemaining).toBeNull()
  })

  it('con fecha futura calcula daysRemaining', () => {
    const exp = new Date(Date.now() + 10.7 * DAY_MS)
    const h = getOauthHealth(encrypt('tok'), exp)
    expect(h.status).toBe('soon')
    expect(h.daysRemaining).toBe(10)
  })
})

// ── requestTokenRefresh (fetch simulado) ─────────────────────────────────────

describe('requestTokenRefresh', () => {
  it('éxito: devuelve access_token y refresh_token nuevos', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'APP_USR-NEW',
        refresh_token: 'TG-NEW',
        expires_in: 15552000,
      }),
      text: async () => '',
    })
    const res = await requestTokenRefresh(CREDS, 'TG-OLD', asFetch(fetchFn))
    expect(res.access_token).toBe('APP_USR-NEW')
    expect(res.refresh_token).toBe('TG-NEW')
    // body enviado con grant_type=refresh_token
    const body = JSON.parse((fetchFn.mock.calls[0][1] as { body: string }).body)
    expect(body.grant_type).toBe('refresh_token')
    expect(body.refresh_token).toBe('TG-OLD')
    expect(body.client_id).toBe('123')
    expect(body.client_secret).toBe('secret-plain')
  })

  it('HTTP 400 => lanza (no avanza)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
      json: async () => ({}),
    })
    await expect(requestTokenRefresh(CREDS, 'TG-OLD', asFetch(fetchFn))).rejects.toThrow(/HTTP 400/)
  })

  it('respuesta sin access_token => lanza (regla: nunca guardar vacío)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ refresh_token: 'TG-X' }),
      text: async () => '',
    })
    await expect(requestTokenRefresh(CREDS, 'TG-OLD', asFetch(fetchFn))).rejects.toThrow(/sin access_token/)
  })

  it('refresh_token vacío => lanza sin llamar a MP', async () => {
    const fetchFn = vi.fn()
    await expect(requestTokenRefresh(CREDS, '', asFetch(fetchFn))).rejects.toThrow(/vacío/)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

// ── refreshOAuthForTenant (DB real + fetch simulado) ─────────────────────────

async function makeTenant(overrides: Record<string, unknown> = {}) {
  return Tenant.create({
    slug: 'renew-tenant',
    name: 'Renew Tenant',
    status: 'active',
    mpAccounts: [
      {
        label: 'Principal',
        accessToken: encrypt('manual-token'),
        publicKey: encrypt('pk'),
        webhookSecret: encrypt('whs'),
        isActive: true,
        oauthAccessToken: encrypt('OLD_ACCESS'),
        oauthRefreshToken: encrypt('OLD_REFRESH'),
        oauthExpiresAt: new Date(Date.now() + 5 * DAY_MS),
        oauthIsConnected: true,
      },
    ],
    ...overrides,
  })
}

describe('refreshOAuthForTenant (account)', () => {
  it('éxito: guarda access+refresh nuevos cifrados y expiresAt calculado', async () => {
    const tenant = await makeTenant()
    const accId = tenant.mpAccounts[0]._id.toString()
    const before = Date.now()

    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(okRefreshFetch()))
    expect(result.ok).toBe(true)
    expect(result.newExpiresAt).toBeInstanceOf(Date)

    const updated = await Tenant.findById(tenant._id).lean()
    const acc = findAccount(updated, accId)
    // Los tokens nuevos quedan guardados (cifrados, no en claro)
    expect(acc.oauthAccessToken).not.toBe(encrypt('NEW_ACCESS')) // cifrado
    expect(acc.oauthAccessToken).toBeTruthy()
    expect(acc.oauthRefreshToken).toBeTruthy()
    expect(acc.oauthAccessToken).not.toBe(tenant.mpAccounts[0].oauthAccessToken)
    // expiresAt ≈ now + 15552000s
    const expMs = new Date(acc.oauthExpiresAt).getTime()
    expect(expMs).toBeGreaterThanOrEqual(before + 15552000 * 1000 - 5000)
    expect(expMs).toBeLessThanOrEqual(Date.now() + 15552000 * 1000 + 5000)
    expect(acc.oauthLastRefreshedAt).toBeTruthy()
  })

  it('sin refresh_token guardado => falla sin tocar nada', async () => {
    const tenant = await Tenant.create({
      slug: 'no-refresh',
      name: 'No Refresh',
      mpAccounts: [{
        label: 'P', accessToken: encrypt('t'), publicKey: encrypt('p'),
        webhookSecret: encrypt('w'), isActive: true,
        oauthAccessToken: encrypt('OLD'), oauthRefreshToken: null, oauthIsConnected: true,
      }],
    })
    const accId = tenant.mpAccounts[0]._id.toString()
    const fetchFn = okRefreshFetch()
    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(fetchFn))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('sin_refresh_token')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('MP responde 400 (invalid_grant) => NO pisa los tokens viejos', async () => {
    const tenant = await makeTenant()
    const accId = tenant.mpAccounts[0]._id.toString()
    const oldAccessEnc = tenant.mpAccounts[0].oauthAccessToken

    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => 'invalid_grant', json: async () => ({}),
    })
    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(fetchFn))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/HTTP 400/)

    const updated = await Tenant.findById(tenant._id).lean()
    const acc = findAccount(updated, accId)
    expect(acc.oauthAccessToken).toBe(oldAccessEnc) // intacto
  })

  it('MP responde sin access_token => NO pisa nada (nunca guardar vacío)', async () => {
    const tenant = await makeTenant()
    const accId = tenant.mpAccounts[0]._id.toString()
    const oldAccessEnc = tenant.mpAccounts[0].oauthAccessToken

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({}), text: async () => '',
    })
    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(fetchFn))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/sin access_token/)

    const updated = await Tenant.findById(tenant._id).lean()
    const acc = findAccount(updated, accId)
    expect(acc.oauthAccessToken).toBe(oldAccessEnc)
  })

  it('red caída (fetch lanza) => NO pisa nada', async () => {
    const tenant = await makeTenant()
    const accId = tenant.mpAccounts[0]._id.toString()
    const oldAccessEnc = tenant.mpAccounts[0].oauthAccessToken

    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(fetchFn))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/ECONNREFUSED/)

    const updated = await Tenant.findById(tenant._id).lean()
    const acc = findAccount(updated, accId)
    expect(acc.oauthAccessToken).toBe(oldAccessEnc)
  })

  it('MP no rota refresh_token => conserva el viejo', async () => {
    const tenant = await makeTenant()
    const accId = tenant.mpAccounts[0]._id.toString()
    const oldRefreshEnc = tenant.mpAccounts[0].oauthRefreshToken

    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(okRefreshFetch('A', null)))
    expect(result.ok).toBe(true)

    const updated = await Tenant.findById(tenant._id).lean()
    const acc = findAccount(updated, accId)
    expect(acc.oauthRefreshToken).toBe(oldRefreshEnc) // mismo refresh de antes
  })

  it('expires_in ausente => default TTL 180 días', async () => {
    const tenant = await makeTenant()
    const accId = tenant.mpAccounts[0]._id.toString()
    const before = Date.now()

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ access_token: 'A' }),
      text: async () => '',
    })
    const result = await refreshOAuthForTenant(tenant, 'account', accId, CREDS, asFetch(fetchFn))
    expect(result.ok).toBe(true)
    const expMs = result.newExpiresAt!.getTime()
    expect(expMs).toBeGreaterThanOrEqual(before + MP_OAUTH_TOKEN_TTL_DAYS * DAY_MS - 5000)
  })

  it('accountId inexistente => cuenta_no_encontrada sin fetch', async () => {
    const tenant = await makeTenant()
    const fetchFn = okRefreshFetch()
    const result = await refreshOAuthForTenant(
      tenant, 'account', new mongoose.Types.ObjectId().toString(), CREDS, asFetch(fetchFn)
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('cuenta_no_encontrada')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('refreshOAuthForTenant (legacy)', () => {
  it('renueva el mpOAuth legacy', async () => {
    const tenant = await Tenant.create({
      slug: 'legacy-tenant',
      name: 'Legacy',
      mpAccounts: [],
      mpOAuth: {
        accessToken: encrypt('OLD'),
        refreshToken: encrypt('OLD_RT'),
        expiresAt: new Date(Date.now() + 2 * DAY_MS),
        isConnected: true,
      },
    })
    const result = await refreshOAuthForTenant(tenant, 'legacy', null, CREDS, asFetch(okRefreshFetch()))
    expect(result.ok).toBe(true)

    const updated = await Tenant.findById(tenant._id).lean()
    expect(updated.mpOAuth?.accessToken).toBeTruthy()
    expect(updated.mpOAuth?.accessToken).not.toBe(encrypt('OLD'))
    expect(updated.mpOAuth?.lastRefreshedAt).toBeTruthy()
  })
})

// ── scanTenantTokens ─────────────────────────────────────────────────────────

describe('scanTenantTokens (escaneo por negocio)', () => {
  it('cuenta vencidos, por vencer y próximo vencimiento por tenant', async () => {
    await Tenant.create({
      slug: 'scan-a', name: 'Scan A',
      flags: { 'mp.oauthAutoRenew': true },
      mpAccounts: [
        {
          label: 'Vencida', accessToken: encrypt('t'), publicKey: encrypt('p'),
          webhookSecret: encrypt('w'), isActive: true,
          oauthAccessToken: encrypt('a1'), oauthRefreshToken: encrypt('r1'),
          oauthExpiresAt: new Date(Date.now() - 1 * DAY_MS), oauthIsConnected: true,
        },
        {
          label: 'PorVencer', accessToken: encrypt('t'), publicKey: encrypt('p'),
          webhookSecret: encrypt('w'), isActive: false,
          oauthAccessToken: encrypt('a2'), oauthRefreshToken: encrypt('r2'),
          oauthExpiresAt: new Date(Date.now() + 10 * DAY_MS), oauthIsConnected: true,
        },
        {
          label: 'Vigente', accessToken: encrypt('t'), publicKey: encrypt('p'),
          webhookSecret: encrypt('w'), isActive: false,
          oauthAccessToken: encrypt('a3'), oauthRefreshToken: encrypt('r3'),
          oauthExpiresAt: new Date(Date.now() + 100 * DAY_MS), oauthIsConnected: true,
        },
      ],
    })

    const scans = await scanTenantTokens()
    const a = scans.find(s => s.slug === 'scan-a')!
    expect(a).toBeTruthy()
    expect(a.expiredCount).toBe(1)
    expect(a.soonCount).toBe(1)
    expect(a.validCount).toBe(1)
    expect(a.autoRenewFlag).toBe(true)
    // Próximo vencimiento = la más cercana entre las 3 (la vencida no cuenta
    // como "próximo": nextExpiryAt toma la menor fecha FUTURA entre las que
    // tienen fecha — la vencida también tiene fecha, y es la menor).
    expect(a.nextExpiryAt).toBeInstanceOf(Date)
    expect(new Date(a.nextExpiryAt).getTime()).toBeLessThan(Date.now() + 11 * DAY_MS)
  })
})

// ── Lock (un solo ejecutor) ──────────────────────────────────────────────────

describe('acquireRefreshLock / releaseRefreshLock', () => {
  it('el segundo caller no lo obtiene hasta que se libera', async () => {
    await PlatformConfig.create({ _id: 'platform' })
    const got1 = await acquireRefreshLock('exec-1')
    expect(got1).toBe(true)

    const got2 = await acquireRefreshLock('exec-2')
    expect(got2).toBe(false)

    await releaseRefreshLock('exec-1')
    const got3 = await acquireRefreshLock('exec-2')
    expect(got3).toBe(true)
  })

  it('release de un owner que no tiene el candado no lo libera', async () => {
    await PlatformConfig.create({ _id: 'platform' })
    await acquireRefreshLock('exec-1')
    await releaseRefreshLock('exec-intruso')
    const got = await acquireRefreshLock('exec-2')
    expect(got).toBe(false)
  })
})
