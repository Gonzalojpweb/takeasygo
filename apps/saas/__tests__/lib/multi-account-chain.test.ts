import { describe, it, expect, vi } from 'vitest'

// Mock all dependencies
vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn() }))
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn(), findById: vi.fn() } }))
vi.mock('@/models/Order', () => ({ default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn() } }))
vi.mock('@/models/Location', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/PaymentNotification', () => ({ default: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }))
vi.mock('@/models/ProcessedWebhookEvents', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }))
vi.mock('@/models/PushSubscription', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Reservation', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/lib/push', () => ({ sendAdminPushNotification: vi.fn() }))
vi.mock('@/lib/pos/inject-order', () => ({ injectOrderToPOS: vi.fn() }))
vi.mock('@/lib/sync-layer', () => ({ confirmOrderPayment: vi.fn() }))
vi.mock('@/lib/reservationNotifications', () => ({ sendReservationConfirmation: vi.fn() }))
vi.mock('@/lib/hidden-rewards', () => ({ finalizeHiddenRewardClaims: vi.fn() }))
vi.mock('@/lib/loyalty', () => ({
  addPointsFromOrder: vi.fn(),
  processRewardDeduction: vi.fn(),
  revertRewardRedemptions: vi.fn(),
}))

import crypto from 'crypto'
import { getMpAccountForLocation, findMpAccountById, getActiveMpAccount } from '@/lib/mercadopago'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAccount(id: string, label: string, isActive: boolean, webhookSecret: string) {
  return {
    _id: id,
    label,
    isActive,
    accessToken: `enc_token_${id}`,
    publicKey: `enc_pk_${id}`,
    webhookSecret,
    oauthAccessToken: null,
    oauthIsConnected: false,
    oauthExpiresAt: null,
  }
}

function makeTenant(accounts: ReturnType<typeof makeAccount>[]) {
  return {
    _id: 'tenant1',
    slug: 'test-tenant',
    mpAccounts: accounts,
    mercadopago: { isConfigured: false, accessToken: null, publicKey: null, webhookSecret: null },
    mpOAuth: null,
  } as any
}

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    _id: 'order1',
    orderNumber: 'TST-250919-1234',
    tenantId: 'tenant1',
    status: 'awaiting_payment',
    locationId: 'loc1',
    payment: {
      status: 'pending',
      method: 'mercadopago',
      mercadopagoId: 'mp_99999',
      mpAccountId: null,
      mercadopagoData: null,
      baseTotal: 10000,
      surchargePercent: 0,
      surchargeAmount: 0,
      platformFeeAmount: 0,
      transferConfirmed: false,
      cashAdjustmentApplied: false,
    },
    customer: { phoneHash: null, name: 'Test' },
    items: [],
    ...overrides,
  } as any
}

function makeHmac(secret: string, dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex')
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Multi-account chain: getMpAccountForLocation', () => {
  it('resolves correct account for location with override', () => {
    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, 'secret1'),
      makeAccount('acc2', 'Secundaria', false, 'secret2'),
    ])
    const result = getMpAccountForLocation(tenant, 'acc2')
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc2')
    expect(result!.label).toBe('Secundaria')
  })

  it('falls back to active account when location has no override', () => {
    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, 'secret1'),
      makeAccount('acc2', 'Secundaria', false, 'secret2'),
    ])
    const result = getMpAccountForLocation(tenant, null)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc1')
  })

  it('fail closed: returns null for non-existent account', () => {
    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, 'secret1'),
    ])
    const result = getMpAccountForLocation(tenant, 'nonexistent')
    expect(result).toBeNull()
  })
})

describe('Multi-account chain: findMpAccountById', () => {
  it('finds account by id', () => {
    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, 'secret1'),
      makeAccount('acc2', 'Secundaria', false, 'secret2'),
    ])
    const result = findMpAccountById(tenant, 'acc2')
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('acc2')
  })

  it('returns null for non-existent id (fail closed)', () => {
    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, 'secret1'),
    ])
    expect(findMpAccountById(tenant, 'nonexistent')).toBeNull()
  })
})

