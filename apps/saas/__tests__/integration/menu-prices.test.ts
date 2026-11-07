import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import PriceChangeBatch from '@/models/PriceChangeBatch'
import { itemKeyOf } from '@/lib/menu/price-engine'
import { runScheduledBatches } from '@/lib/menu/price-batches'
import { __setPriceImageClientForTests } from '@/lib/menu/price-image'
import { POST as previewPOST } from '@/app/api/[tenant]/menu/prices/preview/route'
import { GET as batchesGET, POST as batchesPOST } from '@/app/api/[tenant]/menu/prices/batches/route'
import { POST as batchPOST } from '@/app/api/[tenant]/menu/prices/batches/[batchId]/route'
import { GET as historyGET } from '@/app/api/[tenant]/menu/prices/history/route'
import { GET as exportGET } from '@/app/api/[tenant]/menu/prices/export/route'
import { POST as importPOST } from '@/app/api/[tenant]/menu/prices/import/route'
import { POST as imagePOST } from '@/app/api/[tenant]/menu/prices/from-image/route'
import { PUT as itemPUT } from '@/app/api/[tenant]/menu/categories/[categoryId]/items/route'

/** «Actualizar precios»: vista previa, aplicar, proponer/aprobar, deshacer, programar, Excel, foto. */

const SLUG = 'precios-test'
const $ = (p: number) => p * 100
const P = { params: Promise.resolve({ tenant: SLUG }) }
let tenantId: string, loc1: string, loc2: string

const req = (path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost/api/${SLUG}/menu/prices${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

async function signIn(role: string) {
  const u = await User.create({ name: `u-${role}`, email: `${role}-${Math.random().toString(36).slice(2)}@t.test`, password: 'Pass-123456!', role, tenantId, phone: `+54911${Math.floor(Math.random() * 1e8)}` })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(u._id), role, tenantId, name: `u-${role}`, assignedLocations: [] }, expires: '' } as never)
  clearFreshUserCache()
  return u
}

const carta = () => ([
  { name: 'Bebidas', sortOrder: 0, items: [
    { name: 'Coca-Cola', price: $(5000), originalPrice: $(5000), imageUrl: 'https://img/coca.jpg' },
    { name: 'Agua', price: $(3000), takeawayPrice: $(3500), originalPrice: $(3000), takeawayOriginalPrice: $(3500), imageUrl: 'https://img/agua.jpg' },
  ] },
  { name: 'Platos', sortOrder: 1, items: [
    { name: 'Chowfan', price: $(18000), originalPrice: $(18000), imageUrl: 'https://img/chowfan.jpg',
      customizationGroups: [{ name: 'Cantidad', type: 'single', required: true, options: [{ name: '1 Plato', extraPrice: 0 }, { name: '2 Platos', extraPrice: $(12000) }] }] },
  ] },
])

const bebidas10 = (locationIds = [loc1]) => ({
  locationIds,
  rules: [{ id: 'r1', selection: { categories: ['Bebidas'] }, adjustment: { kind: 'percent', value: 10, rounding: '100' } }],
  targets: { dineIn: true, takeaway: true, variants: true, options: true },
})

const priceOf = async (loc: string, cat: number, item: number) => {
  const m = await Menu.findOne({ tenantId, locationId: loc }).lean()
  return (m as unknown as { categories: { items: { price: number; takeawayPrice?: number; imageUrl: string; originalPrice?: number }[] }[] }).categories[cat].items[item]
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  tenantId = String((await Tenant.create({ name: 'Precios', slug: SLUG, plan: 'full' }))._id)
  loc1 = String((await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'a', isActive: true }))._id)
  loc2 = String((await Location.create({ tenantId, name: 'Norte', slug: 'norte', address: 'b', isActive: true }))._id)
  await Menu.create({ tenantId, locationId: loc1, isActive: true, categories: carta() })
  await Menu.create({ tenantId, locationId: loc2, isActive: true, categories: carta() })
  await PriceChangeBatch.init()
})

