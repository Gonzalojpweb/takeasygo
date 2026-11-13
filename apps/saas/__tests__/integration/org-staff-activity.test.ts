// Etapa 2 (F6): actividad del personal en las sedes del grupo, y las métricas
// nuevas por sede de la vista 360 (F4).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { loadStaffActivity } from '@/lib/organizations/staff-activity'
import { loadOrgDashboard } from '@/lib/organizations/dashboard'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'

const oid = () => new mongoose.Types.ObjectId()
const db = () => mongoose.connection.db!
let orgA: mongoose.Types.ObjectId, tA1: mongoose.Types.ObjectId, tA2: mongoose.Types.ObjectId, tAjena: mongoose.Types.ObjectId
let centro: mongoose.Types.ObjectId, norte: mongoose.Types.ObjectId, beta: mongoose.Types.ObjectId, ajena: mongoose.Types.ObjectId
let ana: mongoose.Types.ObjectId, beto: mongoose.Types.ObjectId, encargada: mongoose.Types.ObjectId, intruso: mongoose.Types.ObjectId

async function location(tenantId: mongoose.Types.ObjectId, name: string) {
  const _id = oid()
  await db().collection('locations').insertOne({ _id, tenantId, name, slug: `${name.toLowerCase()}-${String(_id).slice(-6)}`, isActive: true, timezone: DEFAULT_TIMEZONE })
  return _id
}

async function user(tenantId: mongoose.Types.ObjectId, name: string, role: string) {
  const _id = oid()
  await db().collection('users').insertOne({ _id, tenantId, name, role, email: `${String(_id)}@t.test` })
  return _id
}

async function order(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId, total: number, extra: Record<string, unknown> = {}) {
  await db().collection('orders').insertOne({
    tenantId, locationId, orderNumber: `T-${String(oid())}`, source: 'pos', status: 'delivered', total, createdAt: new Date(), deletedAt: null, items: [], ...extra,
  })
}
const pay = (userId: mongoose.Types.ObjectId, amount: number) => ({ method: 'cash', amount, userId: String(userId), paidAt: new Date(), posId: String(oid()), reference: null })

