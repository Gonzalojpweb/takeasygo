// ============================================================================
// network-settlements.test.ts — liquidaciones semanales y deuda (etapa 6)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import NetworkMember from '@/models/NetworkMember'
import NetworkLedgerEntry from '@/models/NetworkLedgerEntry'
import NetworkSettlement from '@/models/NetworkSettlement'
import NetworkSettlementLine from '@/models/NetworkSettlementLine'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { addMember, updateMember, createAgreementVersion } from '@/lib/network/admin'
import { generateSettlements, recordSettlementPayment, weekBounds, outstandingDebt, receiverSettlements, AUTO_DEBT_ACTOR, SettlementError } from '@/lib/network/settlements'
import { receiverRedemptions, networkLedgerTotals } from '@/lib/network/engine'

const actor = { userId: null, name: 'SA test' }
let a: any
let b: any
let emitter: any
const thisWeek = () => weekBounds(new Date()).start
const afterWeek = () => new Date(weekBounds(new Date()).end.getTime() + 60_000)

async function entry(receiver: any, commissionCents: number, type: 'commission' | 'reversal' = 'commission', reversesId: unknown = null) {
  const oid = () => new mongoose.Types.ObjectId()
  return NetworkLedgerEntry.create({
    type, idempotencyKey: `${type}:${oid()}`, benefitId: oid(), campaignId: oid(), relationId: oid(),
    emitterTenantId: emitter._id, receiverTenantId: receiver._id, consumerUserId: oid(),
    agreementId: null, agreementVersion: 1, commissionPercent: 5, commissionBase: 'discounted_total', capPerOperationCents: null,
    purchaseTotalCents: commissionCents * 20, discountCents: 0, discountedTotalCents: commissionCents * 20, commissionCents,
    saleRef: '', reversesId, reason: '', createdBy: 'test',
  })
}

beforeEach(async () => {
  a = await Tenant.create({ slug: 'rec-a', name: 'Receptor A', isActive: true, status: 'active', plan: 'full' })
  b = await Tenant.create({ slug: 'rec-b', name: 'Receptor B', isActive: true, status: 'active', plan: 'full' })
  emitter = await Tenant.create({ slug: 'emi', name: 'Emisor', isActive: true, status: 'active', plan: 'full' })
  for (const t of [a, b, emitter]) {
    await addMember({ tenantId: String(t._id) }, actor)
    await updateMember(String(t._id), { action: 'approve' }, actor)
  }
})

describe('semanas', () => {
  it('lunes 00:00 hora Argentina', () => {
    // Jueves 26/11/2026 15:00 ART → semana del lunes 23/11 00:00 ART (03:00 UTC).
    const { start, end } = weekBounds(new Date('2026-11-26T18:00:00Z'))
    expect(start.toISOString()).toBe('2026-11-23T03:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-30T03:00:00.000Z')
    // Domingo 22/11 23:30 ART sigue en la semana anterior.
    expect(weekBounds(new Date('2026-11-23T02:30:00Z')).start.toISOString()).toBe('2026-11-16T03:00:00.000Z')
  })
})