describe('vista previa y aplicar', () => {
  it('la vista previa no escribe; aplicar cambia solo precios (fotos intactas) y queda en el historial', async () => {
    await signIn('admin')
    const prev = await (await previewPOST(req('/preview', 'POST', bebidas10()), P)).json()
    expect(prev.changes.filter((c: { hidden?: boolean }) => !c.hidden).map((c: { itemName: string; label: string; after: number }) => [c.itemName, c.label, c.after / 100]))
      .toEqual([['Coca-Cola', 'Precio', 5500], ['Agua', 'Precio', 3300], ['Agua', 'Para llevar', 3900]])
    expect((await priceOf(loc1, 0, 0)).price).toBe($(5000))

    const res = await batchesPOST(req('/batches', 'POST', { ...bebidas10(), mode: 'apply' }), P)
    expect(res.status).toBe(201)
    const { batch } = await res.json()
    expect(batch.status).toBe('applied')
    const coca = await priceOf(loc1, 0, 0)
    expect([coca.price, coca.originalPrice, coca.imageUrl]).toEqual([$(5500), $(5500), 'https://img/coca.jpg'])
    expect((await priceOf(loc2, 0, 0)).price).toBe($(5000)) // otra sede: intacta

    const list = await (await batchesGET(req('/batches'), P)).json()
    expect(list.batches).toHaveLength(1)
    const hist = await (await historyGET(req(`/history?itemKey=${encodeURIComponent(itemKeyOf('Bebidas', 'Coca-Cola'))}`), P)).json()
    expect(hist.history[0].changes[0]).toMatchObject({ label: 'Precio', before: $(5000), after: $(5500) })
  })

  it('varias sedes a la vez; deshacer vuelve exactamente a los precios anteriores', async () => {
    await signIn('manager')
    const { batch } = await (await batchesPOST(req('/batches', 'POST', { ...bebidas10([loc1, loc2]), mode: 'apply' }), P)).json()
    expect((await priceOf(loc2, 0, 1)).takeawayPrice).toBe($(3900))
    const undo = await batchPOST(req(`/batches/${batch._id}`, 'POST', { action: 'revert' }), { params: Promise.resolve({ tenant: SLUG, batchId: batch._id }) })
    expect(undo.status).toBe(200)
    expect((await priceOf(loc1, 0, 0)).price).toBe($(5000))
    expect((await priceOf(loc2, 0, 1)).takeawayPrice).toBe($(3500))
  })

  it('deshacer no pisa un precio cambiado después', async () => {
    await signIn('admin')
    const { batch } = await (await batchesPOST(req('/batches', 'POST', { ...bebidas10(), mode: 'apply' }), P)).json()
    await Menu.updateOne({ tenantId, locationId: loc1 }, { $set: { 'categories.0.items.0.price': $(6000) } })
    const undo = await batchPOST(req(`/batches/${batch._id}`, 'POST', { action: 'revert' }), { params: Promise.resolve({ tenant: SLUG, batchId: batch._id }) })
    expect(undo.status).toBe(409)
    expect((await undo.json()).conflicts[0].itemName).toBe('Coca-Cola')
    expect((await priceOf(loc1, 0, 1)).price).toBe($(3300)) // no deshizo nada
  })
})

describe('permisos: el Cajero propone, Administrador o Manager aprueban', () => {
  it('cajero → pendiente sin tocar la carta; manager aprueba y se aplica', async () => {
    const cashier = await signIn('cashier')
    const { batch } = await (await batchesPOST(req('/batches', 'POST', { ...bebidas10(), mode: 'apply' }), P)).json()
    expect(batch.status).toBe('pending_approval')
    expect(batch.createdBy.userId).toBe(String(cashier._id))
    expect((await priceOf(loc1, 0, 0)).price).toBe($(5000))
    const ctx = { params: Promise.resolve({ tenant: SLUG, batchId: batch._id }) }
    expect((await batchPOST(req(`/batches/${batch._id}`, 'POST', { action: 'approve' }), ctx)).status).toBe(403)

    await signIn('manager')
    const ok = await (await batchPOST(req(`/batches/${batch._id}`, 'POST', { action: 'approve' }), ctx)).json()
    expect(ok.batch.status).toBe('applied')
    expect((await priceOf(loc1, 0, 0)).price).toBe($(5500))
  })

  it('rechazar; aprobar un cambio viejo cuando la carta cambió → falla sin escribir', async () => {
    await signIn('cashier')
    const a = (await (await batchesPOST(req('/batches', 'POST', bebidas10()), P)).json()).batch
    const b = (await (await batchesPOST(req('/batches', 'POST', bebidas10()), P)).json()).batch
    await signIn('admin')
    const rej = await (await batchPOST(req(`/batches/${a._id}`, 'POST', { action: 'reject', reason: 'No' }), { params: Promise.resolve({ tenant: SLUG, batchId: a._id }) })).json()
    expect(rej.batch.status).toBe('rejected')
    await Menu.updateOne({ tenantId, locationId: loc1 }, { $set: { 'categories.0.items.0.price': $(5100) } })
    const ap = await batchPOST(req(`/batches/${b._id}`, 'POST', { action: 'approve' }), { params: Promise.resolve({ tenant: SLUG, batchId: b._id }) })
    expect(ap.status).toBe(409)
    expect((await PriceChangeBatch.findById(b._id).lean())?.status).toBe('failed')
    expect((await priceOf(loc1, 0, 1)).price).toBe($(3000))
  })

  it('otros roles (mozo, gerente de operaciones) no usan la herramienta', async () => {
    for (const role of ['staff', 'operations_manager']) {
      await signIn(role)
      expect((await previewPOST(req('/preview', 'POST', bebidas10()), P)).status).toBe(403)
    }
  })
})