beforeEach(async () => {
  await db().dropDatabase()
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tA1 = (await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id
  tA2 = (await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id
  tAjena = (await Tenant.create({ name: 'Ajena', slug: 'ajena', plan: 'full' }))._id
  centro = await location(tA1, 'Centro')
  norte = await location(tA1, 'Norte')
  beta = await location(tA2, 'Única')
  ajena = await location(tAjena, 'Ajena')
  ana = await user(tA1, 'Ana Cajera', 'cashier')
  beto = await user(tA2, 'Beto Mozo', 'waiter')
  encargada = await user(tA1, 'Eva Encargada', 'manager')
  intruso = await user(tAjena, 'Nombre Ajeno', 'cashier')

  // Ana cobra en dos sedes de Alfa; una venta en dos partes cuenta una vez.
  await order(tA1, centro, 100_000, { posPayments: [pay(ana, 60_000), pay(ana, 40_000)] })
  await order(tA1, norte, 50_000, { posPayments: [pay(ana, 50_000)] })
  // Venta anulada: el cobro no cuenta; Ana pidió, Eva aprobó.
  await order(tA1, centro, 30_000, { posPayments: [pay(ana, 30_000)], voided: { at: new Date(), by: String(ana), approvedBy: String(encargada), reason: 'load_error', note: null } })
  // Eva anula sola (encargada): pedida, no cuenta como aprobación de otro.
  await order(tA1, centro, 20_000, { voided: { at: new Date(), by: String(encargada), approvedBy: String(encargada), reason: 'other', note: null } })
  // Platos anulados por Ana: 2 × 5.000, uno a merma.
  await order(tA1, centro, 0, { itemVoids: [{ at: new Date(), lineId: 'x', menuItemId: null, name: 'Papas', quantity: 2, unitPrice: 5_000, reason: 'dropped', wasted: true, by: String(ana), byRole: 'cashier', approvedBy: null }] })
  // Beto cobra en Beta.
  await order(tA2, beta, 20_000, { posPayments: [pay(beto, 20_000)] })
  // Otro comercio: nunca aparece (ni su gente).
  await order(tAjena, ajena, 999_000, { posPayments: [pay(intruso, 999_000)] })

  // Cajas: Ana abre y cierra con faltante de $500.
  const reg = { posId: 'p', tenantId: tA1, locationId: centro, openedBy: 'Ana', openedByUserId: String(ana), openedAt: new Date(), initialAmount: 0, expectedAmount: 0, status: 'closed' }
  await db().collection('cashregisters').insertOne({ ...reg, closedBy: 'Ana', closedByUserId: String(ana), closedAt: new Date(), difference: -50_000 })
  await db().collection('cashmovements').insertMany([
    { posId: 'm1', tenantId: tA1, locationId: centro, registerId: oid(), type: 'expense', amount: 7_000, reason: 'hielo', userId: String(ana), timestamp: new Date() },
    { posId: 'm2', tenantId: tA1, locationId: centro, registerId: oid(), type: 'withdrawal', amount: 10_000, reason: 'retiro', userId: String(encargada), timestamp: new Date() },
    { posId: 'm3', tenantId: tA1, locationId: centro, registerId: oid(), type: 'sale', amount: 99_000, reason: 'venta', userId: String(ana), timestamp: new Date() },
  ])
})

describe('loadStaffActivity', () => {
  it('propietario: actividad por persona en todas las marcas, sin comercios ajenos', async () => {
    const owner = oid()
    await OrgMembership.create({ organizationId: orgA, userId: owner, orgRole: 'owner', scope: { allTenants: true } })
    const r = await loadStaffActivity(String(owner), 'grupo-a', 'today')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const byName = Object.fromEntries(r.data.people.map(p => [p.name, p]))
    expect(Object.keys(byName).sort()).toEqual(['Ana Cajera', 'Beto Mozo', 'Eva Encargada'])

    const a = byName['Ana Cajera']
    expect(a.role).toBe('cashier')
    expect(a.totals.payments).toEqual({ count: 2, amount: 150_000 })
    expect(a.totals.voidsRequested).toEqual({ count: 1, amount: 30_000 })
    expect(a.totals.itemVoids).toEqual({ count: 2, amount: 10_000, wasted: 2 })
    expect(a.totals).toMatchObject({ registersOpened: 1, registersClosed: 1, cashDifference: -50_000, closesWithDifference: 1 })
    expect(a.totals.expenses).toEqual({ count: 1, amount: 7_000 }) // la venta (type sale) no es un gasto
    expect(a.locations.map(l => [l.locationName, l.payments.amount])).toEqual([['Centro', 100_000], ['Norte', 50_000]])
    expect(a.flags).toContain('cash_difference')

    const e = byName['Eva Encargada']
    expect(e.totals.voidsApproved).toBe(1)
    expect(e.totals.voidsRequested.count).toBe(1)
    expect(e.totals.withdrawals).toEqual({ count: 1, amount: 10_000 })

    expect(r.data.people[0].name).toBe('Ana Cajera') // ordenado por lo cobrado
  })

  it('gerente de marca: solo la gente de su marca; filtro de sede achica', async () => {
    const bm = oid()
    await OrgMembership.create({ organizationId: orgA, userId: bm, orgRole: 'brand_manager', scope: { tenantIds: [tA2] } })
    const r = await loadStaffActivity(String(bm), 'grupo-a', 'today')
    expect(r.ok && r.data.people.map(p => p.name)).toEqual(['Beto Mozo'])

    const owner = oid()
    await OrgMembership.create({ organizationId: orgA, userId: owner, orgRole: 'owner', scope: { allTenants: true } })
    const f = await loadStaffActivity(String(owner), 'grupo-a', 'today', { locations: [String(norte)] })
    expect(f.ok && f.data.people.map(p => [p.name, p.totals.payments.amount])).toEqual([['Ana Cajera', 50_000]])
    // Un filtro con una sede ajena se ignora (no abre nada).
    const g = await loadStaffActivity(String(owner), 'grupo-a', 'today', { locations: [String(ajena)] })
    expect(g.ok && g.data.people.some(p => p.name === 'Nombre Ajeno')).toBe(false)
  })

  it('gerente de sede: sin acceso; no miembro: not_member', async () => {
    const lm = oid()
    await OrgMembership.create({ organizationId: orgA, userId: lm, orgRole: 'location_manager', scope: { locations: [{ tenantId: tA1, locationId: centro }] } })
    expect(await loadStaffActivity(String(lm), 'grupo-a', 'today')).toEqual({ ok: false, reason: 'role_not_allowed' })
    expect(await loadStaffActivity(String(oid()), 'grupo-a', 'today')).toEqual({ ok: false, reason: 'not_member' })
  })

  it('nada de ayer o de la semana pasada en «hoy»', async () => {
    const owner = oid()
    await OrgMembership.create({ organizationId: orgA, userId: owner, orgRole: 'owner', scope: { allTenants: true } })
    const old = new Date(Date.now() - 3 * 86_400_000)
    await order(tA2, beta, 70_000, { createdAt: old, posPayments: [{ ...pay(beto, 70_000), paidAt: old }] })
    const r = await loadStaffActivity(String(owner), 'grupo-a', 'today')
    expect(r.ok && r.data.people.find(p => p.name === 'Beto Mozo')?.totals.payments.amount).toBe(20_000)
  })
})

describe('vista 360: métricas nuevas por sede (F4)', () => {
  it('cada sede trae anulaciones, descuentos y facturación por canal', async () => {
    const owner = oid()
    await OrgMembership.create({ organizationId: orgA, userId: owner, orgRole: 'owner', scope: { allTenants: true } })
    const r = await loadOrgDashboard(String(owner), 'grupo-a', 'today')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const c = r.data.locations.find(l => l.name === 'Centro')!
    expect(c.revenue).toBe(100_000)
    expect(c.voided.count).toBe(2)
    expect(c.itemVoids).toMatchObject({ count: 2, amount: 10_000 })
    expect(c.byChannel).toMatchObject({ mostrador: 100_000 })
    expect(c.margin).toBeNull()
    expect(c.prevAvgTicket).toBe(0)
  })
})
