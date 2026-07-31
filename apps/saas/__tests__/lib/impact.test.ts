import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLean = vi.fn()
const mockSelect = vi.fn(() => ({ lean: mockLean }))
const mockFindOne = vi.fn(() => ({ select: mockSelect }))
const mockUpdateOne = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/models/LoyaltyMember', () => ({
  default: {
    findOne: (q: any) => mockFindOne(q),
    updateOne: (q: any, u: any) => mockUpdateOne(q, u),
  },
}))

vi.mock('@/models/ImpactEvent', () => ({
  default: {
    create: (doc: any) => mockCreate(doc),
  },
}))

vi.mock('@/models/Location', () => ({
  default: {
    findById: () => ({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    }),
  },
}))

vi.mock('@/lib/geocode', () => ({
  haversineDistance: vi.fn(() => 0.5),
}))

// ── Import after mocks ───────────────────────────────────────────────────────

import { registerImpactEvent } from '@/lib/impact'
import mongoose from 'mongoose'

// ── Helpers ──────────────────────────────────────────────────────────────────

function oid() {
  return new mongoose.Types.ObjectId()
}

const TENANT_ID = oid()
const LOCATION_ID = oid()
const ORDER_ID = oid()
const PHONE_HASH = 'abc123hash'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('registerImpactEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('primera orden en un comercio → discoveredBusinesses = 1, badge primer_impacto', async () => {
    // Mock: calculateImpact reads empty discoveredBusinessesList
    mockLean
      .mockResolvedValueOnce({
        userImpact: { discoveredBusinessesList: [] },
      })
      // After update, reads full state for badge check
      .mockResolvedValueOnce({
        userImpact: {
          commercesSupported: 1,
          nearbyPurchases: 0,
          discoveredBusinesses: 1,
          discoveredBusinessesList: [LOCATION_ID],
          discoveredNeighborhoods: [],
          badges: [],
        },
        cache: { totalOrders: 1 },
      })

    const result = await registerImpactEvent({
      userId: null,
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      orderId: ORDER_ID,
      phoneHash: PHONE_HASH,
      orderTotal: 5000,
      businessName: 'Los Muchachos',
    })

    // Should create discovery event
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'discovery',
        impactValue: 25,
      })
    )

    // Should increment both commercesSupported AND discoveredBusinesses
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, phoneHash: PHONE_HASH },
      expect.objectContaining({
        $inc: expect.objectContaining({
          'userImpact.commercesSupported': 1,
          'userImpact.discoveredBusinesses': 1,
        }),
      })
    )

    expect(result.newBadges).toContain('primer_impacto')
    expect(result.isFirstVisit).toBe(true)
  })

  it('segunda orden en mismo comercio → discoveredBusinesses sin cambio, badge no duplicado', async () => {
    // Mock: user already discovered this location
    mockLean
      .mockResolvedValueOnce({
        userImpact: { discoveredBusinessesList: [LOCATION_ID] },
      })
      .mockResolvedValueOnce({
        userImpact: {
          commercesSupported: 2,
          nearbyPurchases: 0,
          discoveredBusinesses: 1,
          discoveredBusinessesList: [LOCATION_ID],
          discoveredNeighborhoods: [],
          badges: [{ id: 'primer_impacto', unlockedAt: new Date() }],
        },
        cache: { totalOrders: 2 },
      })

    const result = await registerImpactEvent({
      userId: null,
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      orderId: ORDER_ID,
      phoneHash: PHONE_HASH,
      orderTotal: 5000,
      businessName: 'Los Muchachos',
    })

    // Should create purchase event, not discovery
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'purchase',
        impactValue: 10,
      })
    )

    // Should NOT increment discoveredBusinesses
    const updateCall = mockUpdateOne.mock.calls[0][1]
    expect(updateCall.$inc).not.toHaveProperty('userImpact.discoveredBusinesses')

    expect(result.newBadges).not.toContain('primer_impacto')
    expect(result.isFirstVisit).toBe(false)
  })
})
