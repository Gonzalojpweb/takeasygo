import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import InventorySKU from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventoryState from '@/models/InventoryState'
import { signJwt } from '@takeasygo/business/jwt'
import { flattenMenu } from '@takeasygo/business'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { portionsFromStock, syncDishAvailability } from '@/lib/inventory/availability'
import type { NextRequest } from 'next/server'

import { POST as ordersPost } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as itemAvailability } from '@/app/api/[tenant]/pos/menu/items/[itemId]/route'

/**
 * Fase J (2026-10): artículos faltantes y pausa automática por stock.
 *   · el server no vende un artículo pausado (aunque el POS tenga la carta vieja).
 *   · caja/encargado/admin pausan y reanudan desde el POS; el mozo no.
 *   · el inventario pausa solo cuando no alcanza para una porción y reanuda
 *     solo lo que pausó él; con stock desconocido no toca nada.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'test-tenant'
const BASE = `http://localhost:3000/api/${SLUG}/pos`
const ITEM_ID = '64b0000000000000000000aa'

let tenantId: string
let locationId: string

const token = (role: 'cashier' | 'waiter' = 'cashier') =>
  signJwt({ sub: '64b0000000000000000000a1', tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
const AUTH = (role: 'cashier' | 'waiter' = 'cashier') => ({ authorization: `Bearer ${token(role)}`, 'x-location-id': locationId })
function req(url: string, body?: unknown, headers: Record<string, string> = AUTH(), method = 'POST'): NextRequest {
  return new Request(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest
}
const itemParams = { params: Promise.resolve({ tenant: SLUG, itemId: ITEM_ID }) }
const order = () =>
  ordersPost(req(`${BASE}/orders`, { id: crypto.randomUUID(), items: [{ productId: ITEM_ID, name: 'Hamburguesa', quantity: 1, unitPrice: 1500, total: 1500 }] }), { params: Promise.resolve({ tenant: SLUG }) })
const menuItem = async () => (await Menu.findOne({ tenantId, locationId }).lean())!.categories[0].items[0] as unknown as { isAvailable: boolean; pausedReason: string | null; stockPortions: number | null }

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Local Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  await Menu.create({ tenantId, locationId, isActive: true, categories: [{ name: 'Platos', sortOrder: 0, items: [{ _id: ITEM_ID, name: 'Hamburguesa', price: 1500 }] }] })
})

describe('portionsFromStock', () => {
  const line = { skuId: 's1', storageLocationId: 'd1', quantity: 0.2, unit: 'kg' as const }
  it('porciones enteras por el insumo que menos alcanza', () => {
    expect(portionsFromStock([line], new Map([['s1|d1', { mu: 1, anchored: true }]]))).toBe(5)
    expect(portionsFromStock([line], new Map([['s1|d1', { mu: 0.1, anchored: true }]]))).toBe(0)
  })
  it('stock desconocido (insumo nunca contado) → null: no se toca la disponibilidad', () => {
    expect(portionsFromStock([line], new Map([['s1|d1', { mu: 5, anchored: false }]]))).toBeNull()
    expect(portionsFromStock([line], new Map())).toBeNull()
  })
})

describe('flatten: motivo de no disponible', () => {
  it('categoría pausada ⇒ ítem faltante (manual); pausa por stock ⇒ «stock» con porciones', () => {
    const flat = flattenMenu({
      tenantId: 't',
      categories: [
        { name: 'A', isAvailable: false, items: [{ _id: 'x', name: 'X', price: 1 }] },
        { name: 'B', items: [{ _id: 'y', name: 'Y', price: 1, isAvailable: false, pausedReason: 'stock', stockPortions: 0 }, { _id: 'z', name: 'Z', price: 1, stockPortions: 3 }] },
      ],
    })
    expect(flat.products.find((p) => p.id === 'x')).toMatchObject({ isAvailable: false, unavailableReason: 'manual' })
    expect(flat.products.find((p) => p.id === 'y')).toMatchObject({ isAvailable: false, unavailableReason: 'stock', stockPortions: 0 })
    expect(flat.products.find((p) => p.id === 'z')).toMatchObject({ isAvailable: true, stockPortions: 3 })
  })
})

describe('pausar desde el POS y no vender lo pausado', () => {
  it('el cajero pausa (manual) y el server rechaza venderlo; al reanudar se vende', async () => {
    const paused = await itemAvailability(req(`${BASE}/menu/items/${ITEM_ID}`, { available: false }, AUTH(), 'PATCH'), itemParams)
    expect(paused.status).toBe(200)
    expect(await menuItem()).toMatchObject({ isAvailable: false, pausedReason: 'manual' })

    const blocked = await order()
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).error.message).toContain('faltante')

    await itemAvailability(req(`${BASE}/menu/items/${ITEM_ID}`, { available: true }, AUTH(), 'PATCH'), itemParams)
    expect((await order()).status).toBe(201)
  })

  it('el mozo no pausa artículos', async () => {
    const res = await itemAvailability(req(`${BASE}/menu/items/${ITEM_ID}`, { available: false }, AUTH('waiter'), 'PATCH'), itemParams)
    expect(res.status).toBe(403)
  })
})

describe('pausa automática por stock (inventario → carta)', () => {
  async function setupInventory(mu: number, anchored = true) {
    const sku = await InventorySKU.create({ tenantId, name: 'Carne', nameKey: 'carne', category: 'meat_poultry', canonicalUnit: 'kg' })
    const storage = await InventoryStorageLocation.create({ tenantId, locationId, name: 'Cocina', type: 'kitchen', isDefaultConsumption: true, isActive: true })
    await InventoryRecipe.create({
      tenantId, locationId, kind: 'dish', recipeKey: `dish:${locationId}:${ITEM_ID}:*`, name: 'Hamburguesa',
      menuItemId: ITEM_ID, variantName: null, items: [{ skuId: sku._id, quantity: 200, unit: 'g' }], version: 1, isCurrent: true,
    })
    await InventoryState.create({ tenantId, locationId, skuId: sku._id, storageLocationId: storage._id, mu, anchored })
    return { skuId: String(sku._id), storageId: storage._id }
  }

  it('sin stock para una porción → se pausa sola; vuelve el stock → se reanuda sola', async () => {
    const { skuId, storageId } = await setupInventory(0.1)
    const first = await syncDishAvailability(tenantId, [skuId])
    expect(first).toEqual([expect.objectContaining({ menuItemId: ITEM_ID, action: 'paused', portions: 0 })])
    expect(await menuItem()).toMatchObject({ isAvailable: false, pausedReason: 'stock', stockPortions: 0 })

    await InventoryState.updateOne({ tenantId, storageLocationId: storageId }, { $set: { mu: 1 } })
    await syncDishAvailability(tenantId, [skuId])
    expect(await menuItem()).toMatchObject({ isAvailable: true, pausedReason: null, stockPortions: 5 })
  })

  it('una pausa manual nunca la levanta el inventario', async () => {
    const { skuId } = await setupInventory(10)
    await itemAvailability(req(`${BASE}/menu/items/${ITEM_ID}`, { available: false }, AUTH(), 'PATCH'), itemParams)
    await syncDishAvailability(tenantId, [skuId])
    expect(await menuItem()).toMatchObject({ isAvailable: false, pausedReason: 'manual', stockPortions: 50 })
  })

  it('insumo nunca contado (stock desconocido) → no toca la disponibilidad', async () => {
    const { skuId } = await setupInventory(0, false)
    expect(await syncDishAvailability(tenantId, [skuId])).toEqual([])
    expect(await menuItem()).toMatchObject({ isAvailable: true })
  })
})

void mongoose
