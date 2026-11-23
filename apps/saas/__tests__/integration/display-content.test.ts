// ============================================================================
// display-content.test.ts — manifiesto, latido y estadísticas de pantallas
// ============================================================================
// · Una pantalla recibe SOLO piezas de pantalla de su comercio (todas las
//   sedes o la suya), vigentes y de su orientación. Nunca stories del menú ni
//   piezas de TakeasyGO; y una pieza de pantalla nunca aparece como story.
// · ETag/304. Latido saneado. Estadísticas con valores imposibles → 422.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import AppStory from '@/models/AppStory'
import DisplayDevice from '@/models/DisplayDevice'
import PlacementDailyStat from '@/models/PlacementDailyStat'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { POST as heartbeat } from '@/app/api/display/heartbeat/route'
import { POST as stats } from '@/app/api/display/stats/route'
import { GET as publicStories } from '@/app/api/app-stories/route'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'
import { impossibleReason } from '@/lib/display/stats'
import { ingestPlacementEvents } from '@/lib/placements/ingest'
import { buildMarketingReport } from '@/lib/placements/report'
import { effectiveSurfaces } from '@/lib/app-story-owner'
import { checkMedia } from '@/lib/media/spec'
import { screenUploadQuota } from '@/lib/display/quota'
import { decideDisplayCors, parseAllowedDisplayOrigins } from '@/lib/display-cors'
import { isReservedSlug } from '@/lib/reserved-slugs'

let A: any, B: any, locA1: any, locA2: any, token: string, device: any
const pieces: Record<string, any> = {}

const screenPiece = (tenantId: unknown, extra: Record<string, unknown> = {}) => ({
  title: 'P', surfaces: ['screen'], owner: { kind: 'tenant', tenantId, locationId: null },
  imageUrl: 'https://res.cloudinary.com/x/image/upload/ads/t/screen/a.jpg', isActive: true,
  media: { orientation: 'landscape', bytes: 1000 }, ...extra,
})

beforeEach(async () => {
  A = await Tenant.create({ slug: 'dc-a', name: 'A', isActive: true, status: 'active', plan: 'high' })
  B = await Tenant.create({ slug: 'dc-b', name: 'B', isActive: true, status: 'active', plan: 'high' })
  locA1 = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  locA2 = await Location.create({ tenantId: A._id, slug: 'a2', name: 'A2', address: 'x', isActive: true })
  token = generateDisplayToken()
  device = await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: locA1._id, name: 'TV', orientation: 'landscape', tokenHash: hashDisplayToken(token) })
  const now = Date.now()
  pieces.todas = await AppStory.create(screenPiece(A._id, { title: 'Todas las sedes' }))
  pieces.sede = await AppStory.create(screenPiece(A._id, { title: 'Sede A1', owner: { kind: 'tenant', tenantId: A._id, locationId: locA1._id } }))
  pieces.otraSede = await AppStory.create(screenPiece(A._id, { title: 'Sede A2', owner: { kind: 'tenant', tenantId: A._id, locationId: locA2._id } }))
  pieces.vertical = await AppStory.create(screenPiece(A._id, { title: 'Vertical', media: { orientation: 'portrait' } }))
  pieces.vencida = await AppStory.create(screenPiece(A._id, { title: 'Vencida', scheduledEnd: new Date(now - 60_000) }))
  pieces.pausada = await AppStory.create(screenPiece(A._id, { title: 'Pausada', isActive: false }))
  pieces.proxima = await AppStory.create(screenPiece(A._id, { title: 'Arranca mañana', scheduledStart: new Date(now + 86_400_000) }))
  pieces.lejana = await AppStory.create(screenPiece(A._id, { title: 'En un mes', scheduledStart: new Date(now + 30 * 86_400_000) }))
  pieces.deB = await AppStory.create(screenPiece(B._id, { title: 'De B' }))
  // Piezas existentes: stories (TakeasyGO y del comercio). Nunca en pantallas.
  await AppStory.collection.insertOne({ title: 'Story vieja', isActive: true, sortOrder: 0, scheduledStart: null, scheduledEnd: null })
  pieces.storyA = await AppStory.create({ title: 'Story de A', owner: { kind: 'tenant', tenantId: A._id }, surfaces: ['menu_story'] })
  await AppStory.create({ title: 'Story TGO', surfaces: ['menu_story', 'app_story'] })
})

