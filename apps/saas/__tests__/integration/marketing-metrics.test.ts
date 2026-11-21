// ============================================================================
// marketing-metrics.test.ts — panel de métricas de marketing (CP4, 21/11/2026)
// ============================================================================
// SuperAdmin ve todo (o un comercio); un comercio ve solo lo suyo; un usuario
// de sede solo sus sedes. Tasas, círculo, salidas por posición y serie diaria.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import AppStory from '@/models/AppStory'
import Promotion from '@/models/Promotion'
import PlacementDailyStat from '@/models/PlacementDailyStat'
import { GET as saGet } from '@/app/api/superadmin/marketing-metrics/route'
import { GET as tenantGet } from '@/app/api/[tenant]/marketing-metrics/route'
import { parseRange } from '@/lib/placements/report'
import { auth } from '@/lib/auth'
import { SUPERADMIN_DB_FIELDS, superAdminSession } from '../fixtures/superadmin-session'

let A: any, B: any, locA1: any, locA2: any, story: any, promoA: any, promoB: any

beforeEach(async () => {
  vi.clearAllMocks()
  A = await Tenant.create({ slug: 'mm-a', name: 'A', isActive: true, status: 'active', plan: 'full' })
  B = await Tenant.create({ slug: 'mm-b', name: 'B', isActive: true, status: 'active', plan: 'full' })
  locA1 = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  locA2 = await Location.create({ tenantId: A._id, slug: 'a2', name: 'A2', address: 'x', isActive: true })
  story = await AppStory.create({ title: 'Conocé la app' })
  promoA = await Promotion.create({ tenantId: A._id, scope: 'tenant', type: 'info', title: 'Promo de A', price: 0 })
  promoB = await Promotion.create({ tenantId: B._id, scope: 'tenant', type: 'info', title: 'Promo de B', price: 0 })
  await PlacementDailyStat.insertMany([
    // Story TGO en el menú de A (sede A1), dos días
    { day: '2026-11-21', placement: 'menu_story', kind: 'app_story', pieceId: story._id, tenantId: A._id, locationId: locA1._id, c: { views: 10, completes: 4, ctaTaps: 2, ctaTapsUnique: 2, exits: { close: 3, skip: 2 }, exitsAt: { 0: 4, 1: 1 } } },
    { day: '2026-11-22', placement: 'menu_story', kind: 'app_story', pieceId: story._id, tenantId: A._id, locationId: locA1._id, c: { views: 10, completes: 6 } },
    // Círculo de stories en A1
    { day: '2026-11-21', placement: 'menu_story', kind: 'entry', pieceId: null, tenantId: A._id, locationId: locA1._id, c: { impressions: 50, impressionsUnique: 40, opens: 10 } },
    // Tarjeta de promo de A en la sede A2
    { day: '2026-11-21', placement: 'menu_promo_card', kind: 'promotion', pieceId: promoA._id, tenantId: A._id, locationId: locA2._id, c: { impressions: 100, impressionsUnique: 80, ctaTaps: 9, ctaTapsUnique: 8, taps: { add: 6, detail: 3 } } },
    // Promo de B (otro comercio)
    { day: '2026-11-21', placement: 'menu_promo_card', kind: 'promotion', pieceId: promoB._id, tenantId: B._id, locationId: null, c: { impressions: 999, impressionsUnique: 900, ctaTaps: 99, ctaTapsUnique: 90 } },
    // Fuera de rango
    { day: '2026-10-01', placement: 'menu_promo_card', kind: 'promotion', pieceId: promoA._id, tenantId: A._id, locationId: locA2._id, c: { impressions: 5000 } },
  ])
})

const q = 'from=2026-11-01&to=2026-11-30'
const asSuperAdmin = async () => {
  const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
  vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
}
const asUser = (role: string, tenant: any, locs: any[] = []) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role, tenantId: String(tenant._id), assignedLocations: locs.map((l) => String(l._id)) }, expires: '' } as any)

