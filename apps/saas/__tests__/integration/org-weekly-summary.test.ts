import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import ExcelJS from 'exceljs'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { lastWeekRange, runWeeklySummaries, buildWeeklySummaryEmail } from '@/lib/organizations/weekly-summary'
import { loadOrgDashboard } from '@/lib/organizations/dashboard'
import { buildDashboardPdf, buildDashboardXlsx } from '@/lib/organizations/dashboard-file'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'
import User from '@/models/User'

/** Vista 360, etapa 4: resumen de los lunes por email y descarga Excel/PDF. */

const oid = () => new mongoose.Types.ObjectId()
// Lunes 9/11/2026 08:00 Argentina → la semana que cerró es 2/11 al 8/11.
const MONDAY = new Date('2026-11-09T11:00:00Z')
let org: mongoose.Types.ObjectId, tA: mongoose.Types.ObjectId

async function location(tenantId: mongoose.Types.ObjectId, name: string) {
  const _id = oid()
  await mongoose.connection.db!.collection('locations').insertOne({ _id, tenantId, name, slug: `${name.toLowerCase()}-${String(_id).slice(-6)}`, isActive: true, timezone: DEFAULT_TIMEZONE })
  return _id
}
async function sale(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId, total: number, createdAt: Date, name = 'Milanesa') {
  await mongoose.connection.db!.collection('orders').insertOne({
    tenantId, locationId, orderNumber: `T-${String(oid())}`, source: 'pos', status: 'delivered', total, createdAt, deletedAt: null,
    posPayments: [{ method: 'cash', amount: total }], items: [{ name, quantity: 1, subtotal: total }],
  })
}
async function member(orgRole: string, email: string, extra: Record<string, unknown> = {}) {
  const u = await User.create({ name: `Ana ${orgRole}`, email, password: 'Pass-123456!', role: 'admin', phone: `+54911${Math.floor(Math.random() * 1e8)}` })
  await OrgMembership.create({ organizationId: org, userId: u._id, orgRole, scope: { allTenants: true }, ...extra })
  return u
}

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  org = (await Organization.create({ name: 'Grupo <Sur>', slug: 'grupo-sur' }))._id
  tA = (await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: org }))._id
  const loc = await location(tA, 'Centro')
  await sale(tA, loc, 300_000, new Date('2026-11-04T18:00:00Z')) // semana que cerró
  await sale(tA, loc, 200_000, new Date('2026-10-29T18:00:00Z')) // semana anterior
  await sale(tA, loc, 999_000, new Date('2026-11-09T10:00:00Z')) // lunes nuevo: no cuenta
})

describe('semana que cerró', () => {
  it('lunes a domingo, hora Argentina', () => {
    expect(lastWeekRange(MONDAY)).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(lastWeekRange(new Date('2026-11-08T23:00:00Z'))).toEqual({ from: '2026-10-26', to: '2026-11-01' }) // domingo 20 h
    expect(lastWeekRange(new Date('2026-11-09T02:00:00Z'))).toEqual({ from: '2026-10-26', to: '2026-11-01' }) // todavía domingo en Argentina
  })
})

describe('resumen semanal por email', () => {
  it('le llega a quien ve los números, con su semana contra la anterior; una sola vez', async () => {
    await member('owner', 'duena@t.test')
    await member('accountant', 'contador@t.test')
    await member('location_manager', 'gerente@t.test', { scope: { locations: [] } }) // no ve el consolidado
    await member('owner', 'apagado@t.test', { weeklySummary: { enabled: false } })
    const send = vi.fn().mockResolvedValue(undefined)

    const run = await runWeeklySummaries({ now: MONDAY, baseUrl: 'https://app.test', send })
    expect(run).toMatchObject({ week: '2026-11-02', sent: 2, failed: 0 })
    expect(send.mock.calls.map(c => c[0]).sort()).toEqual(['contador@t.test', 'duena@t.test'])
    const [, subject, html] = send.mock.calls[0]
    expect(subject).toBe('Grupo <Sur>: $3.000 la semana pasada (+50%)')
    expect(html).toContain('Grupo &lt;Sur&gt;') // escapado
    expect(html).toContain('https://app.test/grupo/grupo-sur?periodo=custom&amp;desde=2026-11-02&amp;hasta=2026-11-08')
    expect(html).not.toContain('9.990')

    // Segundo cron el mismo lunes: no repite.
    const again = await runWeeklySummaries({ now: MONDAY, baseUrl: 'https://app.test', send })
    expect(again.sent).toBe(0)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('si el envío falla, la semana queda libre para reintentar', async () => {
    await member('owner', 'duena@t.test')
    const failing = vi.fn().mockRejectedValue(new Error('SMTP caído'))
    const r1 = await runWeeklySummaries({ now: MONDAY, baseUrl: 'https://app.test', send: failing })
    expect([r1.sent, r1.failed]).toEqual([0, 1])
    const ok = vi.fn().mockResolvedValue(undefined)
    expect((await runWeeklySummaries({ now: MONDAY, baseUrl: 'https://app.test', send: ok })).sent).toBe(1)
  })

  it('semana sin ventas (ni antes): no se manda nada', async () => {
    await member('owner', 'duena@t.test')
    const send = vi.fn().mockResolvedValue(undefined)
    const r = await runWeeklySummaries({ now: new Date('2027-03-01T11:00:00Z'), baseUrl: 'https://app.test', send })
    expect([r.sent, r.skippedEmpty]).toEqual([0, 1])
    expect(send).not.toHaveBeenCalled()
  })
})

describe('descarga Excel y PDF', () => {
  it('mismos números que la pantalla', async () => {
    const u = await member('owner', 'duena@t.test')
    const r = await loadOrgDashboard(String(u._id), 'grupo-sur', 'custom', { range: { from: '2026-11-02', to: '2026-11-08' }, now: MONDAY })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await buildDashboardXlsx(r.data)) as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumen', 'Sedes', 'Marcas', 'Por día', 'Productos', 'Categorías', 'Medios de pago', 'Canales'])
    const resumen = wb.getWorksheet('Resumen')!
    const fact = resumen.getRows(1, 20)!.find(row => row.getCell(1).value === 'Facturación')!
    expect([fact.getCell(2).value, fact.getCell(3).value, fact.getCell(4).value]).toEqual([3000, 2000, 50])
    const pdf = buildDashboardPdf(r.data)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(buildWeeklySummaryEmail(r.data, { dashboardUrl: 'https://x', downloadUrl: 'https://y' }).html).toContain('Milanesa')
  })
})
