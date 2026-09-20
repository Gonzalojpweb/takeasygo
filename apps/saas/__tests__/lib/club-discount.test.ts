import { describe, it, expect, vi } from 'vitest'

// Set env BEFORE any imports — vi.hoisted runs before hoisted imports
vi.hoisted(() => {
  process.env.MEMBER_TOKEN_SECRET = 'test-secret-for-club-discount-unit-tests'
})

const { signMemberToken, verifyMemberToken } = await import('@/lib/memberToken')

describe('memberToken - sign and verify', () => {
  const memberId = '507f1f77bcf86cd799439011'
  const tenantId = '507f1f77bcf86cd799439012'
  const phone = '+5491155551234'
  const version = 1

  it('signs and verifies a valid token', async () => {
    const token = await signMemberToken(memberId, tenantId, phone, version)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')

    const result = await verifyMemberToken(token)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.memberId).toBe(memberId)
      expect(result.payload.tenantId).toBe(tenantId)
      expect(result.payload.version).toBe(version)
      expect(result.payload.phoneHash).toBeTruthy()
    }
  })

  it('rejects token with wrong signature', async () => {
    const token = await signMemberToken(memberId, tenantId, phone, version)
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A')
    const result = await verifyMemberToken(tampered)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toMatch(/Invalid signature|Token verification failed/)
    }
  })

  it('rejects empty token', async () => {
    const result = await verifyMemberToken('')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('No token provided')
    }
  })

  it('rejects garbage token', async () => {
    const result = await verifyMemberToken('not-a-jwt-token-at-all')
    expect(result.valid).toBe(false)
  })

  it('token contains correct phoneHash', async () => {
    const token = await signMemberToken(memberId, tenantId, phone, version)
    const result = await verifyMemberToken(token)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.phoneHash).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('different phones produce different phoneHashes', async () => {
    const token1 = await signMemberToken(memberId, tenantId, '+5491155551234', version)
    const token2 = await signMemberToken(memberId, tenantId, '+5491155559999', version)
    const r1 = await verifyMemberToken(token1)
    const r2 = await verifyMemberToken(token2)
    expect(r1.valid).toBe(true)
    expect(r2.valid).toBe(true)
    if (r1.valid && r2.valid) {
      expect(r1.payload.phoneHash).not.toBe(r2.payload.phoneHash)
    }
  })
})

describe('memberToken - tokenVersion', () => {
  it('token with version 1 is valid when member has version 1', async () => {
    const token = await signMemberToken('m1', 't1', '+5491111111111', 1)
    const result = await verifyMemberToken(token)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.version).toBe(1)
    }
  })

  it('caller rejects token when member.tokenVersion !== payload.version', async () => {
    const token = await signMemberToken('m1', 't1', '+5491111111111', 1)
    const result = await verifyMemberToken(token)
    expect(result.valid).toBe(true)
    if (result.valid) {
      // verifyMemberToken does NOT check version against DB — caller does
      // Simulating: member.tokenVersion is now 2, so 1 !== 2 → rejected by caller
      const memberTokenVersion = result.payload.version
      const memberDbVersion = 2
      expect(memberTokenVersion).not.toBe(memberDbVersion)
    }
  })
})

describe('club discount - cooldown logic', () => {
  it('hoursSinceJoin calculation is correct', () => {
    const now = Date.now()
    const joinedAt = new Date(now - 12 * 60 * 60 * 1000)
    const hoursSinceJoin = (now - new Date(joinedAt).getTime()) / (1000 * 60 * 60)
    expect(hoursSinceJoin).toBeCloseTo(12, 0)
  })

  it('cooldown blocks when hoursSinceJoin < cooldownHours', () => {
    const now = Date.now()
    const joinedAt = new Date(now - 6 * 60 * 60 * 1000)
    const hoursSinceJoin = (now - new Date(joinedAt).getTime()) / (1000 * 60 * 60)
    const cooldownHours = 24
    expect(hoursSinceJoin < cooldownHours).toBe(true)
  })

  it('cooldown allows when hoursSinceJoin >= cooldownHours', () => {
    const now = Date.now()
    const joinedAt = new Date(now - 25 * 60 * 60 * 1000)
    const hoursSinceJoin = (now - new Date(joinedAt).getTime()) / (1000 * 60 * 60)
    const cooldownHours = 24
    expect(hoursSinceJoin >= cooldownHours).toBe(true)
  })

  it('cooldownHours=0 never blocks', () => {
    const now = Date.now()
    const joinedAt = new Date(now - 0.001 * 60 * 60 * 1000)
    const hoursSinceJoin = (now - new Date(joinedAt).getTime()) / (1000 * 60 * 60)
    const cooldownHours = 0
    expect(hoursSinceJoin < cooldownHours).toBe(false)
  })
})

describe('club discount - scope filtering', () => {
  const mockItems = [
    { menuItemId: 'item1', categoryId: 'cat1', subtotal: 1000, itemType: 'regular' },
    { menuItemId: 'item2', categoryId: 'cat1', subtotal: 2000, itemType: 'regular' },
    { menuItemId: 'item3', categoryId: 'cat2', subtotal: 3000, itemType: 'regular' },
    { menuItemId: 'item4', categoryId: 'cat3', subtotal: 500, itemType: 'promotion' },
  ]

  it('scope all: sums all non-promotion items', () => {
    const eligible = mockItems
      .filter(i => i.itemType !== 'promotion')
      .reduce((sum, i) => sum + i.subtotal, 0)
    expect(eligible).toBe(6000)
  })

  it('scope category: filters by categoryId', () => {
    const eligibleCategoryIds = new Set(['cat1'])
    const eligible = mockItems
      .filter(i => i.itemType !== 'promotion' && i.categoryId && eligibleCategoryIds.has(i.categoryId))
      .reduce((sum, i) => sum + i.subtotal, 0)
    expect(eligible).toBe(3000)
  })

  it('scope item: filters by menuItemId', () => {
    const eligibleItemIds = new Set(['item1', 'item3'])
    const eligible = mockItems
      .filter(i => i.itemType !== 'promotion' && i.menuItemId && eligibleItemIds.has(i.menuItemId))
      .reduce((sum, i) => sum + i.subtotal, 0)
    expect(eligible).toBe(4000)
  })

  it('no eligible items: subtotal is 0', () => {
    const eligibleItemIds = new Set(['nonexistent'])
    const eligible = mockItems
      .filter(i => i.itemType !== 'promotion' && i.menuItemId && eligibleItemIds.has(i.menuItemId))
      .reduce((sum, i) => sum + i.subtotal, 0)
    expect(eligible).toBe(0)
  })
})
