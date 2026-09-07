import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/models/Order', () => ({ default: { aggregate: vi.fn() } }))
vi.mock('@/models/Menu', () => ({ default: { findOne: vi.fn() } }))

import Order from '@/models/Order'
import Menu from '@/models/Menu'
import { getBestSellers } from '@/lib/tia/bestSellers'

const TENANT_ID = '507f1f77bcf86cd799439011'
const LOCATION_ID = '507f1f77bcf86cd799439012'

const mockMenu = {
  categories: [
    {
      items: [
        { _id: 'item1', name: 'Chaufan Carne', price: 150000, takeawayPrice: 140000, imageUrl: 'img1.jpg' },
        { _id: 'item2', name: 'Rabas', price: 180000, imageUrl: 'img2.jpg' },
        { _id: 'item3', name: 'Dumplings', price: 120000, takeawayPrice: 110000, imageUrl: 'img3.jpg' },
      ],
    },
  ],
}

describe('getBestSellers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty when fewer products than threshold', async () => {
    ;(Order.aggregate as any).mockResolvedValue([
      { name: 'Chaufan Carne', count: 10, revenue: 1500000 },
    ])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => mockMenu })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')
    expect(result).toEqual([])
  })

  it('filters by orderMode in aggregation', async () => {
    ;(Order.aggregate as any).mockResolvedValue([])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => mockMenu })

    await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')

    const matchStage = (Order.aggregate as any).mock.calls[0][0][0].$match
    expect(matchStage.orderMode).toBe('takeaway')
  })

  it('filters by locationId in aggregation', async () => {
    ;(Order.aggregate as any).mockResolvedValue([])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => mockMenu })

    await getBestSellers(TENANT_ID, LOCATION_ID, 'dine-in')

    const matchStage = (Order.aggregate as any).mock.calls[0][0][0].$match
    expect(matchStage.locationId.toString()).toBe(LOCATION_ID)
  })

  it('returns max 6 items', async () => {
    const topProducts = Array.from({ length: 10 }, (_, i) => ({
      name: `Item ${i}`,
      count: 100 - i,
      revenue: 10000 - i,
    }))
    ;(Order.aggregate as any).mockResolvedValue(topProducts)
    ;(Menu.findOne as any).mockReturnValue({ lean: () => mockMenu })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')
    expect(result.length).toBeLessThanOrEqual(6)
  })

  it('returns takeawayPrice when mode is takeaway', async () => {
    ;(Order.aggregate as any).mockResolvedValue([
      { name: 'Chaufan Carne', count: 10, revenue: 1500000 },
      { name: 'Rabas', count: 8, revenue: 1440000 },
      { name: 'Dumplings', count: 6, revenue: 720000 },
    ])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => mockMenu })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')
    const chaufan = result.find(r => r.name === 'Chaufan Carne')
    expect(chaufan?.takeawayPrice).toBe(140000)
    expect(chaufan?.price).toBe(150000)
  })

  it('returns businessPrice when mode is business', async () => {
    const menuWithBusiness = {
      categories: [{
        items: [
          { _id: 'item1', name: 'Chaufan', price: 150000, businessPrice: 130000 },
          { _id: 'item2', name: 'Rabas', price: 180000, businessPrice: 160000 },
          { _id: 'item3', name: 'Dumplings', price: 120000, businessPrice: 100000 },
        ],
      }],
    }
    ;(Order.aggregate as any).mockResolvedValue([
      { name: 'Chaufan', count: 10, revenue: 1500000 },
      { name: 'Rabas', count: 8, revenue: 1440000 },
      { name: 'Dumplings', count: 6, revenue: 720000 },
    ])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => menuWithBusiness })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'business')
    const chaufan = result.find(r => r.name === 'Chaufan')
    expect(chaufan?.businessPrice).toBe(130000)
  })

  it('returns empty when menu not found', async () => {
    ;(Order.aggregate as any).mockResolvedValue([
      { name: 'A', count: 10, revenue: 1000 },
      { name: 'B', count: 8, revenue: 800 },
      { name: 'C', count: 6, revenue: 600 },
    ])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => null })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')
    expect(result).toEqual([])
  })

  it('excludes items not found in menu', async () => {
    ;(Order.aggregate as any).mockResolvedValue([
      { name: 'Chaufan Carne', count: 10, revenue: 1500000 },
      { name: 'Rabas', count: 8, revenue: 1440000 },
      { name: 'Dumplings', count: 6, revenue: 720000 },
      { name: 'Item Fantasma', count: 5, revenue: 500000 },
    ])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => mockMenu })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')
    expect(result.find(r => r.name === 'Item Fantasma')).toBeUndefined()
    expect(result.length).toBe(3)
  })

  it('matches item names case-insensitively', async () => {
    const menuMixedCase = {
      categories: [{
        items: [
          { _id: 'item1', name: 'CHAUFAN CARNE', price: 150000 },
          { _id: 'item2', name: 'Rabas', price: 180000 },
          { _id: 'item3', name: 'Dumplings', price: 120000 },
        ],
      }],
    }
    ;(Order.aggregate as any).mockResolvedValue([
      { name: 'chaufan carne', count: 10, revenue: 1500000 },
      { name: 'Rabas', count: 8, revenue: 1440000 },
      { name: 'Dumplings', count: 6, revenue: 720000 },
    ])
    ;(Menu.findOne as any).mockReturnValue({ lean: () => menuMixedCase })

    const result = await getBestSellers(TENANT_ID, LOCATION_ID, 'takeaway')
    expect(result.find(r => r.name === 'CHAUFAN CARNE')).toBeDefined()
  })
})
