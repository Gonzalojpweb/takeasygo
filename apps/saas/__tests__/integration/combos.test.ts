import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import Menu from '@/models/Menu'
import Combo from '@/models/Combo'
import { signJwt } from '@takeasygo/business/jwt'
import { isComboOnSchedule } from '@takeasygo/business'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import type { NextRequest } from 'next/server'
import { POST } from '@/app/api/[tenant]/pos/orders/route'
import { DELETE as REMOVE_LINE } from '@/app/api/[tenant]/pos/orders/[id]/items/[productId]/route'
import { GET as POS_MENU } from '@/app/api/[tenant]/pos/menu/route'
import { GET as PUBLIC_COMBOS } from '@/app/api/[tenant]/menu/[locationId]/combos/route'
import { buildOnlineComboLines, ComboOrderError } from '@/lib/combos/online-lines'
import { ComboInputError, parseComboInput } from '@/lib/combos/input'
import { renderOrderTicket } from '@/lib/printing/ticket-renderer'
import { buildPrintPayload } from '@/lib/printing/buildPrintPayload'
import { computeComboMetrics } from '@/lib/metrics/sales'
import { buildFiscalLines } from '@/lib/fiscal/order-lines'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'combo-tenant'
const URL_ = `http://localhost:3000/api/${SLUG}/pos/orders`
const BURGER = '64b0000000000000000000a1'
const FRIES = '64b0000000000000000000a2'
const params = { params: Promise.resolve({ tenant: SLUG }) }

let tenantId: string
let locationId: string
let comboId: string

const bearer = () => ({
  authorization: `Bearer ${signJwt({ sub: '64b0000000000000000000f1', tenantId, role: 'admin', deviceType: 'hub' }, PRIVATE_PEM)}`,
})
const req = (url: string, body?: unknown, method = 'POST') =>
  new Request(url, { method, headers: { 'content-type': 'application/json', ...bearer() }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest

const parent = (over = {}) => ({ productId: comboId, name: 'Combo 2x1', quantity: 1, unitPrice: 110_000, total: 110_000, comboId, comboInstanceId: 'i1', comboName: 'Combo 2x1', ...over })
const unit = (id: string, name: string, over = {}) => ({ productId: id, name, quantity: 1, unitPrice: 0, total: 0, comboId, comboInstanceId: 'i1', comboName: 'Combo 2x1', comboComponent: true, ...over })
const lines = () => [
  parent(),
  unit(BURGER, 'Burger', { modifiers: [{ name: 'Extra: Queso', price: 0, listPrice: 10_000 }] }),
  unit(FRIES, 'Papas'),
]
const order = (items: unknown[], id = '0d9a7c2e-1111-4a2b-9c3d-000000000001') => ({ id, items, status: 'confirmed' })

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  const tenant = await Tenant.create({ name: 'Combo', slug: SLUG, plan: 'full', isActive: true })
  tenantId = String(tenant._id)
  const location = await Location.create({ tenantId, name: 'Sede', slug: 'sede', address: 'x', isActive: true })
  locationId = String(location._id)
  await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    name: 'Carta',
    categories: [{
      name: 'Comida',
      isAvailable: true,
      printRole: 'kitchen',
      items: [
        { _id: BURGER, name: 'Burger', price: 80_000, isAvailable: true, customizationGroups: [{ name: 'Extra', options: [{ name: 'Queso', extraPrice: 10_000 }] }] },
        { _id: FRIES, name: 'Papas', price: 50_000, isAvailable: true },
      ],
    }],
  })
  const combo = await Combo.create({ tenantId, locationId, name: 'Combo 2x1', priceMode: 'fixed', fixedPrice: 100_000, itemPool: [BURGER, FRIES], minItems: 2, maxItems: 2 })
  comboId = String(combo._id)
})

