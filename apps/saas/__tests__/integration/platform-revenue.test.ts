import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { bucketOf, loadPlatformRevenue, parseRevenueRange, planMonthlyCents } from '@/lib/platform-revenue'
import { getDayAndMidnightInTimezone, DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { GET } from '@/app/api/superadmin/ingresos/route'
import Tenant from '@/models/Tenant'

/** Ingresos de la plataforma por comercio (superadmin). */

const oid = () => new mongoose.Types.ObjectId()
let tA: mongoose.Types.ObjectId, tB: mongoose.Types.ObjectId

// Mediodía en Argentina de ese día.
const at = (day: string) => new Date(getDayAndMidnightInTimezone(day, DEFAULT_TIMEZONE).date.getTime() + 12 * 3600_000)

async function order(tenantId: mongoose.Types.ObjectId, day: string, method: string, fee: number, total: number, extra: Record<string, unknown> = {}) {
  await mongoose.connection.db!.collection('orders').insertOne({
    tenantId, orderNumber: `R-${String(oid())}`, status: 'delivered', total, createdAt: at(day), deletedAt: null,
    payment: { method, status: 'approved', platformFeeAmount: fee }, ...extra,
  })
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  tA = (await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', mpOAuth: { isConnected: true } }))._id
  tB = (await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'try' }))._id
  // Semana del lunes 2 de noviembre de 2026 y la siguiente.
  await order(tA, '2026-11-02', 'mercadopago', 1_000, 50_000)
  await order(tA, '2026-11-08', 'transfer', 2_000, 80_000) // domingo: misma semana
  await order(tB, '2026-11-09', 'transfer', 500, 20_000) // lunes: semana siguiente
  await order(tB, '2026-11-09', 'cash', 300, 10_000, { status: 'cancelled' }) // cancelado: no cuenta
  await order(tB, '2026-11-10', 'cash', 400, 15_000, { payment: { method: 'cash', status: 'pending', platformFeeAmount: 400 } }) // sin aprobar
  await mongoose.connection.db!.collection('weeklycommissionstatements').insertOne({ tenantId: tB, status: 'vencido', amount: 7_000 })
})

describe('funciones puras', () => {
  it('rangos, agrupación y abono del plan', () => {
    expect(parseRevenueRange(null, null, '2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(() => parseRevenueRange('2026-11-07', '2026-11-01')).toThrow()
    expect(() => parseRevenueRange('2025-01-01', '2026-11-07')).toThrow()
    expect(bucketOf('2026-11-08', 'week')).toBe('2026-11-02')
    expect(bucketOf('2026-11-09', 'week')).toBe('2026-11-09')
    expect(bucketOf('2026-11-09', 'month')).toBe('2026-11')
    expect(planMonthlyCents('try')).toBe(3_500_000)
    expect(planMonthlyCents('anfitrion')).toBe(750_000)
    expect(planMonthlyCents('trial')).toBeNull()
  })
})

describe('loadPlatformRevenue', () => {
  it('por semana: suma solo pedidos aprobados y no cancelados, por medio de pago y por comercio', async () => {
    const r = await loadPlatformRevenue({ range: { from: '2026-11-02', to: '2026-11-15' }, group: 'week' })
    expect(r.series.map(b => [b.key, b.total])).toEqual([['2026-11-02', 3_000], ['2026-11-09', 500]])
    expect(r.series[0].byMethod).toMatchObject({ mercadopago: 1_000, transfer: 2_000 })
    expect(r.totals).toMatchObject({ commission: 3_500, gmv: 150_000, orders: 3, mpAutoSplit: 1_000, mpManual: 0, manualDebt: 7_000 })
    const alfa = r.tenants.find(t => t.slug === 'alfa')!
    expect(alfa).toMatchObject({ commission: 3_000, share: 85.7, effectiveRate: 2.3, mpAutoSplit: true, monthlyFee: 6_000_000 })
    const beta = r.tenants.find(t => t.slug === 'beta')!
    expect(beta).toMatchObject({ commission: 500, manualDebt: 7_000, mpAutoSplit: false })
    expect(r.tenants[0].slug).toBe('alfa') // ordenado por comisión
  })

  it('por mes y filtrado por comercio', async () => {
    const r = await loadPlatformRevenue({ range: { from: '2026-10-01', to: '2026-11-30' }, group: 'month', tenantId: String(tB) })
    expect(r.series.map(b => [b.key, b.total])).toEqual([['2026-10', 0], ['2026-11', 500]])
    expect(r.tenants.map(t => t.slug)).toEqual(['beta'])
  })
})

describe('GET /api/superadmin/ingresos', () => {
  it('solo superadmin; rango inválido → 400', async () => {
    const req = (qs: string) => new NextRequest(`http://localhost/api/superadmin/ingresos?${qs}`)
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: String(oid()), role: 'admin', tenantId: String(tA) }, expires: '' } as never)
    expect((await GET(req('from=2026-11-01&to=2026-11-30'))).status).toBe(403)
    expect((await GET(req('from=2026-11-30&to=2026-11-01'))).status).toBe(400)
    const ok = await GET(req('from=2026-11-01&to=2026-11-30&group=month'))
    expect(ok.status).toBe(200)
    expect((await ok.json()).totals.commission).toBe(3_500)
  })
})
