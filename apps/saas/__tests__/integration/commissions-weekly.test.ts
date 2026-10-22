// ============================================================================
// commissions-weekly.test.ts — comisiones por semana, avisos, tickets y pago
// ============================================================================
// Protege, operación por operación:
//   · el desglose de quién paga la comisión (pricing)
//   · las semanas en hora de Argentina y sus estados (en curso · pendiente ·
//     vencida · pagada)
//   · qué se cobra (vencidas + pendientes / todo / una semana)
//   · el ticket explicado de cada pedido (cliente · comercio · sin desglose)
//   · la acreditación del pago de MP: pedidos exactos, monto verificado,
//     idempotencia, semanas marcadas pagadas y saldo del comercio
//   · permisos (solo admin) y aislamiento entre comercios
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const preferenceCreate = vi.fn()
const paymentGet = vi.fn()
vi.mock('@/lib/mp-platform', () => ({
  getPlatformMPClient: vi.fn().mockResolvedValue({ client: {} }),
  getPlatformWebhookSecret: vi.fn().mockResolvedValue(null),
}))
vi.mock('mercadopago', () => ({
  Preference: class {
    create = (...a: unknown[]) => preferenceCreate(...a)
  },
  Payment: class {
    get = (...a: unknown[]) => paymentGet(...a)
  },
}))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import CommissionPaymentIntent from '@/models/CommissionPaymentIntent'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { auth } from '@/lib/auth'
import { calculateFinalTotal } from '@/lib/pricing'
import { feesByOrder, loadCommissionWeeks, payableFrom, summarizeAlerts, syncWeeklyStatements, weekKeyOf } from '@/lib/commission-weeks'
import { feeOriginOf, loadWeekTickets } from '@/lib/commission-tickets'
import { shouldPopup } from '@/lib/commissions-ui'
import { POST as superadminSettle } from '@/app/api/superadmin/commissions/route'
import { settleCommissionIntent } from '@/lib/commission-payments'
import { GET as alertsGet } from '@/app/api/[tenant]/commissions/alerts/route'
import { GET as weekGet } from '@/app/api/[tenant]/commissions/weeks/[key]/route'
import { POST as payPost } from '@/app/api/[tenant]/commissions/pay/route'
import { POST as webhook } from '@/app/api/webhooks/mercadopago/commission/route'

const SLUG = 'com-sem'
// Martes 20/10/2026 12:00 ART (día de pago). Semanas: 19/10 (en curso),
// 12/10 (cerró el lunes, se paga hoy: pendiente), 05/10 (vencida).
const NOW = new Date('2026-10-20T15:00:00Z')
let tenant: any
let other: any

/**
 * Sesión de un usuario REAL del comercio: apiAuth vuelve a leer el rol de la
 * base (withFreshPermissions), así que el usuario tiene que existir.
 */
