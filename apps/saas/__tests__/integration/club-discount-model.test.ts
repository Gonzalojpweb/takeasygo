import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose from 'mongoose'

// ── Test setup (MongoMemoryServer + mocks) ───────────────────────────────────
let mongod: any

beforeAll(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server')
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
})

afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
})

// ── Import models after mongoose.connect ─────────────────────────────────────
const ClubDiscount = (await import('@/models/ClubDiscount')).default
const Tenant = (await import('@/models/Tenant')).default

// ── Helpers ──────────────────────────────────────────────────────────────────
async function createTenant(slug = 'test-tenant') {
  return Tenant.create({ name: `Test ${slug}`, slug, plan: 'full' })
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('ClubDiscount Model', () => {
  it('creates a club discount with valid data', async () => {
    const tenant = await createTenant()
    const discount = await ClubDiscount.create({
      tenantId: tenant._id,
      scope: 'all',
      discountPercent: 20,
      cooldownHours: 24,
      maxRedemptions: 100,
      active: true,
    })

    expect(discount._id).toBeTruthy()
    expect(discount.scope).toBe('all')
    expect(discount.discountPercent).toBe(20)
    expect(discount.cooldownHours).toBe(24)
    expect(discount.maxRedemptions).toBe(100)
    expect(discount.usedCount).toBe(0)
    expect(discount.active).toBe(true)
  })

  it('enforces one active discount per tenant (unique partial index)', async () => {
    const tenant = await createTenant()
    await ClubDiscount.create({
      tenantId: tenant._id,
      scope: 'all',
      discountPercent: 20,
      active: true,
    })

    // Second active discount for same tenant should fail
    await expect(
      ClubDiscount.create({
        tenantId: tenant._id,
        scope: 'category',
        discountPercent: 30,
        active: true,
      })
    ).rejects.toThrow()
  })

  it('allows multiple inactive discounts per tenant', async () => {
    const tenant = await createTenant()
    await ClubDiscount.create({
      tenantId: tenant._id,
      scope: 'all',
      discountPercent: 20,
      active: false,
    })
    await ClubDiscount.create({
      tenantId: tenant._id,
      scope: 'category',
      discountPercent: 30,
      active: false,
    })

    const count = await ClubDiscount.countDocuments({ tenantId: tenant._id })
    expect(count).toBe(2)
  })

  it('allows active discounts for different tenants', async () => {
    const tenant1 = await createTenant('tenant-1')
    const tenant2 = await createTenant('tenant-2')

    await ClubDiscount.create({
      tenantId: tenant1._id,
      scope: 'all',
      discountPercent: 20,
      active: true,
    })
    await ClubDiscount.create({
      tenantId: tenant2._id,
      scope: 'item',
      discountPercent: 50,
      active: true,
    })

    const count = await ClubDiscount.countDocuments({ active: true })
    expect(count).toBe(2)
  })

  it('validates scope enum', async () => {
    const tenant = await createTenant()
    await expect(
      ClubDiscount.create({
        tenantId: tenant._id,
        scope: 'invalid',
        discountPercent: 20,
      })
    ).rejects.toThrow()
  })

  it('validates discountPercent range (1-100)', async () => {
    const tenant = await createTenant()
    await expect(
      ClubDiscount.create({
        tenantId: tenant._id,
        scope: 'all',
        discountPercent: 0,
      })
    ).rejects.toThrow()

    await expect(
      ClubDiscount.create({
        tenantId: tenant._id,
        scope: 'all',
        discountPercent: 101,
      })
    ).rejects.toThrow()
  })

  it('sets default values correctly', async () => {
    const tenant = await createTenant()
    const discount = await ClubDiscount.create({
      tenantId: tenant._id,
      scope: 'all',
      discountPercent: 15,
    })

    expect(discount.cooldownHours).toBe(24)
    expect(discount.maxRedemptions).toBe(0)
    expect(discount.usedCount).toBe(0)
    expect(discount.active).toBe(true)
    expect(discount.categoryIds).toEqual([])
    expect(discount.subcategoryIds).toEqual([])
    expect(discount.itemIds).toEqual([])
  })

  it('stores category/subcategory/item IDs for scoped discounts', async () => {
    const tenant = await createTenant()
    const catId = new mongoose.Types.ObjectId()
    const subId = new mongoose.Types.ObjectId()
    const itemId = new mongoose.Types.ObjectId()

    const discount = await ClubDiscount.create({
      tenantId: tenant._id,
      scope: 'item',
      discountPercent: 35,
      itemIds: [itemId],
      categoryIds: [catId],
      subcategoryIds: [subId],
    })

    expect(discount.itemIds).toHaveLength(1)
    expect(discount.itemIds[0].toString()).toBe(itemId.toString())
    expect(discount.categoryIds).toHaveLength(1)
    expect(discount.subcategoryIds).toHaveLength(1)
  })
})

describe('ClubDiscount - scope filtering logic', () => {
  const mockMenuItems = [
    { _id: 'item1', name: 'Cerveza', categoryId: 'cat1', subcategoryId: 'sub1', price: 800 },
    { _id: 'item2', name: 'Empanada', categoryId: 'cat1', subcategoryId: null, price: 500 },
    { _id: 'item3', name: 'Pizza', categoryId: 'cat2', subcategoryId: 'sub2', price: 2000 },
    { _id: 'item4', name: 'Helado', categoryId: 'cat3', subcategoryId: null, price: 600 },
  ]

  function getEligibleItems(
    items: typeof mockMenuItems,
    scope: string,
    categoryIds: string[] = [],
    subcategoryIds: string[] = [],
    itemIds: string[] = [],
  ) {
    return items.filter(item => {
      if (scope === 'all') return true
      if (scope === 'category') return categoryIds.includes(item.categoryId)
      if (scope === 'subcategory') return subcategoryIds.includes(item.subcategoryId ?? '')
      if (scope === 'item') return itemIds.includes(item._id)
      return false
    })
  }

  it('scope all: all items eligible', () => {
    const eligible = getEligibleItems(mockMenuItems, 'all')
    expect(eligible).toHaveLength(4)
  })

  it('scope category: only items in matching categories', () => {
    const eligible = getEligibleItems(mockMenuItems, 'category', ['cat1'])
    expect(eligible).toHaveLength(2)
    expect(eligible.map(i => i.name)).toEqual(['Cerveza', 'Empanada'])
  })

  it('scope subcategory: only items in matching subcategories', () => {
    const eligible = getEligibleItems(mockMenuItems, 'subcategory', [], ['sub1'])
    expect(eligible).toHaveLength(1)
    expect(eligible[0].name).toBe('Cerveza')
  })

  it('scope item: only specific items', () => {
    const eligible = getEligibleItems(mockMenuItems, 'item', [], [], ['item1', 'item3'])
    expect(eligible).toHaveLength(2)
    expect(eligible.map(i => i.name)).toEqual(['Cerveza', 'Pizza'])
  })

  it('scope category with multiple IDs', () => {
    const eligible = getEligibleItems(mockMenuItems, 'category', ['cat1', 'cat3'])
    expect(eligible).toHaveLength(3)
  })

  it('no matching scope returns empty', () => {
    const eligible = getEligibleItems(mockMenuItems, 'item', [], [], ['nonexistent'])
    expect(eligible).toHaveLength(0)
  })

  it('discount calculation on eligible items', () => {
    const eligible = getEligibleItems(mockMenuItems, 'category', ['cat1'])
    const subtotal = eligible.reduce((sum, i) => sum + i.price, 0)
    const discountPercent = 20
    const discountAmount = Math.floor(subtotal * (discountPercent / 100))
    expect(subtotal).toBe(1300) // 800 + 500
    expect(discountAmount).toBe(260) // 1300 * 0.20
  })
})
