// ============================================================================
// screen-board.test.ts — Pantallas: solo Élite + carta en pantalla (22/11/2026)
// ============================================================================
// · Sin plan Élite: el panel y las APIs responden 403; el manifiesto responde
//   «en pausa» sin contenido y SIN borrar pantallas ni piezas. Al volver a
//   Élite, todo sigue igual.
// · Carta: pieza automática de una sede (misma lista que las subidas) que el
//   manifiesto arma con la carta de la sede del equipo: categorías elegidas y
//   en su orden, precio de salón o retiro, «desde» con variantes, estado de
//   pausa y horarios para que la pantalla los evalúe sola; fotos y logo en
//   tamaño fijo para guardarlas. Un cambio de precio cambia el ETag.
// · La pantalla puede desvincularse sola.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import AppStory from '@/models/AppStory'
import DisplayDevice from '@/models/DisplayDevice'
import { GET as listPieces } from '@/app/api/[tenant]/screen-pieces/route'
import { GET as listCategories, POST as createTemplate } from '@/app/api/[tenant]/screen-pieces/templates/route'
import { PATCH as patchPiece } from '@/app/api/[tenant]/screen-pieces/[pieceId]/route'
import { GET as listDisplays } from '@/app/api/[tenant]/displays/route'
import { POST as claim } from '@/app/api/[tenant]/displays/claim/route'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { POST as unlink } from '@/app/api/display/unlink/route'
import { auth } from '@/lib/auth'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'
import { buildMenuBoard, boardImageUrl, menuConfigSchema } from '@/lib/display/templates'

let A: any, locA1: any, locA2: any, token: string, device: any, menu: any
const oid = () => new mongoose.Types.ObjectId()
const ids = { bebidas: oid(), pizzas: oid(), postres: oid(), apagada: oid(), sub: oid(), coca: oid(), agua: oid(), muzza: oid(), fugazza: oid(), flan: oid(), noche: oid() }

const img = (name: string) => `https://res.cloudinary.com/tgo/image/upload/v1/menus/${name}.jpg`

beforeEach(async () => {
  vi.clearAllMocks()
  A = await Tenant.create({ slug: 'sb-a', name: 'Pizzería A', isActive: true, status: 'active', plan: 'high', branding: { logoUrl: img('logo'), primaryColor: '#123456' } })
  locA1 = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  locA2 = await Location.create({ tenantId: A._id, slug: 'a2', name: 'A2', address: 'x', isActive: true })
  menu = await Menu.create({
    tenantId: A._id, locationId: locA1._id, isActive: true,
    categories: [
      { _id: ids.bebidas, name: 'Bebidas', sortOrder: 2, items: [
        { _id: ids.coca, name: 'Coca', price: 150000, takeawayPrice: 140000, imageUrl: img('coca'), isAvailable: true },
        { _id: ids.agua, name: 'Agua', price: 90000, isAvailable: false, pausedReason: 'stock', isTakeawayAvailable: false },
      ] },
      { _id: ids.pizzas, name: 'Pizzas', sortOrder: 1, items: [
        { _id: ids.muzza, name: 'Muzza', price: 900000, originalPrice: 1000000, imageUrl: img('muzza'), isAvailable: true, isFeatured: true,
          variants: [{ name: 'Chica', price: 700000 }, { name: 'Grande', price: 900000 }] },
        { _id: ids.noche, name: 'Especial noche', price: 1200000, isAvailable: true, availabilityMode: 'scheduled', availabilitySchedule: [{ days: [5, 6], timeStart: '20:00', timeEnd: '02:00' }] },
      ], subcategories: [{ _id: ids.sub, name: 'Al molde', sortOrder: 0, items: [{ _id: ids.fugazza, name: 'Fugazza', price: 950000, isAvailable: true }] }] },
      { _id: ids.postres, name: 'Postres', sortOrder: 3, availabilityMode: 'scheduled', availabilitySchedule: [{ days: [0, 1, 2, 3, 4, 5, 6], timeStart: '12:00', timeEnd: '16:00' }], items: [
        { _id: ids.flan, name: 'Flan', description: 'Con dulce de leche', price: 300000, isAvailable: true },
      ] },
      { _id: ids.apagada, name: 'Apagada', sortOrder: 0, isAvailable: false, items: [{ name: 'Oculto', price: 1000, isAvailable: true }] },
    ],
  })
  token = generateDisplayToken()
  device = await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: locA1._id, name: 'TV', orientation: 'landscape', tokenHash: hashDisplayToken(token) })
})

