// ============================================================================
// placement-track.test.ts — métricas de stories y promociones (20/11/2026)
// ============================================================================
// Aislamiento multi-tenant: el comercio de cada contador lo decide el
// servidor; una pieza ajena, inexistente o de otra sede no suma.
// Privacidad: PlacementDailyStat sin IP, user agent, sesión ni teléfono;
// PlacementSeen solo hash + vencimiento.
// Deduplicación por sesión y día; día en hora de Argentina; límites del lote.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Promotion from '@/models/Promotion'
import AppStory from '@/models/AppStory'
import PlacementDailyStat from '@/models/PlacementDailyStat'
import PlacementSeen from '@/models/PlacementSeen'
import { POST as track } from '@/app/api/placements/track/route'
import { ingestPlacementEvents, dayInArgentina } from '@/lib/placements/ingest'
import { rateLimit } from '@/lib/rateLimit'

let A: any, B: any, locA: any, locB: any, promoA: any, promoB: any, globalAll: any, globalOnlyB: any, story: any
const SID = '11111111-2222-3333-4444-555555555555'
const SID2 = '99999999-2222-3333-4444-555555555555'

beforeEach(async () => {
  vi.mocked(rateLimit).mockResolvedValue({ success: true } as any)
  A = await Tenant.create({ slug: 'comercio-a', name: 'A', isActive: true, status: 'active', plan: 'full' })
  B = await Tenant.create({ slug: 'comercio-b', name: 'B', isActive: true, status: 'active', plan: 'full' })
  locA = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  locB = await Location.create({ tenantId: B._id, slug: 'b1', name: 'B1', address: 'x', isActive: true })
  const base = { scope: 'tenant', type: 'info', title: 'P', price: 0, isActive: true }
  promoA = await Promotion.create({ ...base, tenantId: A._id })
  promoB = await Promotion.create({ ...base, tenantId: B._id })
  globalAll = await Promotion.create({ scope: 'global', targetTenants: [], type: 'info', title: 'G', price: 0, isActive: true })
  globalOnlyB = await Promotion.create({ scope: 'global', targetTenants: [B._id], type: 'info', title: 'GB', price: 0, isActive: true })
  story = await AppStory.create({ title: 'S' })
})

const post = (body: unknown, ip = '10.0.0.1') =>
  track(new NextRequest('http://localhost/api/placements/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'user-agent': 'Mozilla/5.0 (iPhone)' },
    body: JSON.stringify(body),
  }))

const imp = (pieceId: string, tenantSlug?: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'impression', placement: 'menu_promo_card', kind: 'promotion', pieceId, tenantSlug, ...extra })

async function total(filter: Record<string, unknown> = {}) {
  const docs = await PlacementDailyStat.find(filter).lean()
  return docs.reduce((s, d: any) => s + (d.c?.impressions ?? 0), 0)
}