describe('POS: pedido con combo', () => {
  it('guarda padre con precio y platos en cero, y el total no cuenta doble', async () => {
    const res = await POST(req(URL_, order(lines())), params)
    expect(res.status).toBe(201)
    const saved = await Order.findOne({ tenantId }).lean<any>()
    expect(saved.total).toBe(110_000)
    const [p, a, b] = saved.items
    expect(p).toMatchObject({ itemType: 'combo', comboComponent: false, subtotal: 110_000, comboInstanceId: 'i1' })
    expect(p.menuItemId ?? null).toBeNull()
    expect(a).toMatchObject({ itemType: 'menuItem', comboComponent: true, subtotal: 0, printRole: 'kitchen' })
    expect(String(a.menuItemId)).toBe(BURGER)
    expect(b.subtotal).toBe(0)
    const body = await res.json()
    expect(body.order.items[0]).toMatchObject({ productId: comboId, comboInstanceId: 'i1' })
    expect(body.order.items[1].comboComponent).toBe(true)
  })

  it('rechaza un precio manipulado', async () => {
    const res = await POST(req(URL_, order([parent({ unitPrice: 1, total: 1 }), ...lines().slice(1)])), params)
    expect(res.status).toBe(409)
  })

  it('rechaza un agregado con precio de lista falso', async () => {
    const items = [parent({ unitPrice: 100_001, total: 100_001 }), unit(BURGER, 'Burger', { modifiers: [{ name: 'Extra: Queso', price: 0, listPrice: 1 }] }), unit(FRIES, 'Papas')]
    expect((await POST(req(URL_, order(items)), params)).status).toBe(409)
  })

  it('rechaza un plato fuera del combo y una cantidad incorrecta', async () => {
    const outsider = [parent(), unit(BURGER, 'Burger'), unit('64b0000000000000000000a9', 'Otro')]
    expect((await POST(req(URL_, order(outsider)), params)).status).toBe(409)
    const short = [parent({ unitPrice: 100_000, total: 100_000 }), unit(BURGER, 'Burger')]
    expect((await POST(req(URL_, order(short, '0d9a7c2e-1111-4a2b-9c3d-000000000002')), params)).status).toBe(409)
  })

  it('rechaza un plato con precio propio: sería doble cobro', async () => {
    const items = [parent(), unit(BURGER, 'Burger', { unitPrice: 80_000, total: 80_000, modifiers: [{ name: 'Extra: Queso', price: 0, listPrice: 10_000 }] }), unit(FRIES, 'Papas')]
    expect((await POST(req(URL_, order(items)), params)).status).toBe(409)
  })

  it('un producto pausado pausa el combo entero', async () => {
    await Menu.updateOne({ tenantId, 'categories.items._id': FRIES }, { $set: { 'categories.$[].items.$[i].isAvailable': false } }, { arrayFilters: [{ 'i._id': new mongoose.Types.ObjectId(FRIES) }] })
    expect((await POST(req(URL_, order(lines())), params)).status).toBe(409)
    const menu = await (await POS_MENU(req(`http://localhost:3000/api/${SLUG}/pos/menu`, undefined, 'GET'), params)).json()
    expect(menu.products.find((p: any) => p.id === comboId).isAvailable).toBe(false)
  })

  it('un combo de otro comercio no se puede vender', async () => {
    await Combo.updateOne({ _id: comboId }, { $set: { tenantId: new mongoose.Types.ObjectId() } })
    expect((await POST(req(URL_, order(lines())), params)).status).toBe(409)
  })

  it('quitar un plato ya cargado saca el combo entero', async () => {
    const created = await (await POST(req(URL_, order(lines())), params)).json()
    const saved = await Order.findOne({ tenantId }).lean<any>()
    await Order.updateOne({ _id: saved._id }, { $set: { status: 'pending' } })
    const lineId = String(saved.items[2]._id)
    const res = await REMOVE_LINE(
      req(`${URL_}/${created.order.id}/items/${FRIES}?lineId=${lineId}&reason=load_error`, undefined, 'DELETE'),
      { params: Promise.resolve({ tenant: SLUG, id: created.order.id, productId: FRIES }) }
    )
    expect(res.status).toBe(200)
    const after = await Order.findOne({ tenantId }).lean<any>()
    expect(after.items).toEqual([])
    expect(after.total).toBe(0)
  })
})

describe('Menú público', () => {
  const read = async (mode: string) =>
    (await (await PUBLIC_COMBOS(req(`http://localhost:3000/api/${SLUG}/menu/${locationId}/combos?mode=${mode}`, undefined, 'GET'), { params: Promise.resolve({ tenant: SLUG, locationId }) })).json()).combos

  it('muestra el combo con sus platos y sin datos internos', async () => {
    const [combo] = await read('takeaway')
    expect(combo.items.map((i: any) => i.name)).toEqual(['Burger', 'Papas'])
    expect(combo.tenantId).toBeUndefined()
    expect(combo.items[0].stockPortions).toBeUndefined()
  })

  it('respeta dónde se ofrece y lo pausado', async () => {
    await Combo.updateOne({ _id: comboId }, { $set: { visibility: 'dine-in' } })
    expect(await read('takeaway')).toEqual([])
    expect(await read('dine-in')).toHaveLength(1)
    await Menu.updateOne({ tenantId }, { $set: { 'categories.0.isAvailable': false } })
    expect(await read('dine-in')).toEqual([])
  })
})