const getManifest = (headers: Record<string, string> = {}) =>
  manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}`, ...headers } }))
const post = (fn: typeof stats, url: string, body: unknown) =>
  fn(new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('manifiesto', () => {
  it('solo piezas de pantalla del comercio, de todas las sedes o la suya, vigentes (o en los próximos 7 días) y de su orientación', async () => {
    const res = await getManifest()
    expect(res.status).toBe(200)
    const m = await res.json()
    const titles = (await AppStory.find({ _id: { $in: m.items.map((i: any) => i.id) } }).lean()).map((d: any) => d.title).sort()
    expect(titles).toEqual(['Arranca mañana', 'Sede A1', 'Todas las sedes'])
    expect(m).toMatchObject({ device: { name: 'TV', orientation: 'landscape' }, pollAfterS: 60 })
    expect(Date.parse(m.serverTime)).toBeGreaterThan(0)
    const proxima = m.items.find((i: any) => i.id === String(pieces.proxima._id))
    expect(proxima.startsAt).toBeTruthy()
  })

  it('las stories existentes (de TakeasyGO o del comercio) nunca aparecen en la pantalla', async () => {
    const m = await (await getManifest()).json()
    const ids = m.items.map((i: any) => i.id)
    expect(ids).not.toContain(String(pieces.storyA._id))
    expect(JSON.stringify(m)).not.toMatch(/Story/)
  })

  it('ETag + If-None-Match → 304; cambia si se edita una pieza', async () => {
    const r1 = await getManifest()
    const etag = r1.headers.get('etag')!
    expect(etag).toMatch(/^W\/"[a-f0-9]{24}"$/)
    expect((await getManifest({ 'if-none-match': etag })).status).toBe(304)
    await AppStory.updateOne({ _id: pieces.todas._id }, { $set: { title: 'Cambiada', updatedAt: new Date(Date.now() + 5000) } }, { timestamps: false })
    const r3 = await getManifest({ 'if-none-match': etag })
    expect(r3.status).toBe(200)
    expect(r3.headers.get('etag')).not.toBe(etag)
  })

  it('sin token, token inventado o pantalla revocada → 401', async () => {
    expect((await manifest(new NextRequest('http://localhost/api/display/manifest'))).status).toBe(401)
    expect((await manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${generateDisplayToken()}` } }))).status).toBe(401)
    await DisplayDevice.updateOne({ _id: device._id }, { $set: { status: 'revoked' } })
    expect((await getManifest()).status).toBe(401)
  })
})

describe('una pieza de pantalla nunca es story', () => {
  it('no sale en las stories del menú (ni del comercio, ni de TakeasyGO) y no suma métricas de story', async () => {
    const res = await publicStories(new NextRequest(`http://localhost/api/app-stories?surface=menu_story&tenant=dc-a&locationId=${locA1._id}`))
    const titles = ((await res.json()).stories as any[]).map((s) => s.title)
    expect(titles).toEqual(expect.arrayContaining(['Story vieja', 'Story de A', 'Story TGO']))
    expect(titles.some((t) => /Sede|Todas|Vertical|De B/.test(t))).toBe(false)
    expect((await publicStories(new NextRequest('http://localhost/api/app-stories?surface=screen'))).status).toBe(400)
    expect(effectiveSurfaces({ surfaces: ['screen'] })).toEqual([])
    const sid = '11111111-2222-3333-4444-555555555555'
    const r = await ingestPlacementEvents(sid, [
      { type: 'story_view', placement: 'menu_story', kind: 'app_story', pieceId: String(pieces.todas._id), tenantSlug: 'dc-a' },
      { type: 'impression', placement: 'screen' as any, kind: 'app_story', pieceId: String(pieces.todas._id) },
    ] as any)
    expect(r.accepted).toBe(0)
  })
})

