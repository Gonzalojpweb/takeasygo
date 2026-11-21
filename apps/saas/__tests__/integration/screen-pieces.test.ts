// ============================================================================
// screen-pieces.test.ts — contenido de pantallas del comercio (Entrega C)
// ============================================================================
// Sin aprobación, pero: el archivo tiene que ser de la carpeta de pantallas de
// ESTE comercio; tope 20 activas / 1,5 GB; sede del comercio y en alcance;
// franja horaria válida; nunca se vuelve story; el manifiesto lleva la franja
// y la zona horaria de la sede.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))
const destroyed = vi.hoisted(() => [] as string[])
vi.mock('@/lib/media/ads', async (orig) => {
  const real = await orig<typeof import('@/lib/media/ads')>()
  return {
    ...real,
    cloudinaryAdsApi: () => ({ resource: async () => null, destroy: async (pid: string) => { destroyed.push(pid) }, removePendingTag: async () => {} }),
    markSaved: async () => {},
  }
})

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import AppStory from '@/models/AppStory'
import DisplayDevice from '@/models/DisplayDevice'
import { GET as listPieces, POST as createPiece } from '@/app/api/[tenant]/screen-pieces/route'
import { PATCH as patchPiece, DELETE as deletePiece } from '@/app/api/[tenant]/screen-pieces/[pieceId]/route'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { GET as publicStories } from '@/app/api/app-stories/route'
import { auth } from '@/lib/auth'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'

let A: any, B: any, locA1: any, locA2: any, locB: any

beforeEach(async () => {
  vi.clearAllMocks()
  destroyed.length = 0
  Object.assign(process.env, { CLOUDINARY_ADS_CLOUD_NAME: 'tgoads', CLOUDINARY_ADS_API_KEY: '123456789012345', CLOUDINARY_ADS_API_SECRET: 'secreto-de-prueba-27-chars!', CLOUDINARY_ADS_FOLDER_ROOT: 'ads' })
  A = await Tenant.create({ slug: 'sp-a', name: 'A', isActive: true, status: 'active', plan: 'full' })
  B = await Tenant.create({ slug: 'sp-b', name: 'B', isActive: true, status: 'active', plan: 'full' })
  locA1 = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true, timezone: 'America/Argentina/Cordoba' })
  locA2 = await Location.create({ tenantId: A._id, slug: 'a2', name: 'A2', address: 'x', isActive: true })
  locB = await Location.create({ tenantId: B._id, slug: 'b1', name: 'B1', address: 'x', isActive: true })
})

