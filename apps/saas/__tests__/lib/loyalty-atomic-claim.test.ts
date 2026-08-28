import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/models/Order', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}))

vi.mock('@/models/LoyaltyMember', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock('@/models/LocationLoyaltyConfig', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

vi.mock('@/lib/walletService', () => ({
  syncWalletPoints: vi.fn().mockResolvedValue({}),
}))

import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import LocationLoyaltyConfig from '@/models/LocationLoyaltyConfig'
import { addPointsFromOrder } from '@/lib/loyalty'

function mockQuery(result: any) {
  const q: any = {
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  }
  return q
}

describe('addPointsFromOrder - atomic loyaltyPointsCredited claim', () => {
  const mockTenant = {
    _id: 'tenant-123',
    loyalty: { enabled: true, perLocation: false },
    pointsConfig: {
      enabled: true,
      pointsPerCurrency: 0.1,
      pointsPercentage: 10,
      pointsPerOrder: 0,
      minOrderForPoints: 0,
    },
  }

  // Phone-based order — triggers Path 2 (atomic claim before points calc)
  const phoneOrder = {
    _id: 'order-phone-1',
    tenantId: 'tenant-123',
    total: 10000,
    customer: {
      phoneHash: 'hash-abc',
      phone: '+5491112345678',
      email: 'test@example.com',
    },
    items: [{ subtotal: 10000, itemType: 'sale' }],
    loyaltyPointsCredited: false,
  }

  const mockMember = {
    _id: 'member-789',
    tenantId: 'tenant-123',
    phoneHash: 'hash-abc',
    email: 'test@example.com',
    status: 'active',
    loyalty: { points: 500, tier: 'none' },
    cache: { totalOrders: 10, totalSpent: 50000 },
    sosConfig: { hasPendingSos: false, sosUsed: 0 },
    wallet: {},
  }

  const updatedMember = {
    ...mockMember,
    loyalty: { points: 1500, tier: 'none' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(LocationLoyaltyConfig.findOne).mockReturnValue(mockQuery(null) as any)
    vi.mocked(LoyaltyMember.findOne).mockReturnValue(mockQuery(mockMember) as any)
    vi.mocked(LoyaltyMember.findOneAndUpdate).mockResolvedValue(updatedMember as any)
  })

  it('should credit points when atomic claim succeeds', async () => {
    vi.mocked(Order.findOneAndUpdate).mockResolvedValue({ _id: 'order-phone-1' } as any)

    const result = await addPointsFromOrder(phoneOrder as any, mockTenant)

    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'order-phone-1', loyaltyPointsCredited: { $ne: true } },
      { $set: { loyaltyPointsCredited: true } },
      { session: undefined, returnDocument: 'after' }
    )
    expect(LoyaltyMember.findOneAndUpdate).toHaveBeenCalled()
    expect(result).not.toBeNull()
  })

  it('should NOT credit points when atomic claim fails (another process already claimed)', async () => {
    vi.mocked(Order.findOneAndUpdate).mockResolvedValue(null)

    const result = await addPointsFromOrder(phoneOrder as any, mockTenant)

    expect(Order.findOneAndUpdate).toHaveBeenCalled()
    expect(LoyaltyMember.findOneAndUpdate).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('should skip entirely when order.loyaltyPointsCredited is already true (in-memory fast path)', async () => {
    const order = { ...phoneOrder, loyaltyPointsCredited: true }

    const result = await addPointsFromOrder(order as any, mockTenant)

    expect(Order.findOneAndUpdate).not.toHaveBeenCalled()
    expect(LoyaltyMember.findOneAndUpdate).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('should NOT call Order.updateOne separately — atomic claim handles the flag', async () => {
    vi.mocked(Order.findOneAndUpdate).mockResolvedValue({ _id: 'order-phone-1' } as any)

    await addPointsFromOrder(phoneOrder as any, mockTenant)

    expect(Order.updateOne).not.toHaveBeenCalled()
  })

  it('atomic claim uses findOneAndUpdate with $ne:true — MongoDB-level idempotency', async () => {
    vi.mocked(Order.findOneAndUpdate).mockResolvedValue({ _id: 'order-phone-1' } as any)

    await addPointsFromOrder(phoneOrder as any, mockTenant)

    const [query, update, options] = vi.mocked(Order.findOneAndUpdate).mock.calls[0]
    expect(query).toEqual({
      _id: 'order-phone-1',
      loyaltyPointsCredited: { $ne: true },
    })
    expect(update).toEqual({
      $set: { loyaltyPointsCredited: true },
    })
    expect(options).toHaveProperty('returnDocument', 'after')
  })

  it('simulates race condition: two concurrent calls — only one wins', async () => {
    let claimCount = 0
    vi.mocked(Order.findOneAndUpdate).mockImplementation(async () => {
      claimCount++
      if (claimCount === 1) return { _id: 'order-phone-1' } as any
      return null
    })

    const [result1, result2] = await Promise.all([
      addPointsFromOrder({ ...phoneOrder } as any, mockTenant),
      addPointsFromOrder({ ...phoneOrder } as any, mockTenant),
    ])

    const wins = [result1, result2].filter(r => r !== null)
    expect(wins).toHaveLength(1)
    expect(Order.findOneAndUpdate).toHaveBeenCalledTimes(2)
  })
})
