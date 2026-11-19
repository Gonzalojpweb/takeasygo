// ============================================================================
// item-likes.test.ts — like de un plato (solo comprador, pedido entregado)
// ============================================================================
// Cubre las correcciones del 19/11: multi-sede, estado del pedido, contador
// atómico sin pisar el menú, like repetido y quitar like.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-auth-secret-item-likes'
})
vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import ItemLike from '@/models/ItemLike'
import { POST, DELETE, GET } from '@/app/api/[tenant]/menu/items/[itemId]/like/route'
import { generateRatingToken } from '@/lib/rating-token'

const SLUG = 'likes-test'
let tenant: any
const locA = new mongoose.Types.ObjectId()
const locB = new mongoose.Types.ObjectId()
let itemA: string
let itemB: string
let subItemB: string

beforeEach(async () => {
  tenant = await Tenant.create({ slug: SLUG, name: 'Likes', isActive: true, status: 'active', plan: 'full' })
  const menuA = await Menu.create({
    tenantId: tenant._id, locationId: locA,
    categories: [{ name: 'Platos', items: [{ name: 'Milanesa', price: 5000 }] }],
  })
  const menuB = await Menu.create({
    tenantId: tenant._id, locationId: locB,
    categories: [{
      name: 'Platos',
      items: [{ name: 'Lomo', price: 9000, likesCount: 4 }],
      subcategories: [{ name: 'Postres', items: [{ name: 'Flan', price: 3000 }] }],
    }],
  })
  itemA = String((menuA as any).categories[0].items[0]._id)
  itemB = String((menuB as any).categories[0].items[0]._id)
  subItemB = String((menuB as any).categories[0].subcategories[0].items[0]._id)
})

async function createOrder(locationId: mongoose.Types.ObjectId, status: string, menuItemIds: string[]) {
  const _id = new mongoose.Types.ObjectId()
  await Order.collection.insertOne({
    _id, tenantId: tenant._id, locationId, status, orderNumber: `T-${_id}`,
    items: menuItemIds.map(id => ({ _id: new mongoose.Types.ObjectId(), menuItemId: new mongoose.Types.ObjectId(id), name: 'x', quantity: 1, price: 1 })),
  })
  return String(_id)
}

const ctx = (itemId: string) => ({ params: Promise.resolve({ tenant: SLUG, itemId }) })
const req = (itemId: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/menu/items/${itemId}/like`, {
    method, headers: { 'content-type': 'application/json', 'x-real-ip': `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body),
  })

async function likesOf(itemId: string): Promise<number> {
  const menus = await Menu.find({ tenantId: tenant._id }).lean<any[]>()
  for (const m of menus) for (const c of m.categories) {
    for (const i of c.items ?? []) if (String(i._id) === itemId) return i.likesCount ?? 0
    for (const s of c.subcategories ?? []) for (const i of s.items ?? []) if (String(i._id) === itemId) return i.likesCount ?? 0
  }
  throw new Error('no está')
}

describe('like de plato', () => {
  it('suma en el menú de la sede del pedido (multi-sede, también en subcategoría)', async () => {
    const orderId = await createOrder(locB, 'delivered', [itemB, subItemB])
    const token = generateRatingToken(orderId)

    const r1 = await POST(req(itemB, 'POST', { orderId, token }), ctx(itemB))
    expect(r1.status).toBe(200)
    expect(await r1.json()).toEqual({ liked: true, likesCount: 5 })

    const r2 = await POST(req(subItemB, 'POST', { orderId, token }), ctx(subItemB))
    expect(r2.status).toBe(200)
    expect(await likesOf(subItemB)).toBe(1)
    expect(await likesOf(itemB)).toBe(5)
    expect(await likesOf(itemA)).toBe(0)
  })

  it('no deja likear un pedido que no fue entregado', async () => {
    const orderId = await createOrder(locA, 'preparing', [itemA])
    const res = await POST(req(itemA, 'POST', { orderId, token: generateRatingToken(orderId) }), ctx(itemA))
    expect(res.status).toBe(409)
    expect(await ItemLike.countDocuments()).toBe(0)
    expect(await likesOf(itemA)).toBe(0)
  })

  it('rechaza token inválido y platos que no están en el pedido', async () => {
    const orderId = await createOrder(locA, 'delivered', [itemA])
    expect((await POST(req(itemA, 'POST', { orderId, token: 'x'.repeat(24) }), ctx(itemA))).status).toBe(401)
    expect((await POST(req(itemB, 'POST', { orderId, token: generateRatingToken(orderId) }), ctx(itemB))).status).toBe(403)
  })

  it('un like por pedido y plato: repetir no suma y devuelve la cantidad (no un id)', async () => {
    const orderId = await createOrder(locA, 'delivered', [itemA])
    const token = generateRatingToken(orderId)
    await POST(req(itemA, 'POST', { orderId, token }), ctx(itemA))
    const again = await POST(req(itemA, 'POST', { orderId, token }), ctx(itemA))
    expect(await again.json()).toEqual({ liked: true, likesCount: 1 })
    expect(await likesOf(itemA)).toBe(1)
  })

  it('likes simultáneos de pedidos distintos no se pierden', async () => {
    const orders = await Promise.all(Array.from({ length: 8 }, () => createOrder(locA, 'delivered', [itemA])))
    await Promise.all(orders.map(orderId => POST(req(itemA, 'POST', { orderId, token: generateRatingToken(orderId) }), ctx(itemA))))
    expect(await likesOf(itemA)).toBe(8)
    expect(await ItemLike.countDocuments({ menuItemId: itemA })).toBe(8)
  })

  it('el like no pisa un cambio del menú hecho en el medio', async () => {
    const orderId = await createOrder(locA, 'delivered', [itemA])
    await Menu.updateOne({ locationId: locA }, { $set: { 'categories.0.items.0.price': 7777 } })
    await POST(req(itemA, 'POST', { orderId, token: generateRatingToken(orderId) }), ctx(itemA))
    const menu = await Menu.findOne({ locationId: locA }).lean<any>()
    expect(menu.categories[0].items[0].price).toBe(7777)
    expect(menu.categories[0].items[0].likesCount).toBe(1)
  })

  it('quitar el like resta y nunca baja de 0; GET informa estado', async () => {
    const orderId = await createOrder(locA, 'delivered', [itemA])
    const token = generateRatingToken(orderId)
    await POST(req(itemA, 'POST', { orderId, token }), ctx(itemA))

    const got = await GET(new NextRequest(`http://localhost/api/${SLUG}/menu/items/${itemA}/like?orderId=${orderId}&token=${token}`), ctx(itemA))
    expect(await got.json()).toEqual({ liked: true, likesCount: 1 })

    const del = await DELETE(req(itemA, 'DELETE', { orderId, token }), ctx(itemA))
    expect(await del.json()).toEqual({ liked: false, likesCount: 0 })
    const delAgain = await DELETE(req(itemA, 'DELETE', { orderId, token }), ctx(itemA))
    expect(await delAgain.json()).toEqual({ liked: false, likesCount: 0 })
    expect(await likesOf(itemA)).toBe(0)
  })
})