async function as(role: string) {
  const u = await User.create({ name: `U ${role}`, email: `${role}-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role, tenantId: tenant._id })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(u._id), role, tenantId: tenant._id.toString(), assignedLocations: [] }, expires: '' } as any)
}

async function order(createdAt: string, fee: number, over: Record<string, any> = {}) {
  const { payment = {}, ...rest } = over
  return Order.create({
    tenantId: tenant._id,
    locationId: new mongoose.Types.ObjectId(),
    orderNumber: `T-${Math.random().toString(36).slice(2, 9)}`,
    status: 'delivered',
    orderMode: 'delivery',
    items: [{ name: 'Milanesa', quantity: 2, basePrice: 500_000, extraPrice: 0, price: 500_000, subtotal: 1_000_000 }],
    subtotal: 1_000_000,
    total: 1_150_000 + 50_000,
    deliveryCost: 150_000,
    customer: { name: 'Cliente', phone: '+5491100000000' },
    payment: {
      method: 'transfer',
      status: 'approved',
      baseTotal: 1_150_000,
      surchargeAmount: 50_000,
      platformFeeAmount: fee,
      platformFeeCustomerAmount: fee,
      merchantSurchargeAmount: Math.max(0, 50_000 - fee),
      ...payment,
    },
    createdAt: new Date(createdAt),
    ...rest,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Parrilla', isActive: true, status: 'active', plan: 'full' })
  other = await Tenant.create({ slug: 'otro-com', name: 'Otro', isActive: true, status: 'active', plan: 'full' })
  await as('admin')
})

describe('pricing: quién paga la comisión de una transferencia (delivery)', () => {
  it('con % de plataforma en el comercio, la paga el cliente; el recargo propio queda en el negocio', () => {
    const r = calculateFinalTotal(1_150_000, 'transfer', { transfer: { commissionPercent: 5 }, paymentSurcharges: { transfer: { feePercent: 2 } } }, {}, undefined, 'delivery', 150_000)
    expect(r.platformFeeAmount).toBe(50_000) // 5 % de 10.000 (sin envío)
    expect(r.surchargeAmount).toBe(70_000) // 7 % que paga el cliente
    expect(r.platformFeeCustomerAmount).toBe(50_000)
    expect(r.merchantSurchargeAmount).toBe(20_000)
  })
  it('sin % propio en el comercio, el cliente paga la comisión con el % de la plataforma (nunca el restaurante)', () => {
    const r = calculateFinalTotal(1_150_000, 'transfer', {}, { platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 4 } }, undefined, 'delivery', 150_000)
    expect(r.platformFeeAmount).toBe(40_000)
    expect(r.surchargeAmount).toBe(40_000)
    expect(r.platformFeeCustomerAmount).toBe(40_000)
    expect(r.finalTotal).toBe(1_190_000)
  })
  it('take away por transferencia: sin comisión', () => {
    const r = calculateFinalTotal(1_000_000, 'transfer', { transfer: { commissionPercent: 5 } }, {}, undefined, 'takeaway', 0)
    expect(r.platformFeeAmount).toBe(0)
  })
})

describe('semanas en hora de Argentina', () => {
  it('domingo 23:30 ART es de la semana anterior; lunes 00:10 ART ya es la nueva', () => {
    expect(weekKeyOf(new Date('2026-10-19T02:30:00Z'))).toBe('2026-10-12') // dom 18/10 23:30 ART
    expect(weekKeyOf(new Date('2026-10-19T03:10:00Z'))).toBe('2026-10-19') // lun 19/10 00:10 ART
  })

  it('estados: en curso, pendiente, vencida y pagada; MP, efectivo, cancelados y otro comercio no cuentan', async () => {
    await order('2026-10-06T15:00:00Z', 30_000) // semana 05/10 → vencida
    const paidOrder = await order('2026-10-13T15:00:00Z', 20_000) // semana 12/10
    await order('2026-10-14T15:00:00Z', 25_000) // semana 12/10 → pendiente
    await order('2026-10-19T15:00:00Z', 10_000) // semana 19/10 → en curso
    await order('2026-10-19T16:00:00Z', 99_000, { payment: { method: 'mercadopago' } })
    await order('2026-10-19T17:00:00Z', 99_000, { status: 'cancelled' })
    await order('2026-10-19T18:00:00Z', 99_000, { payment: { status: 'pending' } })
    await order('2026-10-19T19:00:00Z', 99_000, { tenantId: other._id })
    await CommissionSettlement.create({ tenantId: tenant._id, from: new Date('2026-10-12'), to: new Date('2026-10-19'), amountCollected: 20_000, collectedAt: NOW, collectedBy: 'test', orderIds: [String(paidOrder._id)], status: 'paid' })

    const weeks = await loadCommissionWeeks(tenant._id, { now: NOW })
    expect(weeks.map((w) => [w.key, w.status, w.totalCents, w.pendingCents])).toEqual([
      ['2026-10-05', 'vencida', 30_000, 30_000],
      ['2026-10-12', 'pendiente', 45_000, 25_000],
      ['2026-10-19', 'en_curso', 10_000, 10_000],
    ])
    const alerts = summarizeAlerts(weeks)
    expect(alerts).toMatchObject({ level: 'vencida', overdue: { cents: 30_000, weeks: 1 }, pending: { cents: 25_000, weeks: 1 }, accrued: { cents: 10_000, orders: 1 } })
  })
})

describe('qué cobra «Pagar»', () => {
  it('vencidas + pendientes por defecto; "todo" suma la semana en curso; o una semana puntual', async () => {
    const a = await order('2026-10-06T15:00:00Z', 30_000)
    const b = await order('2026-10-14T15:00:00Z', 25_000)
    const c = await order('2026-10-19T15:00:00Z', 10_000)
    const weeks = await loadCommissionWeeks(tenant._id, { now: NOW })
    const fees = await feesByOrder(weeks.flatMap((w) => w.pendingOrderIds))
    const due = payableFrom(weeks, { kind: 'due' }, fees)
    expect(due.amount).toBe(55_000)
    expect(due.orderIds.sort()).toEqual([String(a._id), String(b._id)].sort())
    expect(payableFrom(weeks, { kind: 'all' }, fees).orderIds).toContain(String(c._id))
    expect(payableFrom(weeks, { kind: 'week', key: '2026-10-12' }, fees)).toMatchObject({ amount: 25_000, orderIds: [String(b._id)] })
  })
})

describe('ticket explicado de cada pedido', () => {
  it('origen de la comisión: cliente, comercio, compartida o sin desglose (sin afirmar de más)', () => {
    expect(feeOriginOf({ platformFeeAmount: 500, platformFeeCustomerAmount: 500, surchargeAmount: 700 }).origin).toBe('customer')
    expect(feeOriginOf({ platformFeeAmount: 500, platformFeeCustomerAmount: 499, surchargeAmount: 499 }).origin).toBe('customer') // redondeo
    expect(feeOriginOf({ platformFeeAmount: 500, platformFeeCustomerAmount: 0, surchargeAmount: 0 }).origin).toBe('restaurant')
    expect(feeOriginOf({ platformFeeAmount: 500, platformFeeCustomerAmount: 200, surchargeAmount: 200 })).toMatchObject({ origin: 'shared', byCustomer: 200, byRestaurant: 300 })
    // Pedido viejo sin desglose: con recargo no se puede afirmar; sin recargo, seguro lo absorbió el comercio.
    expect(feeOriginOf({ platformFeeAmount: 500, platformFeeCustomerAmount: null, surchargeAmount: 700 }).origin).toBe('unknown')
    expect(feeOriginOf({ platformFeeAmount: 500, platformFeeCustomerAmount: null, surchargeAmount: 0 }).origin).toBe('restaurant')
  })

  it('la semana suma bien: productos, envío, comisión, quién la pagó y qué queda', async () => {
    await order('2026-10-13T15:00:00Z', 50_000)
    await order('2026-10-14T15:00:00Z', 40_000, { payment: { surchargeAmount: 0, platformFeeCustomerAmount: 0, merchantSurchargeAmount: 0 }, total: 1_150_000 })
    const w = await loadWeekTickets(tenant._id, '2026-10-12')
    expect(w.totals).toMatchObject({ orders: 2, commissionCents: 90_000, paidByCustomerCents: 50_000, paidByRestaurantCents: 40_000, deliveryCents: 300_000, productsCents: 2_000_000 })
    const [first] = w.tickets
    expect(first).toMatchObject({ origin: 'customer', productsCents: 1_000_000, deliveryCents: 150_000, totalPaidCents: 1_200_000, restaurantKeepsCents: 1_150_000 })
    expect(first.items).toEqual([{ name: 'Milanesa', quantity: 2, unitCents: 500_000, totalCents: 1_000_000 }])
    expect(JSON.stringify(w)).not.toContain('+5491100000000') // nunca datos del cliente
  })
})

describe('acreditación del pago (intención → MP → saldado)', () => {
  async function intentFor(orderIds: string[], amount: number) {
    return CommissionPaymentIntent.create({ tenantId: tenant._id, orderIds, weekStarts: [], amount })
  }

  it('salda exactamente los pedidos de la intención, baja el saldo y marca pagadas las semanas cubiertas', async () => {
    const a = await order('2026-10-06T15:00:00Z', 30_000)
    const b = await order('2026-10-14T15:00:00Z', 25_000)
    await order('2026-10-14T16:00:00Z', 5_000) // misma semana, NO incluido en la intención
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'commissionBalance.transfer': 60_000 } })
    const intent = await intentFor([String(a._id), String(b._id)], 55_000)

    const r = await settleCommissionIntent(String(intent._id), { id: 'mp-1', amountPesos: 550 })
    expect(r).toEqual({ status: 'settled', orders: 2, amountCents: 55_000 })
    expect((await Tenant.findById(tenant._id).lean() as any).commissionBalance.transfer).toBe(5_000)

    const weeks = await loadCommissionWeeks(tenant._id, { now: NOW })
    expect(weeks.find((w) => w.key === '2026-10-05')?.status).toBe('pagada')
    expect(weeks.find((w) => w.key === '2026-10-12')).toMatchObject({ status: 'pendiente', pendingCents: 5_000 })
    const stmt = await WeeklyCommissionStatement.findOne({ tenantId: tenant._id, weekStart: weeks[0].weekStart }).lean()
    expect(stmt).toMatchObject({ status: 'pagado', orderIds: [String(a._id)] })
    expect(stmt?.paidAt).toBeTruthy()
  })

  it('reintento del aviso: no salda dos veces', async () => {
    const a = await order('2026-10-06T15:00:00Z', 30_000)
    const intent = await intentFor([String(a._id)], 30_000)
    await settleCommissionIntent(String(intent._id), { id: 'mp-2', amountPesos: 300 })
    expect(await settleCommissionIntent(String(intent._id), { id: 'mp-2', amountPesos: 300 })).toEqual({ status: 'already_paid' })
    expect(await CommissionSettlement.countDocuments({ tenantId: tenant._id })).toBe(1)
  })

  it('si MP cobró menos que la intención, no salda nada', async () => {
    const a = await order('2026-10-06T15:00:00Z', 30_000)
    const intent = await intentFor([String(a._id)], 30_000)
    const r = await settleCommissionIntent(String(intent._id), { id: 'mp-3', amountPesos: 100 })
    expect(r).toMatchObject({ status: 'amount_mismatch', expectedCents: 30_000, paidCents: 10_000 })
    expect(await CommissionSettlement.countDocuments({ tenantId: tenant._id })).toBe(0)
    expect((await CommissionPaymentIntent.findById(intent._id).lean())?.status).toBe('pending')
  })

  it('dos intenciones con pedidos en común: el segundo pago no vuelve a cobrar lo ya saldado', async () => {
    const a = await order('2026-10-06T15:00:00Z', 30_000)
    const b = await order('2026-10-14T15:00:00Z', 25_000)
    const first = await intentFor([String(a._id)], 30_000)
    const second = await intentFor([String(a._id), String(b._id)], 55_000)
    await settleCommissionIntent(String(first._id), { id: 'mp-4', amountPesos: 300 })
    expect(await settleCommissionIntent(String(second._id), { id: 'mp-5', amountPesos: 550 })).toEqual({ status: 'settled', orders: 1, amountCents: 25_000 })
  })
})

describe('flujo completo por API: avisos → pagar → webhook de MP', () => {
  it('el botón crea la intención con los pedidos exactos y el webhook la acredita', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    try {
      const a = await order('2026-10-06T15:00:00Z', 30_000)
      const b = await order('2026-10-14T15:00:00Z', 25_000)
      await order('2026-10-19T15:00:00Z', 10_000) // en curso: no entra en «due»
      const P = { params: Promise.resolve({ tenant: SLUG }) }

      const alerts = await (await alertsGet(new NextRequest(`http://localhost/api/${SLUG}/commissions/alerts`), P)).json()
      expect(alerts).toMatchObject({ level: 'vencida', overdue: { cents: 30_000 }, pending: { cents: 25_000 } })

      preferenceCreate.mockResolvedValue({ id: 'pref-1', init_point: 'https://mp.test/pay' })
      const res = await payPost(new NextRequest(`http://localhost/api/${SLUG}/commissions/pay`, { method: 'POST', body: JSON.stringify({ scope: 'due' }) }), P)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ initPoint: 'https://mp.test/pay', amount: 550, orderCount: 2 })
      const body = preferenceCreate.mock.calls[0][0].body
      expect(body.items[0].unit_price).toBe(550)
      const intent = await CommissionPaymentIntent.findOne({ tenantId: tenant._id }).lean()
      expect(intent?.orderIds.sort()).toEqual([String(a._id), String(b._id)].sort())
      expect(body.external_reference).toBe(`commission-intent:${intent!._id}`)

      paymentGet.mockResolvedValue({ status: 'approved', external_reference: `commission-intent:${intent!._id}`, transaction_amount: 550 })
      const hook = await webhook(new NextRequest('http://localhost/api/webhooks/mercadopago/commission', { method: 'POST', body: JSON.stringify({ type: 'payment', data: { id: 'mp-99' } }) }))
      expect(await hook.json()).toMatchObject({ status: 'settled', orders: 2 })

      const after = await (await alertsGet(new NextRequest(`http://localhost/api/${SLUG}/commissions/alerts`), P)).json()
      expect(after).toMatchObject({ level: 'acumulada', overdue: { cents: 0 }, pending: { cents: 0 }, accrued: { cents: 10_000 } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin nada pendiente, «Pagar» no crea cobros', async () => {
    const res = await payPost(new NextRequest(`http://localhost/api/${SLUG}/commissions/pay`, { method: 'POST', body: '{}' }), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(400)
    expect(preferenceCreate).not.toHaveBeenCalled()
  })
})

