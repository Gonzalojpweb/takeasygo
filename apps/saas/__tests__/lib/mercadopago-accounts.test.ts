import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn() }))
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn() } }))

import { getMpAccountForLocation, findMpAccountById, getActiveMpAccount } from '@/lib/mercadopago'

function makeTenant(overrides: Record<string, any> = {}) {
  return {
    mpAccounts: [
      {
        _id: 'acc1',
        label: 'Cuenta Principal',
        isActive: true,
        accessToken: 'enc_token1',
        publicKey: 'enc_pk1',
        webhookSecret: 'enc_ws1',
        oauthAccessToken: 'enc_oauth1',
        oauthIsConnected: true,
        oauthExpiresAt: new Date('2099-01-01'),
      },
      {
        _id: 'acc2',
        label: 'Cuenta Secundaria',
        isActive: false,
        accessToken: 'enc_token2',
        publicKey: 'enc_pk2',
        webhookSecret: 'enc_ws2',
        oauthAccessToken: null,
        oauthIsConnected: false,
        oauthExpiresAt: null,
      },
    ],
    mercadopago: {
      isConfigured: false,
      accessToken: null,
      publicKey: null,
      webhookSecret: null,
    },
    mpOAuth: null,
    ...overrides,
  } as any
}

describe('getActiveMpAccount', () => {
  it('returns active account from mpAccounts[]', () => {
    const tenant = makeTenant()
    const result = getActiveMpAccount(tenant)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc1')
    expect(result!.label).toBe('Cuenta Principal')
  })

  it('returns null when mpAccounts exists but none is active', () => {
    const tenant = makeTenant({
      mpAccounts: [{ _id: 'acc1', isActive: false, accessToken: 'x' }],
    })
    expect(getActiveMpAccount(tenant)).toBeNull()
  })

  it('falls back to legacy mercadopago fields', () => {
    const tenant = makeTenant({
      mpAccounts: [],
      mercadopago: {
        isConfigured: true,
        accessToken: 'legacy_token',
        publicKey: 'legacy_pk',
        webhookSecret: 'legacy_ws',
      },
    })
    const result = getActiveMpAccount(tenant)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('legacy')
    expect(result!.accessToken).toBe('legacy_token')
  })

  it('returns null when nothing is configured', () => {
    const tenant = makeTenant({ mpAccounts: [] })
    expect(getActiveMpAccount(tenant)).toBeNull()
  })
})

describe('getMpAccountForLocation', () => {
  it('resolves explicit mpAccountId from location', () => {
    const tenant = makeTenant()
    const result = getMpAccountForLocation(tenant, 'acc2')
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc2')
    expect(result!.label).toBe('Cuenta Secundaria')
  })

  it('returns null when location mpAccountId does not exist (fail closed)', () => {
    const tenant = makeTenant()
    const result = getMpAccountForLocation(tenant, 'nonexistent')
    expect(result).toBeNull()
  })

  it('falls back to active account when locationMpAccountId is null', () => {
    const tenant = makeTenant()
    const result = getMpAccountForLocation(tenant, null)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc1')
  })

  it('falls back to active account when locationMpAccountId is undefined', () => {
    const tenant = makeTenant()
    const result = getMpAccountForLocation(tenant, undefined)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc1')
  })
})

describe('findMpAccountById', () => {
  it('finds account by id', () => {
    const tenant = makeTenant()
    const result = findMpAccountById(tenant, 'acc1')
    expect(result).not.toBeNull()
    expect(result!.label).toBe('Cuenta Principal')
  })

  it('returns null for nonexistent id', () => {
    const tenant = makeTenant()
    expect(findMpAccountById(tenant, 'nonexistent')).toBeNull()
  })

  it('returns null when mpAccounts is empty', () => {
    const tenant = makeTenant({ mpAccounts: [] })
    expect(findMpAccountById(tenant, 'acc1')).toBeNull()
  })
})