describe('aislamiento multi-tenant', () => {
  it('promo del comercio A informada en el menú de B → se descarta', async () => {
    const res = await post({ sid: SID, events: [imp(String(promoA._id), 'comercio-b')] })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ accepted: 0, rejected: 1 })
    expect(await PlacementDailyStat.countDocuments()).toBe(0)
  })

  it('promo propia en su menú → suma con el comercio del menú', async () => {
    await post({ sid: SID, events: [imp(String(promoA._id), 'comercio-a', { locationId: String(locA._id) })] })
    const doc = await PlacementDailyStat.findOne().lean() as any
    expect(String(doc.tenantId)).toBe(String(A._id))
    expect(String(doc.locationId)).toBe(String(locA._id))
    expect(doc.c).toMatchObject({ impressions: 1, impressionsUnique: 1 })
  })

  it('global sin destino vale en cualquier menú; global dirigida a B no vale en A', async () => {
    await post({ sid: SID, events: [imp(String(globalAll._id), 'comercio-a'), imp(String(globalOnlyB._id), 'comercio-a'), imp(String(globalOnlyB._id), 'comercio-b')] })
    expect(await total({ pieceId: globalAll._id, tenantId: A._id })).toBe(1)
    expect(await total({ pieceId: globalOnlyB._id, tenantId: A._id })).toBe(0)
    expect(await total({ pieceId: globalOnlyB._id, tenantId: B._id })).toBe(1)
  })

  it('sede de otro comercio, pieza inexistente, comercio inexistente o sin comercio en el menú → se descartan', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    const res = await post({ sid: SID, events: [
      imp(String(promoA._id), 'comercio-a', { locationId: String(locB._id) }),
      imp(ghost, 'comercio-a'),
      imp(String(promoA._id), 'no-existe'),
      imp(String(promoA._id)),
      { type: 'story_view', placement: 'menu_story', kind: 'app_story', pieceId: ghost, tenantSlug: 'comercio-a' },
    ] })
    expect(await res.json()).toMatchObject({ accepted: 0, rejected: 5 })
    expect(await PlacementDailyStat.countDocuments()).toBe(0)
  })

  it('Descubrí: el comercio sale de la promo y se ignora el que manda el cliente; global → plataforma', async () => {
    await post({ sid: SID, events: [
      { type: 'impression', placement: 'explore_promo_card', kind: 'promotion', pieceId: String(promoA._id), tenantSlug: 'comercio-b' },
      { type: 'impression', placement: 'explore_promo_card', kind: 'promotion', pieceId: String(globalAll._id), tenantSlug: 'comercio-b' },
    ] })
    expect(await total({ pieceId: promoA._id, tenantId: A._id })).toBe(1)
    expect(await total({ tenantId: B._id })).toBe(0)
    expect(await total({ pieceId: globalAll._id, tenantId: null })).toBe(1)
  })

  it('eventos incoherentes (vista en una tarjeta, story en superficie de promo) → se descartan', async () => {
    const res = await post({ sid: SID, events: [
      { type: 'story_view', placement: 'menu_promo_card', kind: 'promotion', pieceId: String(promoA._id), tenantSlug: 'comercio-a' },
      { type: 'impression', placement: 'menu_promo_card', kind: 'app_story', pieceId: String(story._id), tenantSlug: 'comercio-a' },
      { type: 'impression', placement: 'menu_story', kind: 'entry', pieceId: String(story._id), tenantSlug: 'comercio-a' },
    ] })
    expect(await res.json()).toMatchObject({ accepted: 0 })
  })
})

describe('stories: vista, completada, salida, círculo', () => {
  it('suma cada contador donde corresponde', async () => {
    const ctx = { placement: 'menu_story', tenantSlug: 'comercio-a' }
    await post({ sid: SID, events: [
      { ...ctx, type: 'impression', kind: 'entry' },
      { ...ctx, type: 'entry_open', kind: 'entry' },
      { ...ctx, type: 'story_view', kind: 'app_story', pieceId: String(story._id) },
      { ...ctx, type: 'story_complete', kind: 'app_story', pieceId: String(story._id) },
      { ...ctx, type: 'cta_tap', kind: 'app_story', pieceId: String(story._id), action: 'link' },
      { ...ctx, type: 'exit', kind: 'app_story', pieceId: String(story._id), reason: 'close', index: 2 },
    ] })
    const entry = await PlacementDailyStat.findOne({ kind: 'entry' }).lean() as any
    expect(entry.pieceId).toBeNull()
    expect(entry.c).toMatchObject({ impressions: 1, impressionsUnique: 1, opens: 1 })
    const s = await PlacementDailyStat.findOne({ kind: 'app_story' }).lean() as any
    expect(s.c).toMatchObject({ views: 1, completes: 1, ctaTaps: 1, ctaTapsUnique: 1, taps: { link: 1 }, exits: { close: 1 }, exitsAt: { 2: 1 } })
  })
})