describe('Pedido online', () => {
  const catalog = () =>
    new Map<string, any>([
      [BURGER, { _id: BURGER, name: 'Burger', price: 80_000, takeawayPrice: 90_000, printRole: 'kitchen', categoryName: 'Comida', customizationGroups: [] }],
      [FRIES, { _id: FRIES, name: 'Papas', price: 50_000, printRole: 'bar', categoryName: 'Comida' }],
    ])
  const base = (combo: any, over = {}) => ({
    combo: { _id: comboId, name: 'Combo', isActive: true, visibility: 'both', minItems: 2, maxItems: 2, allowRepeat: true, itemPool: [BURGER, FRIES], ...combo },
    units: [{ menuItemId: BURGER }, { menuItemId: FRIES }],
    quantity: 1,
    mode: 'takeaway',
    menuItemMap: catalog(),
    timezone: 'America/Argentina/Buenos_Aires',
    resolveCustomizations: () => ({ resolved: [{ groupName: 'Extra' }], extraPrice: 10_000 }),
    ...over,
  })

  it('precio fijo y suma con el precio del modo', () => {
    expect(buildOnlineComboLines(base({ priceMode: 'fixed', fixedPrice: 100_000 }))[0].subtotal).toBe(100_000)
    expect(buildOnlineComboLines(base({ priceMode: 'sumItems' }))[0].subtotal).toBe(140_000)
    expect(buildOnlineComboLines(base({ priceMode: 'sumItems' }, { mode: 'dine-in' }))[0].subtotal).toBe(130_000)
  })

  it('cantidad 2 son dos combos separados', () => {
    const out = buildOnlineComboLines(base({ priceMode: 'fixed', fixedPrice: 100_000 }, { quantity: 2 }))
    expect(out).toHaveLength(6)
    expect(new Set(out.map((l) => l.comboInstanceId)).size).toBe(2)
    expect(out.reduce((s, l) => s + l.subtotal, 0)).toBe(200_000)
  })

  it('los extras se cobran según el combo', () => {
    const units = [{ menuItemId: BURGER, customizations: [{ groupName: 'Extra' }] }, { menuItemId: FRIES }]
    expect(buildOnlineComboLines(base({ priceMode: 'fixed', fixedPrice: 100_000 }, { units }))[0].subtotal).toBe(110_000)
    expect(buildOnlineComboLines(base({ priceMode: 'fixed', fixedPrice: 100_000, chargeCustomizationExtras: false }, { units }))[0].subtotal).toBe(100_000)
  })

  it('rechaza: producto no disponible, plato ajeno, repetido y mitad y mitad', () => {
    const fixed = { priceMode: 'fixed', fixedPrice: 100_000 }
    const missing = catalog()
    missing.delete(FRIES)
    expect(() => buildOnlineComboLines(base(fixed, { menuItemMap: missing }))).toThrow(ComboOrderError)
    expect(() => buildOnlineComboLines(base(fixed, { units: [{ menuItemId: BURGER }, { menuItemId: '64b0000000000000000000a9' }] }))).toThrow(ComboOrderError)
    expect(() => buildOnlineComboLines(base({ ...fixed, allowRepeat: false }, { units: [{ menuItemId: BURGER }, { menuItemId: BURGER }] }))).toThrow(ComboOrderError)
    expect(() => buildOnlineComboLines(base(fixed, { units: [{ menuItemId: BURGER, customizations: [{ groupName: 'Primera mitad' }] }, { menuItemId: FRIES }] }))).toThrow(/mitad/)
  })
})