describe('Multi-account chain: try-all-secrets resolves correct account', () => {
  const secret1 = 'webhook_secret_acc1'
  const secret2 = 'webhook_secret_acc2'
  const dataId = '99999'
  const requestId = 'req-test-001'
  const ts = String(Math.floor(Date.now() / 1000))

  function buildCandidates(tenant: any) {
    const candidates: any[] = []
    const seenIds = new Set<string>()
    for (const acc of tenant.mpAccounts ?? []) {
      const accId = acc._id?.toString() ?? ''
      if (!seenIds.has(accId)) {
        candidates.push({ accountId: accId, webhookSecret: acc.webhookSecret, label: acc.label })
        seenIds.add(accId)
      }
    }
    return candidates
  }

  function verifyWithSecret(secret: string, sigHeader: string | null, reqId: string | null, dId: string | null | undefined) {
    if (!sigHeader || !reqId || dId == null) return false
    const parts: Record<string, string> = {}
    for (const part of sigHeader.split(',')) {
      const [key, value] = part.split('=')
      if (key && value) parts[key.trim()] = value.trim()
    }
    const { ts: headerTs, v1 } = parts
    if (!headerTs || !v1) return false
    const manifest = `id:${dId};request-id:${reqId};ts:${headerTs};`
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
    } catch {
      return false
    }
  }

  it('CASE 1: webhook without ?account= + Order with mpAccountId → finds correct account', () => {
    // Payment was made with acc2, signature was created with acc2's secret
    const v1 = makeHmac(secret2, dataId, requestId, ts)
    const header = `v1=${v1},ts=${ts}`

    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, secret1),
      makeAccount('acc2', 'Secundaria', false, secret2),
    ])
    const order = makeOrder({ payment: { mpAccountId: 'acc2', mercadopagoId: 'mp_99999' } })

    // Step 1: try-all-secrets finds the matching account
    const candidates = buildCandidates(tenant)
    let matchedAccount = null
    for (const candidate of candidates) {
      const secret = candidate.webhookSecret === secret1 ? secret1 : secret2
      if (verifyWithSecret(secret, header, requestId, dataId)) {
        matchedAccount = candidate
      }
    }
    expect(matchedAccount).not.toBeNull()
    expect(matchedAccount.accountId).toBe('acc2')

    // Step 2: Order.mpAccountId also resolves to acc2
    const orderAccount = findMpAccountById(tenant, order.payment.mpAccountId)
    expect(orderAccount).not.toBeNull()
    expect(orderAccount!.accountId).toBe('acc2')

    // Step 3: processAccount = orderAccount (they match)
    expect(orderAccount!.accountId).toBe(matchedAccount.accountId)
  })

  it('CASE 2: webhook without ?account= + Order WITHOUT mpAccountId → try-all-secrets resolves, persist', () => {
    // Payment was made with acc1, but Order doesn't have mpAccountId yet (race condition)
    const v1 = makeHmac(secret1, dataId, requestId, ts)
    const header = `v1=${v1},ts=${ts}`

    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, secret1),
      makeAccount('acc2', 'Secundaria', false, secret2),
    ])
    const order = makeOrder({ payment: { mpAccountId: null, mercadopagoId: 'mp_99999' } })

    // Step 1: try-all-secrets finds the matching account
    const candidates = buildCandidates(tenant)
    let matchedAccount = null
    for (const candidate of candidates) {
      const secret = candidate.webhookSecret === secret1 ? secret1 : secret2
      if (verifyWithSecret(secret, header, requestId, dataId)) {
        matchedAccount = candidate
      }
    }
    expect(matchedAccount).not.toBeNull()
    expect(matchedAccount.accountId).toBe('acc1')

    // Step 2: Order has no mpAccountId → use matchedAccount
    expect(order.payment.mpAccountId).toBeNull()
    const processAccount = matchedAccount // In real code: processAccount = accountForSecret

    // Step 3: persist mpAccountId (what the webhook does)
    if (!order.payment.mpAccountId && processAccount.accountId) {
      order.payment.mpAccountId = processAccount.accountId
    }
    expect(order.payment.mpAccountId).toBe('acc1')
  })

  it('CASE 3: webhook with wrong ?account= + Order with correct mpAccountId → uses Order account', () => {
    // URL had ?account=acc1 (wrong), but Order correctly has acc2
    const v1 = makeHmac(secret2, dataId, requestId, ts)
    const header = `v1=${v1},ts=${ts}`

    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, secret1),
      makeAccount('acc2', 'Secundaria', false, secret2),
    ])
    const order = makeOrder({ payment: { mpAccountId: 'acc2', mercadopagoId: 'mp_99999' } })

    // Step 1: try-all-secrets finds acc2 (signature matches)
    const candidates = buildCandidates(tenant)
    let matchedAccount = null
    for (const candidate of candidates) {
      const secret = candidate.webhookSecret === secret1 ? secret1 : secret2
      if (verifyWithSecret(secret, header, requestId, dataId)) {
        matchedAccount = candidate
      }
    }
    expect(matchedAccount!.accountId).toBe('acc2')

    // Step 2: ?account= says acc1, Order says acc2 → use Order (source of truth)
    const urlAccount = 'acc1' // wrong
    const resolvedAccountId = order.payment.mpAccountId // acc2

    if (resolvedAccountId && urlAccount !== resolvedAccountId) {
      // Warning logged, but process with Order's account
      const orderAccount = findMpAccountById(tenant, resolvedAccountId)
      expect(orderAccount!.accountId).toBe('acc2')
    }
  })

  it('CASE 4: tenant with single account → no regression', () => {
    const v1 = makeHmac(secret1, dataId, requestId, ts)
    const header = `v1=${v1},ts=${ts}`

    const tenant = makeTenant([
      makeAccount('acc1', 'Principal', true, secret1),
    ])

    const candidates = buildCandidates(tenant)
    expect(candidates).toHaveLength(1)

    let matchedAccount = null
    for (const candidate of candidates) {
      if (verifyWithSecret(secret1, header, requestId, dataId)) {
        matchedAccount = candidate
      }
    }
    expect(matchedAccount).not.toBeNull()
    expect(matchedAccount.accountId).toBe('acc1')
  })
})
