// ============================================================================
// promotions-cta.test.ts — validación del link del botón (20/11/2026)
// ============================================================================
// Comercio y SuperAdmin: link nuevo solo https o ruta interna (400 si no). El
// mismo link viejo inválido que llega sin cambios se guarda con aviso. Un
// comercio no edita promos de otro.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-tenant-slug': 'cta-test' })),
}))

import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import AppStory from '@/models/AppStory'
import User from '@/models/User'
import { POST as createPromo } from '@/app/api/[tenant]/promotions/route'
import { PUT as updatePromo } from '@/app/api/[tenant]/promotions/[promotionId]/route'
import { POST as saCreatePromo } from '@/app/api/superadmin/promotions/route'
import { PUT as saUpdatePromo } from '@/app/api/superadmin/promotions/[id]/route'
import { POST as saCreateStory } from '@/app/api/superadmin/app-stories/route'
import { PUT as saUpdateStory } from '@/app/api/superadmin/app-stories/[id]/route'
import { auth } from '@/lib/auth'
import { SUPERADMIN_DB_FIELDS, superAdminSession } from '../fixtures/superadmin-session'

const SLUG = 'cta-test'
let tenant: any

const req = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

function asTenantAdmin() {
  vi.mocked(auth).mockResolvedValue({ user: { id: 'a1', role: 'admin', tenantId: String(tenant._id), assignedLocations: [] }, expires: '' } as any)
}
async function asSuperAdmin() {
  const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
  vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'CTA', isActive: true, status: 'active', plan: 'full' })
})

describe('panel del comercio', () => {
  const params = () => ({ params: Promise.resolve({ tenant: SLUG }) })

  it('crear con link inválido → 400; https o ruta interna → se guarda', async () => {
    asTenantAdmin()
    for (const bad of ['javascript:alert(1)', 'http://x.com', '//evil.com', 'www.x.com']) {
      const res = await createPromo(req(`/api/${SLUG}/promotions`, 'POST', { title: 'P', type: 'announcement', ctaLink: bad }), params())
      expect(res.status).toBe(400)
      expect((await res.json()).field).toBe('ctaLink')
    }
    expect(await Promotion.countDocuments({ tenantId: tenant._id })).toBe(0)
    const ok = await createPromo(req(`/api/${SLUG}/promotions`, 'POST', { title: 'P', type: 'announcement', ctaLink: ' /cta-test/menu ' }), params())
    expect(ok.status).toBe(201)
    expect((await Promotion.findOne({ tenantId: tenant._id }).lean() as any).ctaLink).toBe('/cta-test/menu')
  })

  it('editar: link viejo inválido sin cambios → guarda otros campos con aviso; link nuevo inválido → 400', async () => {
    asTenantAdmin()
    const p = await Promotion.collection.insertOne({ tenantId: tenant._id, scope: 'tenant', title: 'Vieja', type: 'announcement', ctaLink: 'http://viejo.com', isActive: true })
    const pp = { params: Promise.resolve({ tenant: SLUG, promotionId: String(p.insertedId) }) }

    const res = await updatePromo(req(`/api/${SLUG}/promotions/${p.insertedId}`, 'PUT', { title: 'Nueva', ctaLink: 'http://viejo.com' }), pp)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warnings).toEqual(['ctaLink'])
    const saved = await Promotion.findById(p.insertedId).lean() as any
    expect(saved.title).toBe('Nueva')
    expect(saved.ctaLink).toBe('http://viejo.com')

    const bad = await updatePromo(req(`/api/${SLUG}/promotions/${p.insertedId}`, 'PUT', { ctaLink: 'http://otro.com' }), pp)
    expect(bad.status).toBe(400)

    const fixed = await updatePromo(req(`/api/${SLUG}/promotions/${p.insertedId}`, 'PUT', { ctaLink: 'https://nuevo.com' }), pp)
    expect(fixed.status).toBe(200)
    expect((await fixed.json()).warnings).toBeUndefined()
    expect((await Promotion.findById(p.insertedId).lean() as any).ctaLink).toBe('https://nuevo.com')
  })

  it('aislamiento: el comercio A no edita la promo de B (ni su link)', async () => {
    const other = await Tenant.create({ slug: 'otro-cta', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
    const foreign = await Promotion.create({ tenantId: other._id, scope: 'tenant', title: 'Ajena', type: 'announcement', ctaLink: 'https://b.com', isActive: true })
    asTenantAdmin()
    const pp = { params: Promise.resolve({ tenant: SLUG, promotionId: String(foreign._id) }) }
    const res = await updatePromo(req(`/api/${SLUG}/promotions/${foreign._id}`, 'PUT', { ctaLink: 'https://a.com' }), pp)
    expect(res.status).toBe(404)
    expect((await Promotion.findById(foreign._id).lean() as any).ctaLink).toBe('https://b.com')
  })
})

describe('SuperAdmin', () => {
  it('promociones globales: crear con link inválido → 400; editar con el mismo viejo → aviso', async () => {
    await asSuperAdmin()
    const bad = await saCreatePromo(req('/api/superadmin/promotions', 'POST', { title: 'G', type: 'info', ctaLink: 'javascript:alert(1)' }))
    expect(bad.status).toBe(400)

    const g = await Promotion.collection.insertOne({ scope: 'global', targetTenants: [], title: 'G', type: 'info', ctaLink: 'http://viejo.com', isActive: true })
    const res = await saUpdatePromo(req(`/api/superadmin/promotions/${g.insertedId}`, 'PUT', { title: 'G2', ctaLink: 'http://viejo.com' }), { params: Promise.resolve({ id: String(g.insertedId) }) })
    expect(res.status).toBe(200)
    expect((await res.json()).warnings).toEqual(['ctaLink'])
    const bad2 = await saUpdatePromo(req(`/api/superadmin/promotions/${g.insertedId}`, 'PUT', { ctaLink: '//evil.com' }), { params: Promise.resolve({ id: String(g.insertedId) }) })
    expect(bad2.status).toBe(400)
  })

  it('stories: crear con link inválido → 400; editar con el mismo viejo → aviso; nuevo válido → se guarda', async () => {
    await asSuperAdmin()
    const bad = await saCreateStory(req('/api/superadmin/app-stories', 'POST', { title: 'S', ctaLink: 'http://x.com' }))
    expect(bad.status).toBe(400)

    const s = await AppStory.collection.insertOne({ title: 'S', ctaLink: 'http://viejo.com', isActive: true, sortOrder: 0 })
    const pp = { params: Promise.resolve({ id: String(s.insertedId) }) }
    const res = await saUpdateStory(req(`/api/superadmin/app-stories/${s.insertedId}`, 'PUT', { title: 'S2', ctaLink: 'http://viejo.com' }), pp)
    expect(res.status).toBe(200)
    expect((await res.json()).warnings).toEqual(['ctaLink'])
    const ok = await saUpdateStory(req(`/api/superadmin/app-stories/${s.insertedId}`, 'PUT', { title: 'S2', ctaLink: '/app' }), pp)
    expect(ok.status).toBe(200)
    expect((await AppStory.findById(s.insertedId).lean() as any).ctaLink).toBe('/app')
  })
})