describe('latido', () => {
  it('actualiza el estado y sanea el error (sin tokens ni parámetros de URL)', async () => {
    const res = await post(heartbeat, '/api/display/heartbeat', {
      appVersion: 'abc12345', manifestVersion: 'W/"x"', screen: { width: 1920, height: 1080 },
      cache: { items: 3, bytes: 1000, quotaBytes: 5000, persisted: true },
      lastError: { code: 'MEDIA_ERR_DECODE', message: `falló https://res.cloudinary.com/x/v.mp4?sig=secreto con ${token}` },
    })
    expect(res.status).toBe(200)
    const d = await DisplayDevice.findById(device._id).lean() as any
    expect(d.lastSeenAt).toBeTruthy()
    expect(d.appVersion).toBe('abc12345')
    expect(d.lastError.message).not.toContain('secreto')
    expect(d.lastError.message).not.toContain(token)
    expect((await post(heartbeat, '/api/display/heartbeat', { screen: { width: -1, height: 1 } })).status).toBe(400)
  })
})

describe('estadísticas', () => {
  const now = Date.now()
  const win = { windowStart: new Date(now - 15 * 60_000).toISOString(), windowEnd: new Date(now - 60_000).toISOString() }

  it('lote válido → contadores de pantalla con el comercio y la sede del EQUIPO; repetido → se ignora', async () => {
    const batch = { batchId: 'lote-0001', ...win, items: [{ pieceId: String(pieces.todas._id), plays: 30, playMs: 300_000, errors: 1 }] }
    const r = await post(stats, '/api/display/stats', batch)
    expect(r.status).toBe(200)
    expect((await r.json()).accepted).toBe(1)
    const doc = await PlacementDailyStat.findOne({ placement: 'screen' }).lean() as any
    expect(String(doc.tenantId)).toBe(String(A._id))
    expect(String(doc.locationId)).toBe(String(locA1._id))
    expect(doc.c).toMatchObject({ plays: 30, playMs: 300_000, errors: 1 })
    const dup = await post(stats, '/api/display/stats', batch)
    expect((await dup.json()).duplicate).toBe(true)
    expect(((await PlacementDailyStat.findOne({ placement: 'screen' }).lean()) as any).c.plays).toBe(30)

    const rep = await buildMarketingReport({ from: '2000-01-01', to: '2100-01-01', tenantId: String(A._id) })
    const row = rep.pieces.find((p) => p.placement === 'screen')!
    expect(row).toMatchObject({ plays: 30, playMs: 300_000, placementLabel: 'Pantallas', ctr: null })
  })

  it('valores imposibles, ventanas raras o piezas ajenas → 422 sin escribir nada', async () => {
    const id = String(pieces.todas._id)
    const bad = [
      { batchId: 'lote-imposible-a', ...win, items: [{ pieceId: id, plays: 1, playMs: 20 * 60_000, errors: 0 }] }, // más tiempo que la ventana
      { batchId: 'lote-imposible-b', ...win, items: [{ pieceId: id, plays: 500, playMs: 60_000, errors: 0 }] }, // más reproducciones que segundos
      { batchId: 'lote-imposible-c', windowStart: new Date(now - 2 * 3_600_000).toISOString(), windowEnd: new Date(now - 60_000).toISOString(), items: [] }, // > 1 h
      { batchId: 'lote-imposible-d', windowStart: new Date(now + 600_000).toISOString(), windowEnd: new Date(now + 900_000).toISOString(), items: [] }, // futuro
      { batchId: 'lote-imposible-e', windowStart: new Date(now - 72 * 3_600_000).toISOString(), windowEnd: new Date(now - 71.9 * 3_600_000).toISOString(), items: [] }, // > 48 h
      { batchId: 'lote-imposible-f', ...win, items: [{ pieceId: String(pieces.deB._id), plays: 1, playMs: 10_000, errors: 0 }] }, // pieza de otro comercio
      { batchId: 'lote-imposible-g', ...win, items: [{ pieceId: String(pieces.otraSede._id), plays: 1, playMs: 10_000, errors: 0 }] }, // otra sede
      { batchId: 'lote-imposible-h', ...win, items: [{ pieceId: String(pieces.storyA._id), plays: 1, playMs: 10_000, errors: 0 }] }, // una story
    ]
    for (const b of bad) expect((await post(stats, '/api/display/stats', b)).status).toBe(422)
    expect(await PlacementDailyStat.countDocuments()).toBe(0)
    expect(impossibleReason({ batchId: 'x'.repeat(8), ...win, items: [{ pieceId: id, plays: 2, playMs: 1500, errors: 0 }] })).toBeNull()
  })
})

