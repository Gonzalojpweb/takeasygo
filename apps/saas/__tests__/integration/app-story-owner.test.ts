// ============================================================================
// app-story-owner.test.ts — dueño y superficies de AppStory (CP2, 20/11/2026)
// ============================================================================
// Valores por defecto y sin migración (las viejas = plataforma + menu_story).
// Una story de un comercio solo se ve y solo mide en el menú de ese comercio.
// Sin flujo de aprobación: solo el SuperAdmin crea y edita.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import AppStory from '@/models/AppStory'
import SystemAuditLog from '@/models/SystemAuditLog'
import PlacementDailyStat from '@/models/PlacementDailyStat'
import { POST as createStory } from '@/app/api/superadmin/app-stories/route'
import { PUT as updateStory } from '@/app/api/superadmin/app-stories/[id]/route'
import { GET as publicStories } from '@/app/api/app-stories/route'
import { ingestPlacementEvents } from '@/lib/placements/ingest'
import { auth } from '@/lib/auth'
import { SUPERADMIN_DB_FIELDS, superAdminSession } from '../fixtures/superadmin-session'

let A: any, B: any, locA1: any, locA2: any, locB: any
const SID = '11111111-2222-3333-4444-555555555555'

beforeEach(async () => {
  vi.clearAllMocks()
  A = await Tenant.create({ slug: 'story-a', name: 'A', isActive: true, status: 'active', plan: 'full' })
  B = await Tenant.create({ slug: 'story-b', name: 'B', isActive: true, status: 'active', plan: 'full' })
  locA1 = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  locA2 = await Location.create({ tenantId: A._id, slug: 'a2', name: 'A2', address: 'x', isActive: true })
  locB = await Location.create({ tenantId: B._id, slug: 'b1', name: 'B1', address: 'x', isActive: true })
  const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
  vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
})

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })

async function titlesFor(query: string) {
  const res = await publicStories(req(`/api/app-stories?${query}`, 'GET'))
  return { status: res.status, titles: ((await res.json()).stories as { title: string }[]).map((s) => s.title).sort() }
}

describe('SuperAdmin: crear y editar', () => {
  it('por defecto: plataforma + menu_story', async () => {
    const res = await createStory(req('/api/superadmin/app-stories', 'POST', { title: 'Default' }))
    expect(res.status).toBe(201)
    const s = await AppStory.findOne({ title: 'Default' }).lean() as any
    expect(s.owner).toMatchObject({ kind: 'platform', tenantId: null, locationId: null })
    expect(s.surfaces).toEqual(['menu_story'])
  })

  it('comercio inexistente, sede de otro comercio o superficie desconocida → 400', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    for (const body of [
      { title: 'X', owner: { kind: 'tenant', tenantId: ghost } },
      { title: 'X', owner: { kind: 'tenant', tenantId: String(A._id), locationId: String(locB._id) } },
      { title: 'X', surfaces: ['pantalla'] },
      { title: 'X', surfaces: [] },
      { title: 'X', owner: { kind: 'otro' } },
    ]) {
      expect((await createStory(req('/api/superadmin/app-stories', 'POST', body))).status).toBe(400)
    }
    expect(await AppStory.countDocuments()).toBe(0)
  })

  it('editar sin dueño ni superficies los conserva; con ellos cambia y audita antes/después', async () => {
    await createStory(req('/api/superadmin/app-stories', 'POST', { title: 'S', owner: { kind: 'tenant', tenantId: String(A._id), locationId: String(locA1._id) }, surfaces: ['menu_story', 'app_story'] }))
    const s = await AppStory.findOne({ title: 'S' }).lean() as any
    const pp = { params: Promise.resolve({ id: String(s._id) }) }

    await updateStory(req(`/api/superadmin/app-stories/${s._id}`, 'PUT', { title: 'S2' }), pp)
    let after = await AppStory.findById(s._id).lean() as any
    expect(String(after.owner.tenantId)).toBe(String(A._id))
    expect(after.surfaces).toEqual(['menu_story', 'app_story'])

    await updateStory(req(`/api/superadmin/app-stories/${s._id}`, 'PUT', { title: 'S2', owner: { kind: 'platform' }, surfaces: ['home_banner'] }), pp)
    after = await AppStory.findById(s._id).lean() as any
    expect(after.owner.kind).toBe('platform')
    expect(after.surfaces).toEqual(['home_banner'])

    // La auditoría del SuperAdmin va a SystemAuditLog y no se espera en la ruta.
    let log: any = null
    for (let i = 0; i < 20 && !log?.details?.after?.surfaces?.includes('home_banner'); i++) {
      await new Promise((r) => setTimeout(r, 50))
      log = await SystemAuditLog.findOne({ action: 'appstory.updated' }).sort({ _id: -1 }).lean()
    }
    expect(log.details.before.owner.kind).toBe('tenant')
    expect(log.details.after).toMatchObject({ owner: { kind: 'platform' }, surfaces: ['home_banner'] })
  })
})