const asUser = (role: string, tenant: any, locs: any[] = []) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role, tenantId: String(tenant._id), assignedLocations: locs.map((l) => String(l._id)) }, expires: '' } as any)
const media = (tenant: any, id = 'a'.repeat(18), extra: Record<string, unknown> = {}) => {
  const publicId = `ads/t-${tenant._id}/screen/${id}`
  return { kind: 'image', url: `https://res.cloudinary.com/tgoads/image/upload/c_limit,h_1920,q_auto,w_1920/v1/${publicId}.jpg`, publicId, width: 1920, height: 1080, bytes: 500_000, ...extra }
}
const p = (slug: string) => ({ params: Promise.resolve({ tenant: slug }) })
const create = (slug: string, body: Record<string, unknown>) =>
  createPiece(new NextRequest(`http://localhost/api/${slug}/screen-pieces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), p(slug))
const patch = (slug: string, id: string, body: Record<string, unknown>) =>
  patchPiece(new NextRequest(`http://localhost/api/${slug}/screen-pieces/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ tenant: slug, pieceId: id }) })

describe('crear', () => {
  it('pieza de imagen del comercio: queda como screen del comercio (nunca story) con su orientación', async () => {
    asUser('admin', A)
    const res = await create('sp-a', { title: 'Promo almuerzo', media: media(A), displayDurationMs: 12_000, daypart: { days: [1, 2, 3, 4, 5], from: '12:00', to: '15:30' } })
    expect(res.status).toBe(201)
    const doc = await AppStory.findOne({ title: 'Promo almuerzo' }).lean() as any
    expect(doc.surfaces).toEqual(['screen'])
    expect(String(doc.owner.tenantId)).toBe(String(A._id))
    expect(doc.owner.locationId).toBeNull()
    expect(doc.displayDurationMs).toBe(12_000)
    expect(doc.media).toMatchObject({ orientation: 'landscape', bytes: 500_000 })
    expect(doc.daypart).toMatchObject({ days: [1, 2, 3, 4, 5], from: '12:00', to: '15:30' })
    const stories = await (await publicStories(new NextRequest(`http://localhost/api/app-stories?surface=menu_story&tenant=sp-a`))).json()
    expect(stories.stories.map((s: any) => s.title)).not.toContain('Promo almuerzo')
  })

  it('archivo de otro comercio, de otra superficie o URL pegada → 400', async () => {
    asUser('admin', A)
    expect((await create('sp-a', { title: 'X', media: media(B) })).status).toBe(400)
    const story = { ...media(A), publicId: `ads/t-${A._id}/story/${'b'.repeat(18)}`, url: `https://res.cloudinary.com/tgoads/image/upload/v1/ads/t-${A._id}/story/${'b'.repeat(18)}.jpg` }
    expect((await create('sp-a', { title: 'X', media: story })).status).toBe(400)
    expect((await create('sp-a', { title: 'X', media: { ...media(A), url: 'https://otro.com/a.jpg' } })).status).toBe(400)
    expect(await AppStory.countDocuments({ surfaces: 'screen' })).toBe(0)
  })

  it('validaciones: franja incompleta, fin antes del inicio, sede de otro comercio', async () => {
    asUser('admin', A)
    expect((await create('sp-a', { title: 'X', media: media(A), daypart: { from: '12:00' } })).status).toBe(400)
    expect((await create('sp-a', { title: 'X', media: media(A), startsAt: '2026-12-02T10:00:00Z', endsAt: '2026-12-01T10:00:00Z' })).status).toBe(400)
    expect((await create('sp-a', { title: 'X', media: media(A), locationId: String(locB._id) })).status).toBe(404)
  })

  it('encargado de sede: solo para sus sedes (no «todas»), y no ve piezas de otra sede', async () => {
    asUser('admin', A)
    await create('sp-a', { title: 'De A2', media: media(A, 'c'.repeat(18)), locationId: String(locA2._id) })
    asUser('manager', A, [locA1])
    expect((await create('sp-a', { title: 'X', media: media(A) })).status).toBe(400)
    expect((await create('sp-a', { title: 'X', media: media(A), locationId: String(locA2._id) })).status).toBe(404)
    expect((await create('sp-a', { title: 'De A1', media: media(A), locationId: String(locA1._id) })).status).toBe(201)
    const list = await (await listPieces(new NextRequest('http://localhost/api/sp-a/screen-pieces'), p('sp-a'))).json()
    expect(list.pieces.map((x: any) => x.title)).toEqual(['De A1'])
  })

  it('tope de 20 activas (se puede crear pausada)', async () => {
    await AppStory.insertMany(Array.from({ length: 20 }, (_, i) => ({ title: `P${i}`, surfaces: ['screen'], owner: { kind: 'tenant', tenantId: A._id, locationId: null }, imageUrl: 'x', isActive: true, media: { bytes: 1 } })))
    asUser('admin', A)
    expect((await create('sp-a', { title: 'X', media: media(A) })).status).toBe(409)
    expect((await create('sp-a', { title: 'Pausada', media: media(A), isActive: false })).status).toBe(201)
    const pausada = await AppStory.findOne({ title: 'Pausada' })
    expect((await patch('sp-a', String(pausada!._id), { isActive: true })).status).toBe(409)
  })
})

describe('editar y borrar', () => {
  it('el comercio B no edita ni borra piezas de A; borrar elimina el archivo', async () => {
    asUser('admin', A)
    const created = await (await create('sp-a', { title: 'Mía', media: media(A) })).json()
    const id = created.piece._id
    asUser('admin', B)
    expect((await patch('sp-b', id, { title: 'Hackeada' })).status).toBe(404)
    expect((await deletePiece(new NextRequest(`http://localhost/api/sp-b/screen-pieces/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ tenant: 'sp-b', pieceId: id }) })).status).toBe(404)
    asUser('admin', A)
    expect((await patch('sp-a', id, { title: 'Renombrada', daypart: { days: [6], from: '20:00', to: '02:00' } })).status).toBe(200)
    expect(((await AppStory.findById(id).lean()) as any).title).toBe('Renombrada')
    expect((await deletePiece(new NextRequest(`http://localhost/api/sp-a/screen-pieces/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ tenant: 'sp-a', pieceId: id }) })).status).toBe(200)
    expect(await AppStory.countDocuments({ _id: id })).toBe(0)
    expect(destroyed).toEqual([`ads/t-${A._id}/screen/${'a'.repeat(18)}`])
  })

  it('cajero → sin acceso', async () => {
    asUser('cashier', A)
    expect((await create('sp-a', { title: 'X', media: media(A) })).status).toBeGreaterThanOrEqual(401)
  })
})

describe('manifiesto con franja y zona horaria', () => {
  it('lleva la franja de cada pieza y la zona horaria de la sede del equipo', async () => {
    asUser('admin', A)
    await create('sp-a', { title: 'Noche', media: media(A), daypart: { days: [5, 6], from: '20:00', to: '02:00' } })
    const token = generateDisplayToken()
    await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: locA1._id, name: 'TV', orientation: 'landscape', tokenHash: hashDisplayToken(token) })
    const m = await (await manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}` } }))).json()
    expect(m.timezone).toBe('America/Argentina/Cordoba')
    expect(m.items[0].daypart).toEqual({ days: [5, 6], from: '20:00', to: '02:00' })
    expect(m.items[0].url720).toContain('w_1280')
    expect(m.items[0].durationMs).toBe(10_000)
  })
})
