// ============================================================================
// media-upload-routes.test.ts — rutas de subida de marketing (CP3, 21/11/2026)
// ============================================================================
// Comercio: solo imagen de promoción, en SU carpeta; un archivo de otro
// comercio se rechaza sin tocarlo; sin sesión o rol no firma. SuperAdmin con
// MFA: story (imagen/video), promo y banner. Cloudinary simulado.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

const fake = vi.hoisted(() => ({
  info: null as Record<string, unknown> | null,
  destroyed: [] as string[],
  resourceCalls: 0,
}))
vi.mock('@/lib/media/ads', async (orig) => {
  const real = await orig<typeof import('@/lib/media/ads')>()
  return {
    ...real,
    cloudinaryAdsApi: () => ({
      resource: async () => { fake.resourceCalls++; return fake.info as never },
      destroy: async (pid: string) => { fake.destroyed.push(pid) },
      removePendingTag: async () => {},
    }),
  }
})

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { POST as tenantSign } from '@/app/api/[tenant]/media/sign/route'
import { POST as tenantConfirm } from '@/app/api/[tenant]/media/confirm/route'
import { POST as saSign } from '@/app/api/superadmin/media/sign/route'
import { POST as saConfirm } from '@/app/api/superadmin/media/confirm/route'
import { auth } from '@/lib/auth'
import { SUPERADMIN_DB_FIELDS, superAdminSession } from '../fixtures/superadmin-session'

let A: any, B: any

beforeEach(async () => {
  vi.clearAllMocks()
  Object.assign(process.env, {
    CLOUDINARY_ADS_CLOUD_NAME: 'tgoads', CLOUDINARY_ADS_API_KEY: '123456789012345',
    CLOUDINARY_ADS_API_SECRET: 'secreto-de-prueba-27-chars!', CLOUDINARY_ADS_FOLDER_ROOT: 'ads',
  })
  fake.info = null; fake.destroyed = []; fake.resourceCalls = 0
  A = await Tenant.create({ slug: 'media-a', name: 'A', isActive: true, status: 'active', plan: 'full' })
  B = await Tenant.create({ slug: 'media-b', name: 'B', isActive: true, status: 'active', plan: 'full' })
})

const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const p = (slug: string) => ({ params: Promise.resolve({ tenant: slug }) })
const asAdminOf = (t: any) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'a1', role: 'admin', tenantId: String(t._id), assignedLocations: [] }, expires: '' } as any)

describe('comercio', () => {
  it('firma solo imagen de promo, en su carpeta', async () => {
    asAdminOf(A)
    const ok = await tenantSign(req('/api/media-a/media/sign', { surface: 'promo_card', kind: 'image' }), p('media-a'))
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body.publicId).toMatch(new RegExp(`^ads/t-${A._id}/promo_card/`))
    expect(body.fields.signature).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain('secreto-de-prueba')

    for (const bad of [{ surface: 'story', kind: 'image' }, { surface: 'promo_card', kind: 'video' }, { surface: 'pantalla', kind: 'image' }]) {
      expect((await tenantSign(req('/api/media-a/media/sign', bad), p('media-a'))).status).toBe(400)
    }
  })

  it('sin sesión, o admin de otro comercio → no firma', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await tenantSign(req('/api/media-a/media/sign', { surface: 'promo_card', kind: 'image' }), p('media-a'))).status).toBeGreaterThanOrEqual(401)
    asAdminOf(B)
    expect((await tenantSign(req('/api/media-a/media/sign', { surface: 'promo_card', kind: 'image' }), p('media-a'))).status).toBeGreaterThanOrEqual(401)
  })

  it('aislamiento: confirmar un archivo de otro comercio → 403 y no se lee ni se borra', async () => {
    asAdminOf(B)
    fake.info = { format: 'jpg', bytes: 1000, width: 800, height: 800 }
    const pidA = `ads/t-${A._id}/promo_card/${'1'.repeat(18)}`
    const res = await tenantConfirm(req('/api/media-b/media/confirm', { surface: 'promo_card', kind: 'image', publicId: pidA }), p('media-b'))
    expect(res.status).toBe(403)
    expect(fake.resourceCalls).toBe(0)
    expect(fake.destroyed).toEqual([])
  })

  it('archivo propio que no cumple → 422 con el motivo y se borra; si cumple → URL', async () => {
    asAdminOf(A)
    const pid = `ads/t-${A._id}/promo_card/${'2'.repeat(18)}`
    fake.info = { format: 'png', bytes: 1000, width: 200, height: 200 }
    const bad = await tenantConfirm(req('/api/media-a/media/confirm', { surface: 'promo_card', kind: 'image', publicId: pid }), p('media-a'))
    expect(bad.status).toBe(422)
    expect((await bad.json()).error).toMatch(/200×200/)
    expect(fake.destroyed).toEqual([pid])

    fake.info = { format: 'png', bytes: 1000, width: 800, height: 800, secure_url: `https://res.cloudinary.com/tgoads/image/upload/v1/${pid}.png` }
    const ok = await tenantConfirm(req('/api/media-a/media/confirm', { surface: 'promo_card', kind: 'image', publicId: pid }), p('media-a'))
    expect(ok.status).toBe(200)
    expect((await ok.json()).media.url).toContain(pid)
  })
})

describe('SuperAdmin', () => {
  it('sin MFA no firma; con MFA firma video de story en la carpeta de la plataforma', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'x', role: 'superadmin' }, expires: '' } as any)
    expect((await saSign(req('/api/superadmin/media/sign', { surface: 'story', kind: 'video' }))).status).toBe(403)

    const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
    vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
    const res = await saSign(req('/api/superadmin/media/sign', { surface: 'story', kind: 'video' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.publicId).toMatch(/^ads\/platform\/story\//)
    expect(body.fields.eager).toContain('vc_h264')

    // No puede confirmar archivos de un comercio.
    const pidA = `ads/t-${A._id}/promo_card/${'3'.repeat(18)}`
    const foreign = await saConfirm(req('/api/superadmin/media/confirm', { surface: 'promo_card', kind: 'image', publicId: pidA }))
    expect(foreign.status).toBe(403)
    expect(fake.destroyed).toEqual([])
  })

  it('sin credenciales ads → 503 claro (no se firma con otra cuenta)', async () => {
    const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
    vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
    delete process.env.CLOUDINARY_ADS_API_SECRET
    const res = await saSign(req('/api/superadmin/media/sign', { surface: 'story', kind: 'image' }))
    expect(res.status).toBe(503)
  })
})