const asUser = (role: string, tenant: any, locs: any[] = []) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role, tenantId: String(tenant._id), assignedLocations: locs.map((l) => String(l._id)) }, expires: '' } as any)
const p = (slug: string) => ({ params: Promise.resolve({ tenant: slug }) })
const json = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
const getManifest = (headers: Record<string, string> = {}) =>
  manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}`, ...headers } }))
const createBoard = (body: Record<string, unknown>) => createTemplate(json('/api/sb-a/screen-pieces/templates', 'POST', body), p('sb-a'))
const board = (config: Record<string, unknown> = {}) => ({ title: 'Carta', locationId: String(locA1._id), template: { kind: 'menu', config } })

describe('solo plan Élite', () => {
  it('sin Élite: panel y APIs → 403; con Élite → 200', async () => {
    asUser('admin', A)
    expect((await listPieces(json('/api/sb-a/screen-pieces', 'GET'), p('sb-a'))).status).toBe(200)
    await Tenant.updateOne({ _id: A._id }, { plan: 'full' })
    const r = await listPieces(json('/api/sb-a/screen-pieces', 'GET'), p('sb-a'))
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('plan_required')
    expect((await listDisplays(json('/api/sb-a/displays', 'GET'), p('sb-a'))).status).toBe(403)
    expect((await claim(json('/api/sb-a/displays/claim', 'POST', { code: 'ABCDEF', locationId: String(locA1._id), name: 'X', orientation: 'landscape' }), p('sb-a'))).status).toBe(403)
    expect((await createBoard(board())).status).toBe(403)
  })

  it('bajada de plan: el manifiesto pausa sin contenido y no borra nada; al volver a Élite sigue igual', async () => {
    asUser('admin', A)
    expect((await createBoard(board())).status).toBe(201)
    await Tenant.updateOne({ _id: A._id }, { plan: 'buy' })
    const res = await getManifest()
    expect(res.status).toBe(200)
    const m = await res.json()
    expect(m).toMatchObject({ paused: 'plan', items: [] })
    expect((await getManifest({ 'if-none-match': m.version })).status).toBe(304)
    expect(await AppStory.countDocuments({ 'owner.tenantId': A._id, surfaces: 'screen' })).toBe(1)
    expect((await DisplayDevice.findById(device._id).lean() as any).status).toBe('active')
    await Tenant.updateOne({ _id: A._id }, { plan: 'high' })
    const back = await (await getManifest()).json()
    expect(back.paused).toBeUndefined()
    expect(back.items).toHaveLength(1)
  })
})

describe('carta en pantalla', () => {
  it('categorías de la sede para configurar (sede fuera del alcance → 404)', async () => {
    asUser('admin', A)
    const r = await (await listCategories(json(`/api/sb-a/screen-pieces/templates?locationId=${locA1._id}`, 'GET'), p('sb-a'))).json()
    expect(r.categories.map((c: any) => c.name)).toEqual(['Apagada', 'Pizzas', 'Bebidas', 'Postres'])
    expect(r.categories.find((c: any) => c.name === 'Pizzas').products).toBe(3)
    asUser('manager', A, [locA2])
    expect((await listCategories(json(`/api/sb-a/screen-pieces/templates?locationId=${locA1._id}`, 'GET'), p('sb-a'))).status).toBe(404)
  })

  it('la carta es de una sede y entra en la misma lista que las piezas subidas', async () => {
    asUser('admin', A)
    expect((await createBoard({ ...board(), locationId: undefined })).status).toBe(400)
    const res = await createBoard(board({ categoryIds: [String(ids.bebidas), String(ids.pizzas)], unavailable: 'mark' }))
    expect(res.status).toBe(201)
    const { piece } = await res.json()
    expect(piece).toMatchObject({ kind: 'template', url: null, template: { kind: 'menu' } })
    const list = await (await listPieces(json('/api/sb-a/screen-pieces', 'GET'), p('sb-a'))).json()
    expect(list.pieces.map((x: any) => x.kind)).toEqual(['template'])
    const doc = await AppStory.findById(piece._id).lean() as any
    expect(doc.surfaces).toEqual(['screen'])
  })

  it('manifiesto: categorías elegidas en su orden, precios, «desde», tachado, agotado marcado, horarios y fotos', async () => {
    asUser('admin', A)
    await createBoard(board({ categoryIds: [String(ids.bebidas), String(ids.pizzas), String(ids.apagada)], unavailable: 'mark' }))
    const m = await (await getManifest()).json()
    expect(m.items).toHaveLength(1)
    const it0 = m.items[0]
    expect(it0.kind).toBe('template')
    const t = it0.template
    expect(t.sections.map((s: any) => s.name)).toEqual(['Bebidas', 'Pizzas', 'Al molde'])
    expect(t.sections[2].parent).toBe('Pizzas')
    const all = t.sections.flatMap((s: any) => s.products)
    const by = (n: string) => all.find((x: any) => x.name === n)
    expect(by('Coca')).toMatchObject({ price: 150000, available: true })
    expect(by('Agua')).toMatchObject({ available: false })
    expect(by('Muzza')).toMatchObject({ price: 700000, fromPrice: true, featured: true })
    expect(by('Especial noche').schedules).toEqual([[{ days: [5, 6], from: '20:00', to: '02:00' }]])
    expect(by('Coca').image).toBe('https://res.cloudinary.com/tgo/image/upload/c_fill,g_auto,w_480,h_480,q_auto,f_auto/v1/menus/coca.jpg')
    expect(t.brand).toMatchObject({ name: 'Pizzería A', primary: '#123456' })
    expect(it0.assets).toContain(t.brand.logo)
    expect(it0.assets).toContain(by('Coca').image)
    expect(all.find((x: any) => x.name === 'Oculto')).toBeUndefined()
  })

  it('un cambio de precio o una pausa cambia el ETag; sin cambios → 304', async () => {
    asUser('admin', A)
    await createBoard(board())
    const first = await getManifest()
    const etag = first.headers.get('etag')!
    expect((await getManifest({ 'if-none-match': etag })).status).toBe(304)
    await Menu.updateOne({ _id: menu._id }, { $set: { 'categories.0.items.0.price': 160000 } })
    const after = await getManifest({ 'if-none-match': etag })
    expect(after.status).toBe(200)
    const etag2 = after.headers.get('etag')!
    await Menu.updateOne({ _id: menu._id }, { $set: { 'categories.0.items.0.isAvailable': false } })
    expect((await getManifest({ 'if-none-match': etag2 })).status).toBe(200)
  })

  it('una pantalla de otra sede no recibe la carta de A1; editar la configuración por PATCH', async () => {
    asUser('admin', A)
    const { piece } = await (await createBoard(board())).json()
    await DisplayDevice.updateOne({ _id: device._id }, { locationId: locA2._id })
    expect((await (await getManifest()).json()).items).toHaveLength(0)
    const r = await patchPiece(json(`/api/sb-a/screen-pieces/${piece._id}`, 'PATCH', { template: { kind: 'menu', config: { style: 'dark', pageSeconds: 12 } } }), { params: Promise.resolve({ tenant: 'sb-a', pieceId: piece._id }) })
    expect(r.status).toBe(200)
    expect((await r.json()).piece.template.config).toMatchObject({ style: 'dark', pageSeconds: 12 })
    const bad = await patchPiece(json(`/api/sb-a/screen-pieces/${piece._id}`, 'PATCH', { locationId: null }), { params: Promise.resolve({ tenant: 'sb-a', pieceId: piece._id }) })
    expect(bad.status).toBe(400)
  })
})

describe('armado de la carta (puro)', () => {
  it('precio de retiro, sin productos que no se venden para llevar, descripción opcional', () => {
    const b = buildMenuBoard(menu.toObject(), A.toObject(), menuConfigSchema.parse({ priceChannel: 'takeaway', showDescriptions: true }))
    const all = b.sections.flatMap((s) => s.products)
    expect(all.find((x) => x.name === 'Coca')!.price).toBe(140000)
    expect(all.find((x) => x.name === 'Agua')).toBeUndefined()
    expect(all.find((x) => x.name === 'Flan')!.description).toBe('Con dulce de leche')
    expect(all.find((x) => x.name === 'Flan')!.schedules).toHaveLength(1)
    // Sin elegir categorías: todas las ofrecidas, en el orden de la carta.
    expect(b.sections.map((s) => s.name)).toEqual(['Pizzas', 'Al molde', 'Bebidas', 'Postres'])
  })

  it('fotos: Cloudinary recortada; otros sitios igual; http o vacío → sin foto', () => {
    expect(boardImageUrl('https://otro.com/a.jpg', 480, 480)).toBe('https://otro.com/a.jpg')
    expect(boardImageUrl('http://otro.com/a.jpg', 480, 480)).toBeNull()
    expect(boardImageUrl('', 480, 480)).toBeNull()
  })
})

describe('desvincular desde la pantalla', () => {
  it('revoca el token; repetir no falla', async () => {
    const req = () => new NextRequest('http://localhost/api/display/unlink', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    expect((await unlink(req())).status).toBe(200)
    const d = await DisplayDevice.findById(device._id).lean() as any
    expect(d.status).toBe('revoked')
    expect(d.tokenHash).toBeNull()
    expect((await getManifest()).status).toBe(401)
    expect(await (await unlink(req())).json()).toMatchObject({ ok: true, alreadyUnlinked: true })
  })
})