describe('SuperAdmin', () => {
  it('ve toda la red en el rango; nombres, tasas, círculo, salidas y serie diaria', async () => {
    await asSuperAdmin()
    const res = await saGet(new NextRequest(`http://localhost/api/superadmin/marketing-metrics?${q}`))
    expect(res.status).toBe(200)
    const r = await res.json()
    expect(r.totals).toMatchObject({ impressions: 1099, views: 20, completes: 10, completionRate: 50 })
    const s = r.pieces.find((p: any) => p.kind === 'app_story')
    expect(s).toMatchObject({ name: 'Conocé la app', views: 20, completes: 10, completionRate: 50, ctr: 10, exitsBy: { close: 3, skip: 2 } })
    const card = r.pieces.find((p: any) => p.pieceId === String(promoA._id))
    expect(card).toMatchObject({ name: 'Promo de A', impressions: 100, reach: 80, ctr: 10, tapsBy: { add: 6, detail: 3 } })
    expect(r.entries[0]).toMatchObject({ placement: 'menu_story', reach: 40, opens: 10, openRate: 25 })
    expect(r.dropOff[0].byIndex).toEqual([{ index: 0, exits: 4 }, { index: 1, exits: 1 }])
    expect(r.daily.map((d: any) => d.day)).toEqual(['2026-11-21', '2026-11-22'])
  })

  it('filtrado por comercio; sin MFA → 403', async () => {
    await asSuperAdmin()
    const res = await saGet(new NextRequest(`http://localhost/api/superadmin/marketing-metrics?${q}&tenantId=${B._id}`))
    const r = await res.json()
    expect(r.tenantName).toBe('B')
    expect(r.pieces.map((p: any) => p.name)).toEqual(['Promo de B'])
    vi.mocked(auth).mockResolvedValue({ user: { id: 'x', role: 'superadmin' }, expires: '' } as any)
    expect((await saGet(new NextRequest(`http://localhost/api/superadmin/marketing-metrics?${q}`))).status).toBe(403)
  })
})

describe('comercio', () => {
  const get = (slug: string, extra = '') => tenantGet(new NextRequest(`http://localhost/api/${slug}/marketing-metrics?${q}${extra}`), { params: Promise.resolve({ tenant: slug }) })

  it('aislamiento: A ve solo lo suyo, nunca la promo de B', async () => {
    asUser('admin', A)
    const r = await (await get('mm-a')).json()
    expect(r.totals.impressions).toBe(100)
    expect(r.pieces.map((p: any) => p.name).sort()).toEqual(['Conocé la app', 'Promo de A'])
    expect(JSON.stringify(r)).not.toContain('Promo de B')
  })

  it('usuario de sede: solo sus sedes; otra sede pedida → 404', async () => {
    asUser('manager', A, [locA1])
    const r = await (await get('mm-a')).json()
    expect(r.pieces.map((p: any) => p.name)).toEqual(['Conocé la app'])
    expect(r.totals.impressions).toBe(0)
    expect((await get('mm-a', `&locationId=${locA2._id}`)).status).toBe(404)
  })

  it('cajero o admin de otro comercio → sin acceso', async () => {
    asUser('cashier', A)
    expect((await get('mm-a')).status).toBeGreaterThanOrEqual(401)
    asUser('admin', B)
    expect((await get('mm-a')).status).toBeGreaterThanOrEqual(401)
  })
})

describe('rango de fechas', () => {
  it('por defecto 30 días; desde > hasta o más de un año → inválido', () => {
    expect(parseRange(new URLSearchParams(''), '2026-11-21')).toEqual({ from: '2026-10-23', to: '2026-11-21' })
    expect(parseRange(new URLSearchParams('from=2026-11-22&to=2026-11-21'), '2026-11-21')).toBeNull()
    expect(parseRange(new URLSearchParams('from=2025-01-01&to=2026-11-21'), '2026-11-21')).toBeNull()
  })
})