describe('liquidaciones', () => {
  it('una por comercio y semana; reversiones netas; un movimiento no se liquida dos veces', async () => {
    const e1 = await entry(a, 42_500)
    const e2 = await entry(a, 30_000)
    await entry(a, -30_000, 'reversal', e2._id)
    await entry(b, 10_000)

    await expect(generateSettlements({ periodStart: thisWeek(), actorName: 'SA' })).rejects.toBeInstanceOf(SettlementError) // semana abierta
    const r = await generateSettlements({ periodStart: thisWeek(), actorName: 'SA', now: afterWeek() })
    expect(r).toMatchObject({ settlements: 2, entries: 4 })
    const sa = await NetworkSettlement.findOne({ receiverTenantId: a._id }).lean() as any
    expect(sa).toMatchObject({ entries: 3, commissionCents: 42_500, dueCents: 42_500, paidCents: 0, status: 'issued' })

    // Otra corrida: nada nuevo.
    expect((await generateSettlements({ periodStart: thisWeek(), actorName: 'SA', now: afterWeek() })).settlements).toBe(0)
    expect(await NetworkSettlementLine.countDocuments({ ledgerEntryId: e1._id })).toBe(1)

    // El receptor ve sus canjes como «liquidados»; el otro comercio no los ve.
    const mine = await receiverRedemptions(String(a._id))
    expect(mine.every(x => x.settlement === 'settled')).toBe(true)
    expect((await receiverSettlements(String(b._id))).settlements).toHaveLength(1)
  })

  it('pagos: parcial, total y sobrepago rechazado; los totales separan cobrado y pendiente', async () => {
    await entry(a, 50_000)
    await generateSettlements({ periodStart: thisWeek(), actorName: 'SA', now: afterWeek() })
    const s = await NetworkSettlement.findOne({ receiverTenantId: a._id }).lean() as any
    await expect(recordSettlementPayment({ settlementId: String(s._id), amountCents: 60_000, method: 'transfer', actorName: 'SA' })).rejects.toMatchObject({ code: 'overpayment' })
    expect((await recordSettlementPayment({ settlementId: String(s._id), amountCents: 20_000, method: 'transfer', reference: 'TR-1', actorName: 'SA' })).status).toBe('partially_paid')
    expect(await outstandingDebt(String(a._id))).toBe(30_000)
    const paid = await recordSettlementPayment({ settlementId: String(s._id), amountCents: 30_000, method: 'cash', actorName: 'SA' })
    expect(paid.status).toBe('paid')
    expect(paid.payments).toHaveLength(2)
    expect(await outstandingDebt(String(a._id))).toBe(0)
    expect(await networkLedgerTotals()).toMatchObject({ commissionsGeneratedCents: 50_000, commissionsCollectedCents: 50_000, commissionsPendingCents: 0 })
    expect((await receiverRedemptions(String(a._id)))[0].settlement).toBe('paid')
  })
})

describe('control de deuda', () => {
  it('supera el umbral → deja de recibir (solo en la red) con aviso; paga → se reactiva solo', async () => {
    await createAgreementVersion({ receiverTenantId: String(a._id), commissionPercent: 5, debtThresholdCents: 10_000 }, actor)
    await entry(a, 42_500)
    await generateSettlements({ periodStart: thisWeek(), actorName: 'SA', now: afterWeek() })
    let m = await NetworkMember.findOne({ tenantId: a._id }).lean() as any
    expect(m.receiverSuspension).toMatchObject({ reason: 'debt', by: AUTO_DEBT_ACTOR })
    expect(m.status).toBe('active') // sigue en la red
    expect((await Tenant.findById(a._id).lean() as any).status).toBe('active') // el SaaS no se toca
    expect(await SystemAnnouncement.countDocuments({ targetTenantIds: a._id })).toBe(1)

    const s = await NetworkSettlement.findOne({ receiverTenantId: a._id }).lean() as any
    await recordSettlementPayment({ settlementId: String(s._id), amountCents: 42_500, method: 'transfer', actorName: 'SA' })
    m = await NetworkMember.findOne({ tenantId: a._id }).lean() as any
    expect(m.receiverSuspension).toBeNull()
    expect(m.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['suspend_receiving', 'resume_receiving']))
  })

  it('una suspensión puesta a mano por el superadmin no se levanta sola', async () => {
    await createAgreementVersion({ receiverTenantId: String(a._id), commissionPercent: 5, debtThresholdCents: 100_000 }, actor)
    await updateMember(String(a._id), { action: 'suspend_receiving', reason: 'debt', note: 'Acuerdo en revisión' }, actor)
    await entry(a, 20_000)
    await generateSettlements({ periodStart: thisWeek(), actorName: 'SA', now: afterWeek() })
    const s = await NetworkSettlement.findOne({ receiverTenantId: a._id }).lean() as any
    await recordSettlementPayment({ settlementId: String(s._id), amountCents: 20_000, method: 'transfer', actorName: 'SA' })
    const m = await NetworkMember.findOne({ tenantId: a._id }).lean() as any
    expect(m.receiverSuspension).toMatchObject({ by: 'SA test' })
  })
})
