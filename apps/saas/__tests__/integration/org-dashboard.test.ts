import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { loadOrgDashboard, periodRange, parsePeriod } from '@/lib/organizations/dashboard'
import { canViewCommissions, canPayCommissions } from '@/lib/commission-access'
import { clearOrgDashboardModeCache, getOrgDashboardMode } from '@/lib/org-access'
import { getTodayStrInTimezone, DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'

/** Multi-marca PR 10: números del grupo (solo lectura) y D4 (contador ve comisiones). */

const oid = () => new mongoose.Types.ObjectId()
let orgA: mongoose.Types.ObjectId, tA1: mongoose.Types.ObjectId, tA2: mongoose.Types.ObjectId, tAjena: mongoose.Types.ObjectId

async function location(tenantId: mongoose.Types.ObjectId, name: string) {
  const _id = oid()
  await mongoose.connection.db!.collection('locations').insertOne({ _id, tenantId, name, slug: `${name.toLowerCase()}-${String(_id).slice(-6)}`, isActive: true, timezone: DEFAULT_TIMEZONE })
  return _id
}

async function sale(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId, total: number, extra: Record<string, unknown> = {}) {
  await mongoose.connection.db!.collection('orders').insertOne({
    tenantId, locationId, orderNumber: `T-${String(oid())}`, source: 'pos', status: 'delivered', total, createdAt: new Date(), deletedAt: null,
    posPayments: [{ method: 'cash', amount: total }], items: [], ...extra,
  })
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tA1 = (await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id
  tA2 = (await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id
  tAjena = (await Tenant.create({ name: 'Ajena', slug: 'ajena', plan: 'full' }))._id
  const a1c = await location(tA1, 'Centro')
  const a1n = await location(tA1, 'Norte')
  const a2 = await location(tA2, 'Única')
  const aj = await location(tAjena, 'Ajena')
  await sale(tA1, a1c, 100_000)
  await sale(tA1, a1n, 50_000)
  await sale(tA1, a1n, 30_000, { status: 'cancelled' }) // anulada: no cuenta
  await sale(tA2, a2, 20_000)
  await sale(tAjena, aj, 999_000) // otro comercio: nunca aparece
})

describe('periodRange', () => {
  it('arma los rangos en días de Argentina', () => {
    expect(periodRange('today', '2026-11-07')).toEqual({ from: '2026-11-07', to: '2026-11-07' })
    expect(periodRange('yesterday', '2026-11-01')).toEqual({ from: '2026-10-31', to: '2026-10-31' })
    expect(periodRange('7d', '2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(periodRange('30d', '2026-11-07')).toEqual({ from: '2026-10-09', to: '2026-11-07' })
    expect(periodRange('month', '2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(parsePeriod('cualquiera')).toBe('today')
  })
})

describe('loadOrgDashboard', () => {
  it('propietario: suma todas las marcas del grupo, por marca y sede, sin anuladas ni comercios ajenos', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'owner', scope: { allTenants: true } })
    const r = await loadOrgDashboard(String(userId), 'grupo-a', 'today')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.range.from).toBe(getTodayStrInTimezone(DEFAULT_TIMEZONE))
    expect(r.data.totals).toMatchObject({ sales: 3, revenue: 170_000 })
    expect(r.data.brands.map(b => [b.slug, b.totals.revenue])).toEqual([['alfa', 150_000], ['beta', 20_000]])
    expect(r.data.brands[0].locations.map(l => [l.name, l.totals.revenue])).toEqual([['Centro', 100_000], ['Norte', 50_000]])
    expect(r.data.byPayment).toEqual([{ method: 'cash', amount: 170_000, count: 3 }])
  })

  it('gerente de marca: solo su marca', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'brand_manager', scope: { tenantIds: [tA2] } })
    const r = await loadOrgDashboard(String(userId), 'grupo-a', 'today')
    expect(r.ok && r.data.brands.map(b => b.slug)).toEqual(['beta'])
    expect(r.ok && r.data.totals.revenue).toBe(20_000)
  })

  it('contador con todas las marcas: ve el consolidado (D4)', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'accountant', scope: { allTenants: true } })
    const r = await loadOrgDashboard(String(userId), 'grupo-a', '7d')
    expect(r.ok && r.data.totals.revenue).toBe(170_000)
  })

  it('gerente de sede: sin consolidado; no miembro, revocado u otra organización: no_member', async () => {
    const locMgr = oid()
    await OrgMembership.create({ organizationId: orgA, userId: locMgr, orgRole: 'location_manager', scope: { locations: [{ tenantId: tA1, locationId: oid() }] } })
    expect(await loadOrgDashboard(String(locMgr), 'grupo-a', 'today')).toEqual({ ok: false, reason: 'role_not_allowed' })

    expect(await loadOrgDashboard(String(oid()), 'grupo-a', 'today')).toEqual({ ok: false, reason: 'not_member' })

    const revoked = oid()
    await OrgMembership.create({ organizationId: orgA, userId: revoked, orgRole: 'owner', scope: { allTenants: true }, status: 'revoked' })
    expect(await loadOrgDashboard(String(revoked), 'grupo-a', 'today')).toEqual({ ok: false, reason: 'not_member' })

    const otherOrg = await Organization.create({ name: 'Otra', slug: 'otra' })
    const ownerB = oid()
    await OrgMembership.create({ organizationId: otherOrg._id, userId: ownerB, orgRole: 'owner', scope: { allTenants: true } })
    expect(await loadOrgDashboard(String(ownerB), 'grupo-a', 'today')).toEqual({ ok: false, reason: 'not_member' })
  })
})

describe('interruptor org.dashboard', () => {
  it('apagado por defecto; se lee de PlatformConfig', async () => {
    delete process.env.ORG_DASHBOARD_MODE
    clearOrgDashboardModeCache()
    expect(await getOrgDashboardMode()).toBe('off')
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    await PlatformConfig.updateOne({ _id: 'platform' }, { $set: { orgDashboard: 'on' } }, { upsert: true })
    clearOrgDashboardModeCache()
    expect(await getOrgDashboardMode()).toBe('on')
  })
})

describe('D4: comisiones', () => {
  it('el contador de una organización las ve y no las paga; el «Solo lectura» del comercio sigue sin verlas', () => {
    expect(canViewCommissions('auditor', 'accountant')).toBe(true)
    expect(canPayCommissions('auditor')).toBe(false)
    expect(canViewCommissions('auditor')).toBe(false)
    expect(canViewCommissions('auditor', null)).toBe(false)
    expect(canViewCommissions('cashier')).toBe(true)
  })
})
