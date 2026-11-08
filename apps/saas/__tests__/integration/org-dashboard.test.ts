import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { loadOrgDashboard, periodRange, parsePeriod, compareRange, parseCustomRange, datesOf } from '@/lib/organizations/dashboard'
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
    expect(r.data.byPayment).toEqual([{ method: 'cash', amount: 170_000, count: 3, prevAmount: 0 }])
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

describe('vista 360: comparación, fechas a elección y filtros', () => {
  it('con qué se compara cada período', () => {
    const now = new Date('2026-11-08T15:00:00Z')
    const hoy = compareRange('today', { from: '2026-11-08', to: '2026-11-08' }, now)
    expect(hoy.range).toEqual({ from: '2026-11-01', to: '2026-11-01' })
    expect(hoy.endAt?.toISOString()).toBe('2026-11-01T15:00:00.000Z') // hasta la misma hora
    expect(compareRange('7d', { from: '2026-11-02', to: '2026-11-08' }).range).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(compareRange('month', { from: '2026-03-01', to: '2026-03-31' }).range).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(compareRange('custom', { from: '2026-10-10', to: '2026-10-12' }).range).toEqual({ from: '2026-10-07', to: '2026-10-09' })
    expect(datesOf({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('fechas a elección: no al revés, no más de un año, el futuro se corta en hoy', () => {
    expect(parseCustomRange('2026-11-01', '2026-11-05', '2026-11-08')).toEqual({ from: '2026-11-01', to: '2026-11-05' })
    expect(parseCustomRange('2026-11-05', '2026-11-01', '2026-11-08')).toBeNull()
    expect(parseCustomRange('2024-01-01', '2026-11-01', '2026-11-08')).toBeNull()
    expect(parseCustomRange('2026-11-01', '2026-12-31', '2026-11-08')).toEqual({ from: '2026-11-01', to: '2026-11-08' })
    expect(parseCustomRange('x', '2026-11-01', '2026-11-08')).toBeNull()
    expect(parsePeriod('custom')).toBe('custom')
  })

  it('compara con la semana pasada, rankea sedes y suma productos del grupo', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'owner', scope: { allTenants: true } })
    const locs = await mongoose.connection.db!.collection('locations').find({ tenantId: tA1 }).toArray()
    const centro = locs.find(l => l.name === 'Centro')!._id
    // Mismo día de la semana pasada, más temprano: entra en la comparación.
    const lastWeek = new Date(Date.now() - 7 * 86_400_000 - 60_000)
    await sale(tA1, centro, 40_000, { createdAt: lastWeek, items: [{ name: 'Milanesa', quantity: 1, subtotal: 40_000 }] })
    await sale(tA1, centro, 1, { items: [{ name: 'Milanesa', quantity: 2, subtotal: 60_000 }], total: 60_000 })

    const r = await loadOrgDashboard(String(userId), 'grupo-a', 'today')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.totals.revenue).toBe(230_000)
    expect(r.data.compare.totals.revenue).toBe(40_000)
    expect(r.data.locations.map(l => [l.name, l.revenue, l.prevRevenue])).toEqual([['Centro', 160_000, 40_000], ['Norte', 50_000, 0], ['Única', 20_000, 0]])
    expect(r.data.products.find(p => p.name === 'Milanesa')).toMatchObject({ revenue: 60_000, prevRevenue: 40_000, quantity: 2, brands: ['Alfa'] })
    expect(r.data.series.unit).toBe('hour')
    expect(r.data.series.total.reduce((a, b) => a + b, 0)).toBe(230_000)
    expect(r.data.heatmap.flat().reduce((a, b) => a + b, 0)).toBe(230_000)
    expect(r.data.filters.available.map(b => b.slug).sort()).toEqual(['alfa', 'beta'])
  })

  it('los filtros solo achican: una marca ajena en la dirección se ignora', async () => {
    const userId = oid()
    await OrgMembership.create({ organizationId: orgA, userId, orgRole: 'brand_manager', scope: { tenantIds: [tA2] } })
    const r = await loadOrgDashboard(String(userId), 'grupo-a', 'today', { brands: ['alfa', 'ajena'] })
    expect(r.ok && r.data.totals.revenue).toBe(20_000) // sigue viendo solo Beta
    expect(r.ok && r.data.filters.brands).toEqual([])

    const owner = oid()
    await OrgMembership.create({ organizationId: orgA, userId: owner, orgRole: 'owner', scope: { allTenants: true } })
    const onlyBeta = await loadOrgDashboard(String(owner), 'grupo-a', 'today', { brands: ['beta'] })
    expect(onlyBeta.ok && onlyBeta.data.totals.revenue).toBe(20_000)
    const norte = (await mongoose.connection.db!.collection('locations').findOne({ name: 'Norte' }))!._id
    const onlyNorte = await loadOrgDashboard(String(owner), 'grupo-a', '7d', { locations: [String(norte)] })
    expect(onlyNorte.ok && [onlyNorte.data.totals.revenue, onlyNorte.data.brands.map(b => b.slug)]).toEqual([50_000, ['alfa']])
    expect(onlyNorte.ok && onlyNorte.data.series.unit).toBe('day')
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