describe('medidas, tope, CORS y slugs', () => {
  it('pantalla: video horizontal o vertical de 5 a 60 s y hasta 100 MB; imagen hasta 10 MB', () => {
    const v = { kind: 'video' as const, format: 'mp4', bytes: 50 * 1048576, width: 1920, height: 1080, duration: 45 }
    expect(checkMedia('screen', v)).toBeNull()
    expect(checkMedia('screen', { ...v, width: 1080, height: 1920 })).toBeNull()
    expect(checkMedia('screen', { ...v, duration: 61 })).toMatch(/máximo es 60 s/)
    expect(checkMedia('screen', { ...v, duration: 4 })).toMatch(/mínimo es 5 s/)
    expect(checkMedia('screen', { ...v, bytes: 120 * 1048576 })).toMatch(/100 MB/)
    expect(checkMedia('screen', { ...v, width: 1280, height: 600 })).toMatch(/1280×720/)
    expect(checkMedia('screen', { kind: 'image', format: 'jpg', bytes: 9 * 1048576, width: 1920, height: 1080 })).toBeNull()
    expect(checkMedia('screen', { kind: 'image', format: 'jpg', bytes: 11 * 1048576, width: 1920, height: 1080 })).toMatch(/10 MB/)
    // Las stories no cambian: 15 s y vertical.
    expect(checkMedia('story', { ...v, bytes: 1000, duration: 30 })).toMatch(/15 s/)
  })

  it('tope por comercio: 20 piezas activas', async () => {
    const q = screenUploadQuota(String(A._id))
    expect(await q(1000)).toBeNull()
    await AppStory.insertMany(Array.from({ length: 20 }, (_, i) => screenPiece(A._id, { title: `X${i}` })))
    expect(await q(1000)).toMatch(/máximo 20/)
    expect(await screenUploadQuota(String(B._id))(1000)).toBeNull() // B no se ve afectado
  })

  it('tope por comercio: 1,5 GB de biblioteca', async () => {
    await AppStory.create(screenPiece(A._id, { title: 'Grande', isActive: false, media: { orientation: 'landscape', bytes: 1.5 * 1073741824 - 500 } }))
    expect(await screenUploadQuota(String(A._id))(1000)).toMatch(/1,50 GB/)
  })

  it('CORS: solo display.takeasygo.com (y localhost fuera de producción); ajeno → 403', () => {
    const prod = parseAllowedDisplayOrigins('', { vercelEnv: 'production' })
    expect(prod).toEqual(['https://display.takeasygo.com'])
    expect(decideDisplayCors('OPTIONS', '/api/display/manifest', 'https://display.takeasygo.com', null, prod).kind).toBe('preflight')
    expect(decideDisplayCors('GET', '/api/display/manifest', 'https://malo.com', null, prod).kind).toBe('reject')
    expect(decideDisplayCors('GET', '/api/dc-a/menu', 'https://malo.com', null, prod).kind).toBe('not-applicable')
    const pre = decideDisplayCors('OPTIONS', '/api/display/stats', 'https://display.takeasygo.com', null, prod) as any
    expect(pre.headers['Access-Control-Allow-Headers']).toContain('If-None-Match')
    expect(pre.headers['Access-Control-Expose-Headers']).toContain('ETag')
  })

  it('slugs reservados', () => {
    for (const s of ['display', 'ads', 'publicidad', 'pantalla', 'pantallas']) expect(isReservedSlug(s)).toBe(true)
  })
})