describe('deduplicación', () => {
  it('misma sesión: total 2, único 1; otra sesión: único 2; otro día vuelve a contar', async () => {
    const ev = imp(String(promoA._id), 'comercio-a')
    await post({ sid: SID, events: [ev] })
    await post({ sid: SID, events: [ev] })
    let doc = await PlacementDailyStat.findOne().lean() as any
    expect(doc.c).toMatchObject({ impressions: 2, impressionsUnique: 1 })
    await post({ sid: SID2, events: [ev] })
    doc = await PlacementDailyStat.findOne().lean() as any
    expect(doc.c).toMatchObject({ impressions: 3, impressionsUnique: 2 })

    const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000)
    await ingestPlacementEvents(SID, [ev as any], tomorrow)
    const next = await PlacementDailyStat.findOne({ day: dayInArgentina(tomorrow) }).lean() as any
    expect(next.c).toMatchObject({ impressions: 1, impressionsUnique: 1 })
  })

  it('vistas y completadas cuentan 1 por sesión aunque se repitan en el mismo lote', async () => {
    const v = { type: 'story_view', placement: 'menu_story', kind: 'app_story', pieceId: String(story._id), tenantSlug: 'comercio-a' }
    await post({ sid: SID, events: [v, v, v] })
    expect((await PlacementDailyStat.findOne().lean() as any).c.views).toBe(1)
  })
})

describe('privacidad', () => {
  it('los contadores no guardan IP, user agent, sesión ni teléfono; PlacementSeen guarda solo hash y vencimiento', async () => {
    await post({ sid: SID, events: [imp(String(promoA._id), 'comercio-a')] })
    const doc = await PlacementDailyStat.collection.findOne({}) as any
    expect(Object.keys(doc).sort()).toEqual(['__v', '_id', 'c', 'createdAt', 'day', 'kind', 'locationId', 'pieceId', 'placement', 'tenantId', 'updatedAt'].sort())
    const text = JSON.stringify(doc)
    expect(text).not.toContain(SID)
    expect(text).not.toContain('10.0.0.1')
    expect(text).not.toContain('iPhone')

    const seen = await PlacementSeen.collection.find({}).toArray()
    expect(seen.length).toBeGreaterThan(0)
    for (const s of seen) {
      expect(Object.keys(s).sort()).toEqual(['_id', 'expiresAt'])
      expect(String(s._id)).toMatch(/^[a-f0-9]{64}$/)
      expect(String(s._id)).not.toContain(SID)
      const hours = (new Date(s.expiresAt).getTime() - Date.now()) / 3_600_000
      expect(hours).toBeGreaterThan(47)
      expect(hours).toBeLessThanOrEqual(48.01)
    }
  })
})

describe('día y límites', () => {
  it('el día es el de Argentina (23:59 y 00:01 caen en días distintos)', () => {
    expect(dayInArgentina(new Date('2026-11-21T02:59:00Z'))).toBe('2026-11-20') // 23:59 AR
    expect(dayInArgentina(new Date('2026-11-21T03:01:00Z'))).toBe('2026-11-21') // 00:01 AR
  })

  it('lote de más de 20, sesión inválida o superficie desconocida → 400 sin escrituras', async () => {
    const ev = imp(String(promoA._id), 'comercio-a')
    expect((await post({ sid: SID, events: Array(21).fill(ev) })).status).toBe(400)
    expect((await post({ sid: 'x', events: [ev] })).status).toBe(400)
    expect((await post({ sid: SID, events: [{ ...ev, placement: 'pantalla' }] })).status).toBe(400)
    expect(await PlacementDailyStat.countDocuments()).toBe(0)
  })

  it('límite de pedidos superado → 429 sin escrituras', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false } as any)
    const res = await post({ sid: SID, events: [imp(String(promoA._id), 'comercio-a')] })
    expect(res.status).toBe(429)
    expect(await PlacementDailyStat.countDocuments()).toBe(0)
  })
})