describe('público: qué stories ve cada menú', () => {
  beforeEach(async () => {
    // Story vieja, sin dueño ni superficies (como en producción hoy).
    await AppStory.collection.insertOne({ title: 'Vieja', isActive: true, sortOrder: 0, scheduledStart: null, scheduledEnd: null })
    await AppStory.create({ title: 'Plataforma', surfaces: ['menu_story'] })
    await AppStory.create({ title: 'De A', owner: { kind: 'tenant', tenantId: A._id } })
    await AppStory.create({ title: 'De A1', owner: { kind: 'tenant', tenantId: A._id, locationId: locA1._id } })
    await AppStory.create({ title: 'Solo app', surfaces: ['app_story'] })
  })

  it('menú de A (sede A1): plataforma + vieja + las de A y de A1', async () => {
    expect((await titlesFor(`surface=menu_story&tenant=story-a&locationId=${locA1._id}`)).titles).toEqual(['De A', 'De A1', 'Plataforma', 'Vieja'])
  })
  it('menú de A (sede A2): sin la de A1', async () => {
    expect((await titlesFor(`surface=menu_story&tenant=story-a&locationId=${locA2._id}`)).titles).toEqual(['De A', 'Plataforma', 'Vieja'])
  })
  it('menú de B: nunca las de A', async () => {
    expect((await titlesFor(`surface=menu_story&tenant=story-b&locationId=${locB._id}`)).titles).toEqual(['Plataforma', 'Vieja'])
  })
  it('sin comercio (o comercio inexistente): solo plataforma', async () => {
    expect((await titlesFor('')).titles).toEqual(['Plataforma', 'Vieja'])
    expect((await titlesFor('tenant=no-existe')).titles).toEqual(['Plataforma', 'Vieja'])
  })
  it('otra superficie: solo las publicadas ahí; superficie desconocida → 400', async () => {
    expect((await titlesFor('surface=app_story')).titles).toEqual(['Solo app'])
    expect((await titlesFor('surface=pantalla')).status).toBe(400)
  })
})

describe('métricas: aislamiento de stories de un comercio', () => {
  it('story de A informada en el menú de B → no suma; en el de A sí; fuera de su superficie → no', async () => {
    const deA = await AppStory.create({ title: 'De A', owner: { kind: 'tenant', tenantId: A._id } })
    const view = (slug: string, placement = 'menu_story') => ({ type: 'story_view' as const, placement: placement as any, kind: 'app_story' as const, pieceId: String(deA._id), tenantSlug: slug })
    expect((await ingestPlacementEvents(SID, [view('story-b')])).accepted).toBe(0)
    expect((await ingestPlacementEvents(SID, [view('story-a', 'app_story')])).accepted).toBe(0) // no publicada en app_story
    expect((await ingestPlacementEvents(SID, [view('story-a')])).accepted).toBe(1)
    const docs = await PlacementDailyStat.find().lean() as any[]
    expect(docs).toHaveLength(1)
    expect(String(docs[0].tenantId)).toBe(String(A._id))
  })

  it('en la app, la métrica queda a nombre del dueño de la story', async () => {
    const deA = await AppStory.create({ title: 'App A', owner: { kind: 'tenant', tenantId: A._id }, surfaces: ['app_story'] })
    await ingestPlacementEvents(SID, [{ type: 'story_view', placement: 'app_story', kind: 'app_story', pieceId: String(deA._id), tenantSlug: 'story-b' }])
    const doc = await PlacementDailyStat.findOne().lean() as any
    expect(String(doc.tenantId)).toBe(String(A._id))
  })
})
