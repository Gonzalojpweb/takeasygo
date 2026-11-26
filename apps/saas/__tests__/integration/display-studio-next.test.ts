// ============================================================================
// display-studio-next.test.ts — Display Studio «próximo nivel»
// ============================================================================
// · Carta vinculada: toda la carta / por categorías / elegidos, cambios
//   manuales, badges (destacado, nuevo, más vendido), precio tachado,
//   agotados ocultos o marcados, se actualiza sola al cambiar la carta.
// · Platos fijos vinculados (slots) y fotos de la carta del comercio.
// · Colecciones: desbloquean todas sus plantillas.
// · Secuencias: 2 a 5 pasos, misma orientación, pasos Premium bloqueados se
//   saltean, duración total.
// · Proof of play: inicio/fin por pieza y por paso, validación y reporte.
// Datos ficticios.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/lib/display/fonts', async (orig) => ({ ...(await orig<typeof import('@/lib/display/fonts')>()), resolveGoogleFonts: vi.fn(async (fams: string[]) => Object.fromEntries(fams.map((f) => [f, `https://fonts.gstatic.com/s/${f.toLowerCase().replace(/ /g, '')}/v1/a.woff2`]))) }))
vi.mock('@/lib/media/ads', async (orig) => ({ ...(await orig<typeof import('@/lib/media/ads')>()), markSaved: vi.fn(async () => {}) }))
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: vi.fn(async () => {}) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import DisplayDevice from '@/models/DisplayDevice'
import DisplayPlayLog from '@/models/DisplayPlayLog'
import DisplayTemplatePurchase, { unlockedTemplateIds } from '@/models/DisplayTemplatePurchase'
import { POST as createTemplate } from '@/app/api/[tenant]/screen-pieces/templates/route'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { GET as library } from '@/app/api/[tenant]/display-studio/route'
import { GET as playback } from '@/app/api/[tenant]/displays/playback/route'
import { auth } from '@/lib/auth'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'
import { STUDIO_COLLECTIONS, expandUnlocked, studioDefaults, studioTemplate, parseStudioConfig } from '@/lib/display/studio/catalog'
import { ingestScreenStats } from '@/lib/display/stats'

const oid = () => new mongoose.Types.ObjectId()
const ids = { burgers: oid(), bebidas: oid(), doble: oid(), simple: oid(), pausada: oid(), coca: oid() }
const menuImg = (n: string) => `https://res.cloudinary.com/tgo/image/upload/v1/menus/${n}.png`
let A: any, loc: any, token: string, device: any
const own = (n: string) => `https://res.cloudinary.com/tgoads/image/upload/v1/ads/t-${A._id}/studio/${crypto.createHash('md5').update(n).digest('hex').slice(0, 18)}.png`

beforeEach(async () => {
  vi.clearAllMocks()
  delete process.env.DISPLAY_STUDIO_ENABLED
  Object.assign(process.env, { CLOUDINARY_ADS_CLOUD_NAME: 'tgoads', CLOUDINARY_ADS_API_KEY: '123456789012345', CLOUDINARY_ADS_API_SECRET: 'secreto-de-prueba-27-chars!', CLOUDINARY_ADS_FOLDER_ROOT: 'ads' })
  A = await Tenant.create({ slug: 'dn-a', name: 'Bodegón Demo', isActive: true, status: 'active', plan: 'high', branding: { primaryColor: '#AA3311' } })
  loc = await Location.create({ tenantId: A._id, slug: 'n1', name: 'N1', address: 'x', isActive: true })
  await Menu.create({ tenantId: A._id, locationId: loc._id, isActive: true, categories: [
    { _id: ids.burgers, name: 'Burgers', sortOrder: 0, items: [
      { _id: ids.doble, name: 'Doble', description: 'Doble carne', price: 1500000, originalPrice: 1800000, imageUrl: menuImg('doble'), isAvailable: true, isFeatured: true },
      { _id: ids.simple, name: 'Simple', price: 1200000, imageUrl: menuImg('simple'), isAvailable: true, tags: ['Nuevo'] },
      { _id: ids.pausada, name: 'Pausada', price: 900000, isAvailable: false, pausedReason: 'stock' },
    ] },
    { _id: ids.bebidas, name: 'Bebidas', sortOrder: 1, items: [{ _id: ids.coca, name: 'Gaseosa', price: 300000, isAvailable: true }] },
  ] })
  token = generateDisplayToken()
  device = await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: loc._id, name: 'Tótem', orientation: 'portrait', tokenHash: hashDisplayToken(token) })
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin', tenantId: String(A._id), assignedLocations: [] }, expires: '' } as any)
  await DisplayTemplatePurchase.create({ tenantId: A._id, templateId: 'carta-lista', status: 'approved', source: 'manual' })
})