describe('Salida: ticket, reportes y factura', () => {
  const comboOrder: any = {
    _id: 'x',
    orderNumber: 'A-1',
    status: 'confirmed',
    total: 110_000,
    locationId: '64b0000000000000000000c1',
    items: [
      { name: 'Combo', itemType: 'combo', comboId: 'c', comboInstanceId: 'i1', comboName: 'Combo', comboComponent: false, price: 110_000, basePrice: 110_000, quantity: 1, subtotal: 110_000, printRole: 'kitchen' },
      { name: 'Burger', itemType: 'menuItem', comboId: 'c', comboInstanceId: 'i1', comboName: 'Combo', comboComponent: true, price: 0, basePrice: 0, quantity: 1, subtotal: 0, printRole: 'kitchen' },
      { name: 'Cerveza', itemType: 'menuItem', comboId: 'c', comboInstanceId: 'i1', comboName: 'Combo', comboComponent: true, price: 0, basePrice: 0, quantity: 1, subtotal: 0, printRole: 'bar' },
    ],
  }
  const printer: any = { name: 'P', roles: ['kitchen'], paperWidth: 80, printSettings: {} }
  const text = (role: string) => renderOrderTicket(comboOrder, printer, role)?.toString('latin1') ?? ''

  it('cada estación ve el combo con sus platos; la caja, además el precio', () => {
    expect(text('kitchen')).toContain('COMBO')
    expect(text('kitchen')).toContain('BURGER')
    expect(text('kitchen')).not.toContain('CERVEZA')
    expect(text('bar')).toContain('CERVEZA')
    expect(text('bar')).not.toContain('BURGER')
    expect(text('cashier')).toContain('BURGER')
    expect(text('cashier')).toContain('1.100')
  })

  it('sin platos para una estación no sale ticket', async () => {
    const onlyKitchen = { ...comboOrder, items: comboOrder.items.slice(0, 2) }
    const jobs = await buildPrintPayload(onlyKitchen, [{ _id: 'b', name: 'Barra', roles: ['bar'], paperWidth: 80 }] as any)
    expect(jobs).toEqual([])
  })

  it('reportes: el dinero en el combo, los platos solo en cantidad', () => {
    const [metric] = computeComboMetrics([comboOrder, comboOrder])
    expect(metric).toMatchObject({ comboId: 'c', quantity: 2, revenue: 220_000, avgTicket: 110_000 })
    expect(metric.components).toEqual([{ name: 'Burger', quantity: 2 }, { name: 'Cerveza', quantity: 2 }])
  })

  it('factura: una línea con el precio del combo, sin platos en cero', () => {
    const { lines: fiscal, discountCents } = buildFiscalLines({ ...comboOrder, deliveryCost: 0 }, new Map(), 21)
    expect(fiscal.map((l) => [l.description, l.grossCents])).toEqual([['Combo', 110_000]])
    expect(discountCents).toBe(0)
  })
})

describe('Reglas', () => {
  it('horario, días y franja que cruza la medianoche', () => {
    const tz = 'America/Argentina/Buenos_Aires'
    const wed21 = new Date('2026-11-05T00:30:00Z') // miércoles 21:30 en Argentina
    expect(isComboOnSchedule(null, wed21, tz)).toBe(true)
    expect(isComboOnSchedule({ days: [3] }, wed21, tz)).toBe(true)
    expect(isComboOnSchedule({ days: [1] }, wed21, tz)).toBe(false)
    expect(isComboOnSchedule({ from: '20:00', to: '22:00' }, wed21, tz)).toBe(true)
    expect(isComboOnSchedule({ from: '12:00', to: '15:00' }, wed21, tz)).toBe(false)
    expect(isComboOnSchedule({ from: '20:00', to: '02:00' }, wed21, tz)).toBe(true)
  })

  it('el panel no puede escribir campos que no son del combo', () => {
    const out = parseComboInput({ name: 'A', priceMode: 'fixed', fixedPrice: 100, itemPool: [BURGER], minItems: 1, maxItems: 1, tenantId: 'otro', _id: 'x', hack: 1 })
    expect(out.tenantId).toBeUndefined()
    expect(out._id).toBeUndefined()
    expect(out.hack).toBeUndefined()
  })

  it('valida precio, productos y cantidades', () => {
    const ok = { name: 'A', priceMode: 'fixed', fixedPrice: 100, itemPool: [BURGER, FRIES] }
    expect(() => parseComboInput({ ...ok, fixedPrice: 10.5 })).toThrow(ComboInputError)
    expect(() => parseComboInput({ ...ok, itemPool: ['no-es-id'] })).toThrow(ComboInputError)
    expect(() => parseComboInput({ ...ok, minItems: 3, maxItems: 2 })).toThrow(ComboInputError)
    expect(() => parseComboInput({ ...ok, allowRepeat: false, itemPool: [BURGER] })).toThrow(ComboInputError)
    expect(() => parseComboInput({ ...ok, style: { imageUrl: 'javascript:alert(1)' } })).toThrow(ComboInputError)
    expect(parseComboInput({ name: 'B', priceMode: 'sumItems', itemPool: [BURGER, FRIES] }).fixedPrice).toBeNull()
  })
})
