// ============================================================================
// commission-rules (integración) — superadmin decide, admin elige, se liquida
// ============================================================================
//   · matriz: solo superadmin; saneada; auditada; un comercio que no pagaba
//     empieza a pagar en el próximo pedido.
//   · quién paga: solo el admin; sin matriz activada no se puede cambiar.
//   · la comisión de efectivo entra a la liquidación semanal y al balance.
//   · aislamiento: un admin no toca otro comercio.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Order from '@/models/Order'
import AuditLog from '@/models/AuditLog'
import { auth } from '@/lib/auth'
import { calculateFinalTotal } from '@/lib/pricing'
import { loadCommissionWeeks } from '@/lib/commission-weeks'
import { incrementCommissionBalance } from '@/lib/commission-balance'
import { GET as rulesGet, PUT as rulesPut } from '@/app/api/superadmin/tenants/[tenantId]/commission-rules/route'
import { GET as payerGet, PUT as payerPut } from '@/app/api/[tenant]/commissions/payer/route'

const SLUG = 'com-rules'
let tenant: any
let other: any

async function as(role: string, tenantId: unknown = tenant._id) {
  const u = await User.create({ name: `U ${role}`, email: `${role}-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role, tenantId: role === 'superadmin' ? undefined : tenantId })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(u._id), role, tenantId: role === 'superadmin' ? null : String(tenantId), assignedLocations: [] }, expires: '' } as any)
}

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
const rulesUrl = () => `http://localhost:3000/api/superadmin/tenants/${tenant._id}/commission-rules`
const payerUrl = `http://localhost:3000/api/${SLUG}/commissions/payer`
const tp = () => ({ params: Promise.resolve({ tenantId: String(tenant._id) }) })
const sp = { params: Promise.resolve({ tenant: SLUG }) }

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Bodegón', isActive: true, status: 'active', plan: 'full' })
  other = await Tenant.create({ slug: 'otro-rules', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
})

describe('matriz del superadmin', () => {
  it('solo el superadmin la ve y la cambia', async () => {
    await as('admin')
    expect((await rulesGet(json(rulesUrl(), 'GET'), tp())).status).toBe(403)
    expect((await rulesPut(json(rulesUrl(), 'PUT', { commissionRules: { enabled: true } }), tp())).status).toBe(403)
  })

  it('un comercio que no pagaba efectivo empieza a pagar en el próximo pedido; se audita', async () => {
    const before = await Tenant.findById(tenant._id).lean()
    expect(calculateFinalTotal(1_000_000, 'cash', before as any, {}, undefined, 'takeaway', 0).platformFeeAmount).toBe(0)

    await as('superadmin')
    const res = await rulesPut(json(rulesUrl(), 'PUT', { commissionRules: { enabled: true, cash: { modes: ['takeaway', 'inventado'], percent: 2 }, transfer: { modes: [] } } }), tp())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.commissionRules).toEqual({ enabled: true, cash: { modes: ['takeaway'], percent: 2 }, transfer: { modes: [] } })

    const after = await Tenant.findById(tenant._id).lean()
    expect(calculateFinalTotal(1_000_000, 'cash', after as any, {}, undefined, 'takeaway', 0).platformFeeAmount).toBe(20_000)
    expect(await AuditLog.countDocuments({ tenantId: tenant._id, action: 'superadmin.commission_rules.update' })).toBe(1)
  })

  it('% inválido → 400', async () => {
    await as('superadmin')
    expect((await rulesPut(json(rulesUrl(), 'PUT', { commissionRules: { enabled: true, cash: { modes: ['delivery'], percent: 101 } } }), tp())).status).toBe(400)
  })
})

describe('quién paga (admin)', () => {
  it('sin matriz activada: se ve la regla histórica y no se puede cambiar', async () => {
    await as('admin')
    const view = await (await payerGet(json(payerUrl, 'GET'), sp)).json()
    expect(view.configurable).toBe(false)
    expect(view.methods.find((m: any) => m.method === 'transfer').payer).toBe('customer')
    expect((await payerPut(json(payerUrl, 'PUT', { transfer: 'merchant' }), sp)).status).toBe(409)
  })

  it('con matriz: el admin elige absorber; el manager no puede; se audita', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { commissionRules: { enabled: true, cash: { modes: ['delivery'], percent: 3 }, transfer: { modes: [] } } } })
    await as('manager')
    expect((await payerPut(json(payerUrl, 'PUT', { cash: 'merchant' }), sp)).status).toBe(403)

    await as('admin')
    const res = await payerPut(json(payerUrl, 'PUT', { cash: 'merchant' }), sp)
    expect(res.status).toBe(200)
    const view = await res.json()
    const cash = view.methods.find((m: any) => m.method === 'cash')
    expect(cash).toMatchObject({ charged: true, payer: 'merchant' })
    expect(cash.modes).toEqual([{ mode: 'delivery', label: 'Delivery', percent: 3 }])

    const t = await Tenant.findById(tenant._id).lean()
    const r = calculateFinalTotal(1_150_000, 'cash', t as any, {}, undefined, 'delivery', 150_000)
    expect(r).toMatchObject({ platformFeeAmount: 30_000, platformFeeCustomerAmount: 0, finalTotal: 1_150_000 })
    expect(await AuditLog.countDocuments({ tenantId: tenant._id, action: 'commissions.payer.update' })).toBe(1)
  })

  it('valor inválido → 400; admin de otro comercio → 403', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'commissionRules.enabled': true } })
    await as('admin')
    expect((await payerPut(json(payerUrl, 'PUT', { cash: 'nadie' }), sp)).status).toBe(400)
    await as('admin', other._id)
    expect((await payerPut(json(payerUrl, 'PUT', { cash: 'merchant' }), sp)).status).toBe(403)
  })
})

describe('liquidación de la comisión de efectivo', () => {
  it('un pedido en efectivo con comisión entra a la semana a pagar y suma al balance una sola vez', async () => {
    const o = await Order.create({
      tenantId: tenant._id,
      locationId: new mongoose.Types.ObjectId(),
      orderNumber: 'C-1',
      status: 'delivered',
      orderMode: 'takeaway',
      items: [{ name: 'Empanadas', quantity: 1, basePrice: 1_000_000, extraPrice: 0, price: 1_000_000, subtotal: 1_000_000 }],
      subtotal: 1_000_000,
      total: 1_020_000,
      customer: { name: 'Cliente', phone: '+5491100000000' },
      payment: { method: 'cash', status: 'approved', baseTotal: 1_000_000, surchargeAmount: 20_000, platformFeeAmount: 20_000, platformFeeCustomerAmount: 20_000 },
    })
    const weeks = await loadCommissionWeeks(tenant._id)
    expect(weeks.reduce((s, w) => s + w.totalCents, 0)).toBe(20_000)

    expect(await incrementCommissionBalance(o._id, tenant._id, 20_000)).toBe(true)
    expect(await incrementCommissionBalance(o._id, tenant._id, 20_000)).toBe(false)
    const t = await Tenant.findById(tenant._id).select('commissionBalance').lean<any>()
    expect(t.commissionBalance.transfer).toBe(20_000)
  })
})