describe('programar', () => {
  it('queda programado y el cron lo aplica cuando llega la hora', async () => {
    await signIn('admin')
    const at = new Date(Date.now() + 3_600_000).toISOString()
    const { batch } = await (await batchesPOST(req('/batches', 'POST', { ...bebidas10(), mode: 'schedule', scheduledFor: at }), P)).json()
    expect(batch.status).toBe('scheduled')
    expect(await runScheduledBatches(new Date())).toEqual([])
    const done = await runScheduledBatches(new Date(Date.now() + 2 * 3_600_000))
    expect(done[0].status).toBe('applied')
    expect((await priceOf(loc1, 0, 0)).price).toBe($(5500))
    const past = await batchesPOST(req('/batches', 'POST', { ...bebidas10(), mode: 'schedule', scheduledFor: new Date(Date.now() - 1000).toISOString() }), P)
    expect(past.status).toBe(400)
  })
})

describe('planilla Excel', () => {
  it('descargar, completar «Precio nuevo» y subir: devuelve ajustes a mano para la vista previa', async () => {
    await signIn('admin')
    const res = await exportGET(req(`/export?locationId=${loc1}`), P)
    expect(res.headers.get('content-type')).toContain('spreadsheetml')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    ws.getRow(3).getCell(5).value = 6200 // Coca-Cola
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'precios.xlsx')
    form.set('locationId', loc1)
    const imp = await importPOST(new NextRequest(`http://localhost/api/${SLUG}/menu/prices/import`, { method: 'POST', body: form }), P)
    const data = await imp.json()
    expect(data.rows).toBe(1)
    expect(data.overrides[itemKeyOf('Bebidas', 'Coca-Cola')]).toEqual({ price: $(6200) })
  })
})

describe('desde una foto de la carta (IA simulada)', () => {
  it('valida claves y precios; los platos que no están vuelven como faltantes', async () => {
    await signIn('admin')
    process.env.ANTHROPIC_API_KEY = 'test'
    __setPriceImageClientForTests({
      beta: { messages: { create: vi.fn().mockResolvedValue({
        stop_reason: 'end_turn', model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify({ matches: [{ id: 1, price: 5900, takeawayPrice: null }, { id: 99, price: 1 }, { id: 3, price: -5 }], missing: [{ name: 'Soju', price: 15000, category: 'Bebidas' }] }) }],
      }) } },
    })
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'carta.png')
    form.set('locationId', loc1)
    const res = await imagePOST(new NextRequest(`http://localhost/api/${SLUG}/menu/prices/from-image`, { method: 'POST', body: form }), P)
    const data = await res.json()
    expect(Object.keys(data.overrides)).toEqual([itemKeyOf('Bebidas', 'Coca-Cola')])
    expect(data.missing).toEqual([{ name: 'Soju', price: $(15000), category: 'Bebidas' }])
    __setPriceImageClientForTests(null)
    delete process.env.ANTHROPIC_API_KEY

    await signIn('cashier') // el cajero no usa la lectura con IA (gasta API)
    expect((await imagePOST(new NextRequest(`http://localhost/api/${SLUG}/menu/prices/from-image`, { method: 'POST', body: new FormData() }), P)).status).toBe(403)
  })
})

describe('fase 0: editar un plato mueve también el precio de lista', () => {
  it('después de subir y bajar el precio no queda un tachado falso', async () => {
    await signIn('admin')
    const m = await Menu.findOne({ tenantId, locationId: loc1 }).lean() as unknown as { categories: { _id: unknown; items: { _id: unknown }[] }[] }
    const catId = String(m.categories[0]._id), itemId = String(m.categories[0].items[0]._id)
    const put = (price: number) => itemPUT(new NextRequest(`http://localhost/api/${SLUG}/menu/categories/${catId}/items`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locationId: loc1, itemId, price }) }), { params: Promise.resolve({ tenant: SLUG, categoryId: catId }) })
    expect((await put($(8000))).status).toBe(200)
    expect((await put($(6000))).status).toBe(200)
    const coca = await priceOf(loc1, 0, 0)
    expect([coca.price, coca.originalPrice]).toEqual([$(6000), $(6000)])
  })
})