const p = { params: Promise.resolve({ tenant: 'dn-a' }) }
const post = (body: unknown) => createTemplate(new NextRequest('http://localhost/api/dn-a/screen-pieces/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), p)
const getManifest = async () => (await manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}` } }))).json()
const studio = (templateId: string, values: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  title: `Pieza ${templateId}`, locationId: String(loc._id), isActive: true,
  template: { kind: 'studio', config: { templateId, orientation: 'portrait', designWidth: 1080, designHeight: 1920, values: { ...studioDefaults(studioTemplate(templateId)!), ...values }, ...extra } },
})
const tpl = (m: any, kind = 'studio') => m.items.find((i: any) => i.template?.kind === kind)?.template

describe('carta vinculada', () => {
  it('«Toda la carta»: platos disponibles en orden, con badges, precio tachado y sin pausados', async () => {
    expect((await post(studio('carta-lista', { productIdsMode: 'all' }))).status).toBe(201)
    const items = tpl(await getManifest()).values.__items
    expect(items.map((i: any) => i.name)).toEqual(['Doble', 'Simple', 'Gaseosa'])
    expect(items[0]).toMatchObject({ price: 1500000, originalPrice: 1800000, badges: ['featured'], available: true })
    expect(items[1].badges).toEqual(['new'])
    expect(items[2].image).toBeNull()
  })

  it('por categorías y con agotados marcados', async () => {
    await post(studio('carta-lista', { productIdsMode: 'all', productIdsCategories: [String(ids.burgers)], productIdsUnavailable: 'mark' }))
    const items = tpl(await getManifest()).values.__items
    expect(items.map((i: any) => [i.name, i.available])).toEqual([['Doble', true], ['Simple', true], ['Pausada', false]])
  })

  it('elegidos con cambios manuales (nombre, precio, foto propia) y el resto sigue a la carta', async () => {
    await post(studio('carta-lista', { productIds: [String(ids.simple), String(ids.doble)], productIdsOverrides: { [String(ids.simple)]: { name: 'La Simple', price: 999900, url: own('simple-propia'), cutout: true } } }))
    const items = tpl(await getManifest()).values.__items
    expect(items.map((i: any) => i.name)).toEqual(['La Simple', 'Doble'])
    expect(items[0]).toMatchObject({ price: 999900, originalPrice: null, cutout: true })
    expect(items[0].image).toContain('/studio/')
    expect(items[1].price).toBe(1500000)
  })

  it('se actualiza sola: si cambia el precio o se pausa en la carta, el próximo manifiesto lo refleja', async () => {
    await post(studio('carta-lista', { productIds: [String(ids.doble), String(ids.simple)] }))
    await Menu.updateOne({ tenantId: A._id }, { $set: { 'categories.0.items.0.price': 1600000, 'categories.0.items.1.isAvailable': false } })
    const items = tpl(await getManifest()).values.__items
    expect(items.map((i: any) => [i.name, i.price])).toEqual([['Doble', 1600000]])
  })

  it('lista larga: se reparte en páginas y la pieza dura pageMs × páginas', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ _id: oid(), name: `Plato ${i + 1}`, price: 100000 + i, isAvailable: true }))
    await Menu.updateOne({ tenantId: A._id }, { $push: { categories: { _id: oid(), name: 'Más', sortOrder: 2, items: many } } })
    await post(studio('carta-lista', { productIdsMode: 'all' }, { pageSeconds: 10 }))
    const m = await getManifest()
    const t = tpl(m)
    expect(t.values.__items).toHaveLength(28)
    expect(t.pages).toBe(3)
    expect(m.items[0].durationMs).toBe(30000)
  })

  it('plato fijo vinculado: lo vacío sale de la carta, lo escrito a mano gana; agotado se avisa', async () => {
    const t = studioTemplate('sandwich-board')!
    const values = { ...studioDefaults(t), p1Product: String(ids.doble), item1Name: '', item1Desc: '', item1Price: null, image1: '', item2Name: 'Mi especial' }
    expect(parseStudioConfig({ templateId: t.id, values })).not.toBeNull()
    expect((await post(studio('sandwich-board', values))).status).toBe(201)
    let v = tpl(await getManifest()).values
    expect(v).toMatchObject({ item1Name: 'Doble', item1Desc: 'Doble carne', item1Price: 1500000, item2Name: 'Mi especial' })
    expect(v.image1).toContain('/menus/doble')
    expect(v.__slots.p1).toMatchObject({ badges: ['featured'], originalPrice: 1800000, soldOut: false })
    await Menu.updateOne({ tenantId: A._id }, { $set: { 'categories.0.items.0.isAvailable': false } })
    v = tpl(await getManifest()).values
    expect(v.__slots.p1.soldOut).toBe(true)
  })

  it('una foto de un plato de la carta del comercio se acepta; otra URL externa no', async () => {
    expect((await post(studio('golden-bites', { image: menuImg('doble') }))).status).toBe(201)
    expect((await post(studio('golden-bites', { image: 'https://res.cloudinary.com/tgo/image/upload/v1/menus/ajena.png' }))).status).toBe(400)
  })
})

describe('colecciones', () => {
  it('una colección desbloquea todas sus plantillas (y la biblioteca la marca como tuya)', async () => {
    expect([...expandUnlocked(['col-cafeteria'])].sort()).toEqual(['carta-lista', 'chocolate-croissant', 'menu-ejecutivo'])
    expect((await post(studio('chocolate-croissant', { image: own('c') }))).status).toBe(402)
    await DisplayTemplatePurchase.create({ tenantId: A._id, templateId: 'col-cafeteria', status: 'approved', source: 'manual' })
    expect((await unlockedTemplateIds(A._id)).has('chocolate-croissant')).toBe(true)
    expect((await post(studio('chocolate-croissant', { image: own('c') }))).status).toBe(201)
    const lib = await (await library(new NextRequest('http://localhost/api/dn-a/display-studio'), p)).json()
    expect(lib.collections.find((c: any) => c.id === 'col-cafeteria')).toMatchObject({ owned: true })
    for (const c of STUDIO_COLLECTIONS) expect(c.priceUsd).toBeGreaterThanOrEqual(25)
  })
})

describe('secuencias', () => {
  const makeSteps = async () => {
    const a = await (await post({ ...studio('golden-bites', { image: own('a') }), isActive: false })).json()
    const b = await (await post({ ...studio('carta-lista', { productIdsMode: 'all' }), isActive: false })).json()
    return [a.piece?._id ?? a._id, b.piece?._id ?? b._id]
  }
  const seq = (steps: Array<{ pieceId: string; durationS?: number; transition?: string }>, extra: Record<string, unknown> = {}) => ({
    title: 'Secuencia', locationId: String(loc._id), isActive: true, template: { kind: 'sequence', config: { orientation: 'portrait', loops: 2, steps, ...extra } },
  })

  it('encadena pasos (aunque estén en pausa sueltos) y dura la suma × repeticiones', async () => {
    const [a, b] = await makeSteps()
    expect(a && b).toBeTruthy()
    expect((await post(seq([{ pieceId: a, durationS: 5, transition: 'wipe' }, { pieceId: b, durationS: 7, transition: 'scale' }]))).status).toBe(201)
    const m = await getManifest()
    const s = tpl(m, 'sequence')
    expect(s.steps.map((x: any) => [x.board.templateId, x.durationMs, x.transition])).toEqual([['golden-bites', 5000, 'wipe'], ['carta-lista', 7000, 'scale']])
    expect(m.items.find((i: any) => i.template?.kind === 'sequence').durationMs).toBe(24000)
  })

  it('un paso Premium sin desbloquear se saltea en la pantalla', async () => {
    const [a, b] = await makeSteps()
    await post(seq([{ pieceId: a }, { pieceId: b }]))
    await DisplayTemplatePurchase.updateOne({ tenantId: A._id, templateId: 'carta-lista' }, { $set: { status: 'refunded' } })
    const s = tpl(await getManifest(), 'sequence')
    expect(s.steps.map((x: any) => x.board.templateId)).toEqual(['golden-bites'])
  })

  it('valida: 2 a 5 pasos, sin repetir, de este comercio y con la misma orientación', async () => {
    const [a] = await makeSteps()
    const land = await (await post({ ...studio('golden-bites', { image: own('l') }, { orientation: 'landscape', designWidth: 1920, designHeight: 1080 }), isActive: false })).json()
    expect((await post(seq([{ pieceId: a }]))).status).toBe(400)
    expect((await post(seq([{ pieceId: a }, { pieceId: a }]))).status).toBe(400)
    expect((await post(seq([{ pieceId: a }, { pieceId: String(oid()) }]))).status).toBe(400)
    expect((await post(seq([{ pieceId: a }, { pieceId: land.piece?._id ?? land._id }]))).status).toBe(400)
  })
})

describe('proof of play', () => {
  const batch = (pieceId: string, proofs: any[], startOffset = 10 * 60_000) => {
    const end = Date.now()
    return { batchId: crypto.randomBytes(8).toString('hex'), windowStart: new Date(end - startOffset).toISOString(), windowEnd: new Date(end).toISOString(), items: [{ pieceId, plays: 2, playMs: 20_000, errors: 0 }], proofs }
  }
  it('registra inicio y fin por pieza y por paso, y el reporte los muestra', async () => {
    const r = await (await post(studio('golden-bites', { image: own('pp') }))).json()
    const pieceId = r.piece?._id ?? r._id
    const t0 = Date.now() - 5 * 60_000
    const res = await ingestScreenStats(device, batch(pieceId, [
      { pieceId, step: null, startedAt: new Date(t0).toISOString(), endedAt: new Date(t0 + 12_000).toISOString() },
      { pieceId, step: 0, startedAt: new Date(t0).toISOString(), endedAt: new Date(t0 + 6_000).toISOString() },
    ]) as any)
    expect(res).toMatchObject({ ok: true })
    expect(await DisplayPlayLog.countDocuments({ tenantId: A._id })).toBe(2)
    const rep = await (await playback(new NextRequest('http://localhost/api/dn-a/displays/playback?days=1'), p)).json()
    expect(rep.pieces[0]).toMatchObject({ plays: 1, seconds: 12, screens: 1, steps: [{ step: 0, plays: 1, seconds: 6 }] })
    expect(rep.screens[0]).toMatchObject({ name: 'Tótem', activePieces: 1 })
    expect(rep.recent).toHaveLength(1)
  })

  it('una reproducción fuera de la ventana o de otra pieza descarta el lote', async () => {
    const r = await (await post(studio('golden-bites', { image: own('pq') }))).json()
    const pieceId = r.piece?._id ?? r._id
    const old = Date.now() - 3 * 60 * 60_000
    expect(await ingestScreenStats(device, batch(pieceId, [{ pieceId, step: null, startedAt: new Date(old).toISOString(), endedAt: new Date(old + 1000).toISOString() }]) as any)).toMatchObject({ ok: false })
    const now = Date.now() - 60_000
    expect(await ingestScreenStats(device, batch(pieceId, [{ pieceId: String(oid()), step: null, startedAt: new Date(now).toISOString(), endedAt: new Date(now + 1000).toISOString() }]) as any)).toMatchObject({ ok: false })
  })
})