describe('permisos y validaciones', () => {
  it('ven: admin, manager y cajero · pagan: admin y manager · el resto, nada', async () => {
    const P = { params: Promise.resolve({ tenant: SLUG }) }
    const alerts = () => alertsGet(new NextRequest(`http://localhost/api/${SLUG}/commissions/alerts`), P)
    const pay = () => payPost(new NextRequest(`http://localhost/api/${SLUG}/commissions/pay`, { method: 'POST', body: '{}' }), P)
    for (const role of ['admin', 'manager', 'cashier']) {
      await as(role)
      expect((await alerts()).status, role).toBe(200)
    }
    await as('cashier')
    expect((await pay()).status).toBe(403) // ve, pero no paga
    for (const role of ['manager', 'admin']) {
      await as(role)
      expect((await pay()).status, role).toBe(400) // puede pagar; no hay nada pendiente
    }
    for (const role of ['operations_manager', 'kitchen_lead', 'staff', 'waiter']) {
      await as(role)
      expect((await alerts()).status, role).toBe(403)
      expect((await pay()).status, role).toBe(403)
    }
  })

  it('un usuario de otro comercio no ve estas comisiones', async () => {
    const stranger = await User.create({ name: 'X', email: `x-${Date.now()}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role: 'admin', tenantId: other._id })
    vi.mocked(auth).mockResolvedValue({ user: { id: String(stranger._id), role: 'admin', tenantId: String(other._id), assignedLocations: [] }, expires: '' } as any)
    const res = await alertsGet(new NextRequest(`http://localhost/api/${SLUG}/commissions/alerts`), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(403)
  })

  it('el detalle exige un lunes válido', async () => {
    const P = (key: string) => ({ params: Promise.resolve({ tenant: SLUG, key }) })
    expect((await weekGet(new NextRequest(`http://localhost/x`), P('2026-10-14'))).status).toBe(400) // miércoles
    expect((await weekGet(new NextRequest(`http://localhost/x`), P('no-fecha'))).status).toBe(400)
    expect((await weekGet(new NextRequest(`http://localhost/x`), P('2026-10-12'))).status).toBe(200)
  })

  it('el cierre semanal es idempotente y congela los pedidos de cada semana', async () => {
    const a = await order('2026-10-06T15:00:00Z', 30_000)
    await syncWeeklyStatements(tenant._id, { now: NOW })
    await syncWeeklyStatements(tenant._id, { now: NOW })
    const stmts = await WeeklyCommissionStatement.find({ tenantId: tenant._id }).lean()
    expect(stmts).toHaveLength(1)
    expect(stmts[0]).toMatchObject({ status: 'vencido', amount: 30_000, orderCount: 1, orderIds: [String(a._id)] })
  })
})


describe('calendario: cierra el lunes, se paga el martes, vencida desde el miércoles', () => {
  it('el aviso en pantalla arranca el martes y, si no paga, sigue hasta que paga o el superadmin la marca cobrada', async () => {
    const thisWeek = await order('2026-10-14T15:00:00Z', 25_000) // semana del 12/10
    const nextWeek = await order('2026-10-19T12:00:00Z', 9_000) // lunes 19/10 09:00 ART: semana siguiente
    const at = async (iso: string) => summarizeAlerts(await loadCommissionWeeks(tenant._id, { now: new Date(iso) }))

    // Lunes 19/10 10:00 ART: la semana cerró → pendiente. Barra sí, golpe en pantalla todavía no.
    const monday = await at('2026-10-19T13:00:00Z')
    expect(monday).toMatchObject({ level: 'pendiente', pending: { cents: 25_000, notifyFrom: '2026-10-20T03:00:00.000Z' } })
    expect(shouldPopup('pendiente', 25_000, null, Date.parse('2026-10-19T13:00:00Z'), monday.pending.notifyFrom)).toBe(false)

    // Martes 20/10 (día de pago) 09:00 ART: aparece el aviso.
    const tuesday = await at('2026-10-20T12:00:00Z')
    expect(tuesday.level).toBe('pendiente')
    expect(shouldPopup('pendiente', 25_000, null, Date.parse('2026-10-20T12:00:00Z'), tuesday.pending.notifyFrom)).toBe(true)
    // Martes 23:59 ART: todavía en plazo.
    expect((await at('2026-10-21T02:59:00Z')).level).toBe('pendiente')

    // Miércoles 21/10 00:00 ART sin pagar: vencida. Avisa ya y se repite cada 2 h.
    const wednesday = await at('2026-10-21T03:00:00Z')
    expect(wednesday).toMatchObject({ level: 'vencida', overdue: { cents: 25_000, weeks: 1 } })
    const t = Date.parse('2026-10-21T03:00:00Z')
    const shown = { level: 'pendiente' as const, cents: 25_000, at: Date.parse('2026-10-20T12:00:00Z') }
    expect(shouldPopup('vencida', 25_000, shown, t)).toBe(true) // pasó a vencida: avisa enseguida
    const last = { level: 'vencida' as const, cents: 25_000, at: t }
    expect(shouldPopup('vencida', 25_000, last, t + 3_600_000)).toBe(false)
    expect(shouldPopup('vencida', 25_000, last, t + 2 * 3_600_000)).toBe(true)

    // Una semana después sigue vencida (no se "olvida"). Para entonces también
    // venció la semana del 19/10 (su martes de pago fue el 27/10): 25.000 + 9.000.
    const later = await loadCommissionWeeks(tenant._id, { now: new Date('2026-10-29T15:00:00Z') })
    expect(later.find((w) => w.key === '2026-10-12')?.status).toBe('vencida')
    expect(summarizeAlerts(later).overdue).toMatchObject({ cents: 34_000, weeks: 2 })

    // El superadmin marca la semana como cobrada (como lo hace su panel).
    await syncWeeklyStatements(tenant._id, { now: new Date('2026-10-29T15:00:00Z') })
    const stmt: any = await WeeklyCommissionStatement.findOne({ tenantId: tenant._id, orderIds: String(thisWeek._id) }).lean()
    const sa = await User.create({ name: 'SA', email: `sa-${Date.now()}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role: 'superadmin', tenantId: null })
    vi.mocked(auth).mockResolvedValue({ user: { id: String(sa._id), role: 'superadmin', tenantId: null, assignedLocations: [] }, expires: '' } as any)
    const res = await superadminSettle(new NextRequest('http://localhost/api/superadmin/commissions', {
      method: 'POST',
      body: JSON.stringify({ tenantId: String(tenant._id), from: stmt.weekStart, to: stmt.weekEnd, statementId: String(stmt._id) }),
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).settlement.orderIds).toEqual([String(thisWeek._id)]) // no se lleva el lunes siguiente

    // Se terminó el aviso de esa semana; la semana siguiente sigue su propio curso.
    const after = await at('2026-10-29T15:00:00Z')
    expect(after.overdue.cents).toBe(9_000) // solo el pedido de la semana del 19/10 (venció el 28/10)
    const settledWeek = (await loadCommissionWeeks(tenant._id, { now: new Date('2026-10-29T15:00:00Z') })).find((w) => w.key === '2026-10-12')
    expect(settledWeek?.status).toBe('pagada')
    expect((await WeeklyCommissionStatement.findById(stmt._id).lean())?.status).toBe('pagado')
    void nextWeek
  })
})
