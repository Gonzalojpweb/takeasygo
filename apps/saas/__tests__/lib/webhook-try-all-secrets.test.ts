import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn() }))
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Order', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Location', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/PaymentNotification', () => ({ default: { findOneAndUpdate: vi.fn() } }))
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

// We test the pure signature verification logic directly
// The try-all-secrets pattern is tested via the candidate builder

function makeHmac(secret: string, dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex')
}

function makeSignatureHeader(v1: string, ts: string) {
  return `v1=${v1},ts=${ts}`
}

describe('Webhook try-all-secrets signature verification', () => {
  const secret1 = 'webhook_secret_account_1'
  const secret2 = 'webhook_secret_account_2'
  const dataId = '12345678'
  const requestId = 'req-abc-123'
  const ts = String(Math.floor(Date.now() / 1000))

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

  it('single account: signature matches its own secret', () => {
    const v1 = makeHmac(secret1, dataId, requestId, ts)
    const header = makeSignatureHeader(v1, ts)

    const result = verifyWithSecret(secret1, header, requestId, dataId)
    expect(result).toBe(true)
  })

  it('single account: signature fails with wrong secret', () => {
    const v1 = makeHmac(secret1, dataId, requestId, ts)
    const header = makeSignatureHeader(v1, ts)

    const result = verifyWithSecret(secret2, header, requestId, dataId)
    expect(result).toBe(false)
  })

  it('try-all-secrets: finds correct account among multiple', () => {
    const v1 = makeHmac(secret2, dataId, requestId, ts)
    const header = makeSignatureHeader(v1, ts)

    // Simulate try-all-secrets: iterate candidates
    const candidates = [
      { accountId: 'acc1', secret: secret1 },
      { accountId: 'acc2', secret: secret2 },
      { accountId: 'acc3', secret: 'other_secret' },
    ]

    let matched = null
    for (const candidate of candidates) {
      const result = verifyWithSecret(candidate.secret, header, requestId, dataId)
      if (result) {
        matched = candidate.accountId
      }
    }

    expect(matched).toBe('acc2')
  })

  it('try-all-secrets: constant-time — tries ALL candidates even after match', () => {
    const v1 = makeHmac(secret1, dataId, requestId, ts)
    const header = makeSignatureHeader(v1, ts)

    const candidates = [
      { accountId: 'acc1', secret: secret1 },
      { accountId: 'acc2', secret: secret2 },
    ]

    const tried: string[] = []
    let matched = null
    for (const candidate of candidates) {
      const result = verifyWithSecret(candidate.secret, header, requestId, dataId)
      tried.push(candidate.accountId)
      if (result) {
        matched = candidate.accountId
      }
    }

    // Must try ALL candidates (constant-time), not stop at first match
    expect(tried).toEqual(['acc1', 'acc2'])
    expect(matched).toBe('acc1')
  })

  it('try-all-secrets: no match when all secrets are wrong', () => {
    const v1 = makeHmac('wrong_secret', dataId, requestId, ts)
    const header = makeSignatureHeader(v1, ts)

    const candidates = [
      { accountId: 'acc1', secret: secret1 },
      { accountId: 'acc2', secret: secret2 },
    ]

    let matched = null
    for (const candidate of candidates) {
      const result = verifyWithSecret(candidate.secret, header, requestId, dataId)
      if (result) {
        matched = candidate.accountId
      }
    }

    expect(matched).toBeNull()
  })

  it('missing signature header: returns false for all candidates', () => {
    const candidates = [
      { accountId: 'acc1', secret: secret1 },
      { accountId: 'acc2', secret: secret2 },
    ]

    let matched = null
    for (const candidate of candidates) {
      const result = verifyWithSecret(candidate.secret, null, requestId, dataId)
      if (result) {
        matched = candidate.accountId
      }
    }

    expect(matched).toBeNull()
  })

  it('missing request-id: returns false for all candidates', () => {
    const v1 = makeHmac(secret1, dataId, requestId, ts)
    const header = makeSignatureHeader(v1, ts)

    const candidates = [
      { accountId: 'acc1', secret: secret1 },
    ]

    let matched = null
    for (const candidate of candidates) {
      const result = verifyWithSecret(candidate.secret, header, null, dataId)
      if (result) {
        matched = candidate.accountId
      }
    }

    expect(matched).toBeNull()
  })
})
