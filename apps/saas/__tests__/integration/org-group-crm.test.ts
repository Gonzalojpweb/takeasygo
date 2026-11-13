// Etapa 4 (F7 nivel 1): CRM del grupo — alcance por rol, lista con nombre
// solo para propietario/administrador general, teléfono siempre tapado.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { loadGroupCrm } from '@/lib/organizations/group-crm'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'

const oid = () => new mongoose.Types.ObjectId()
const db = () => mongoose.connection.db!
let orgA: mongoose.Types.ObjectId, tA1: mongoose.Types.ObjectId, tA2: mongoose.Types.ObjectId, tAjena: mongoose.Types.ObjectId
const none = () => undefined

async function customer(name: string, phone: string, purchases: Array<[mongoose.Types.ObjectId, number, number]>) {
  const consumerId = oid()
  const phoneHash = `hash-${phone}`
  await db().collection('consumers').insertOne({ _id: consumerId, name, phone, phoneHash, email: `${phone}@x.test`, tenantIds: purchases.map((p) => p[0]) })
  for (const [tenantId, orderCount, totalSpent] of purchases) {
    await db().collection('customerprofiles').insertOne({ consumerId, phoneHash, tenantId, orderCount, totalSpent, lastOrderAt: new Date() })
  }
}

beforeEach(async () => {
  await db().dropDatabase()
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tA1 = (await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id
  tA2 = (await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id
  tAjena = (await Tenant.create({ name: 'Ajena', slug: 'ajena', plan: 'full' }))._id
  await customer('Ana', '+54 11 5555-1111', [[tA1, 3, 30_000], [tA2, 1, 10_000]])
  await customer('Bruno', '+54 11 5555-2222', [[tA1, 1, 5_000]])
  await customer('Ceci', '+54 11 5555-3333', [[tA2, 2, 8_000], [tAjena, 9, 90_000]])
  await customer('Ajeno', '+54 11 5555-9999', [[tAjena, 5, 50_000]])
})

async function member(orgRole: string, scope: Record<string, unknown> = { allTenants: true }) {
  const userId = oid()
  await OrgMembership.create({ organizationId: orgA, userId, orgRole, scope })
  return String(userId)
}

describe('loadGroupCrm', () => {
  it('propietario: números del grupo y lista con nombre y teléfono tapado; nada de comercios ajenos', async () => {
    const r = await loadGroupCrm(await member('owner'), 'grupo-a', none)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.stats.customers).toBe(3)
    expect(r.data.stats.byBrandCount).toEqual([2, 1, 0])
    expect(r.data.list!.map((c) => c.name)).toEqual(['Ana', 'Ceci', 'Bruno']) // de mayor a menor gasto
    const ana = r.data.list![0]
    expect(ana).toMatchObject({ phone: '•••• 1111', orders: 4, spent: 40_000 })
    expect(ana.brands.map((b) => b.slug)).toEqual(['alfa', 'beta'])
    // Ceci compró en una marca ajena: no cuenta como «varias marcas» ni suma esa plata.
    expect(r.data.list![1]).toMatchObject({ spent: 8_000, brands: [{ slug: 'beta', orders: 2, spent: 8_000 }] })
    // Ni el teléfono completo, ni el email, ni el hash salen.
    const json = JSON.stringify(r.data)
    expect(json).not.toMatch(/5555-1111|@x\.test|hash-/)
    expect(json).not.toContain('Ajeno')
  })

  it('filtro «fue a Alfa y no a Beta»', async () => {
    const q: Record<string, string> = { m_alfa: 'si', m_beta: 'no' }
    const r = await loadGroupCrm(await member('org_admin'), 'grupo-a', (k) => q[k])
    expect(r.ok && r.data.stats.segment.count).toBe(1)
    expect(r.ok && r.data.list!.map((c) => c.name)).toEqual(['Bruno'])
  })

  it('contador y gerente de marca: números sí, lista no; el gerente solo ve su marca', async () => {
    const acc = await loadGroupCrm(await member('accountant'), 'grupo-a', none)
    expect(acc.ok && acc.data.list).toBeNull()
    expect(acc.ok && acc.data.stats.customers).toBe(3)

    const bm = await loadGroupCrm(await member('brand_manager', { tenantIds: [tA2] }), 'grupo-a', none)
    expect(bm.ok && bm.data.brands.map((b) => b.slug)).toEqual(['beta'])
    expect(bm.ok && bm.data.stats.customers).toBe(2) // Ana y Ceci en Beta
    expect(bm.ok && bm.data.list).toBeNull()
  })

  it('gerente de sede sin acceso; no miembro: not_member', async () => {
    expect(await loadGroupCrm(await member('location_manager', { locations: [{ tenantId: tA1, locationId: oid() }] }), 'grupo-a', none)).toEqual({ ok: false, reason: 'role_not_allowed' })
    expect(await loadGroupCrm(String(oid()), 'grupo-a', none)).toEqual({ ok: false, reason: 'not_member' })
  })
})
