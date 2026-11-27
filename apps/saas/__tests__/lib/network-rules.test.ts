import { describe, it, expect } from 'vitest'
import {
  campaignAllowsEmitter,
  computeBenefitDiscount,
  computeNetworkCommission,
  emitBlockReason,
  isCampaignLive,
  isOverDebtThreshold,
  resolveAgreement,
  type AgreementLike,
  type MemberLike,
} from '@/lib/network/rules'

const active: MemberLike = { status: 'active', canEmit: true, canReceive: true, receiverSuspension: null }
const rel = { emitterTenantId: 'A', receiverTenantId: 'B', status: 'active' as const }

describe('quién puede emitir beneficios para quién', () => {
  it('ambos activos y relación activa: se puede', () => {
    expect(emitBlockReason({ emitterTenantId: 'A', receiverTenantId: 'B', emitter: active, receiver: active, relation: rel })).toBeNull()
  })
  it('cada motivo de bloqueo', () => {
    const base = { emitterTenantId: 'A', receiverTenantId: 'B', emitter: active, receiver: active, relation: rel }
    expect(emitBlockReason({ ...base, receiverTenantId: 'A' })).toBe('same_tenant')
    expect(emitBlockReason({ ...base, emitter: null })).toBe('emitter_not_member')
    expect(emitBlockReason({ ...base, emitter: { ...active, status: 'pending' } })).toBe('emitter_inactive')
    expect(emitBlockReason({ ...base, emitter: { ...active, canEmit: false } })).toBe('emitter_cannot_emit')
    expect(emitBlockReason({ ...base, receiver: { ...active, status: 'suspended' } })).toBe('receiver_inactive')
    expect(emitBlockReason({ ...base, receiver: { ...active, canReceive: false } })).toBe('receiver_cannot_receive')
    expect(emitBlockReason({ ...base, receiver: { ...active, receiverSuspension: { reason: 'debt' } } })).toBe('receiver_suspended')
    expect(emitBlockReason({ ...base, relation: null })).toBe('no_relation')
    expect(emitBlockReason({ ...base, relation: { ...rel, status: 'paused' } })).toBe('relation_paused')
  })
  it('la reciprocidad no es automática: B→A necesita su propia relación', () => {
    expect(emitBlockReason({ emitterTenantId: 'B', receiverTenantId: 'A', emitter: active, receiver: active, relation: null })).toBe('no_relation')
  })
})

const ag = (over: Partial<AgreementLike>): AgreementLike => ({
  scope: 'receiver', commissionPercent: 5, commissionBase: 'discounted_total', capPerOperationCents: null,
  debtThresholdCents: 0, validFrom: '2026-01-01', validTo: null, status: 'active', version: 1, ...over,
})

describe('acuerdo aplicable', () => {
  it('el más específico gana: campaña > relación > comercio', () => {
    const list = [
      ag({ _id: 'r', scope: 'receiver' }),
      ag({ _id: 'rel', scope: 'relation', relationId: 'R1' }),
      ag({ _id: 'c', scope: 'campaign', campaignId: 'C1' }),
    ]
    const at = new Date('2026-06-01')
    expect(resolveAgreement(list, { at, campaignId: 'C1', relationId: 'R1' })?._id).toBe('c')
    expect(resolveAgreement(list, { at, campaignId: 'C9', relationId: 'R1' })?._id).toBe('rel')
    expect(resolveAgreement(list, { at })?._id).toBe('r')
  })
  it('una operación usa la versión vigente en SU fecha (un cambio no es retroactivo)', () => {
    const v1 = ag({ _id: 'v1', version: 1, commissionPercent: 5, validFrom: '2026-01-01', validTo: '2026-07-01', status: 'superseded' })
    const v2 = ag({ _id: 'v2', version: 2, commissionPercent: 8, validFrom: '2026-07-01' })
    expect(resolveAgreement([v1, v2], { at: new Date('2026-06-30') })?._id).toBe('v1')
    expect(resolveAgreement([v1, v2], { at: new Date('2026-07-02') })?._id).toBe('v2')
  })
  it('un acuerdo terminado no aplica', () => {
    expect(resolveAgreement([ag({ status: 'ended' })], { at: new Date('2026-06-01') })).toBeNull()
  })
})

describe('comisión de red', () => {
  it('sobre lo pagado o sobre el total, con tope', () => {
    const amounts = { purchaseTotalCents: 1_000_000, discountedTotalCents: 850_000 }
    expect(computeNetworkCommission({ commissionPercent: 5, commissionBase: 'discounted_total', capPerOperationCents: null }, amounts)).toBe(42_500)
    expect(computeNetworkCommission({ commissionPercent: 5, commissionBase: 'purchase_total', capPerOperationCents: null }, amounts)).toBe(50_000)
    expect(computeNetworkCommission({ commissionPercent: 5, commissionBase: 'purchase_total', capPerOperationCents: 30_000 }, amounts)).toBe(30_000)
    expect(computeNetworkCommission({ commissionPercent: 0, commissionBase: 'purchase_total', capPerOperationCents: null }, amounts)).toBe(0)
  })
  it('umbral de deuda', () => {
    expect(isOverDebtThreshold(50_000, 50_000)).toBe(false)
    expect(isOverDebtThreshold(50_001, 50_000)).toBe(true)
    expect(isOverDebtThreshold(1, 0)).toBe(true)
  })
})

describe('campañas', () => {
  const camp = { status: 'active' as const, validFrom: '2026-06-01', validTo: '2026-07-01', allowedEmitterTenantIds: [] as string[], benefit: { type: 'percent' as const, value: 15, maxDiscountCents: 200_000 }, minPurchaseCents: 500_000 }
  it('vigencia', () => {
    expect(isCampaignLive(camp, new Date('2026-06-15'))).toBe(true)
    expect(isCampaignLive(camp, new Date('2026-07-01'))).toBe(false)
    expect(isCampaignLive({ ...camp, status: 'paused' }, new Date('2026-06-15'))).toBe(false)
  })
  it('emisores habilitados', () => {
    expect(campaignAllowsEmitter(camp, 'X')).toBe(true)
    expect(campaignAllowsEmitter({ ...camp, allowedEmitterTenantIds: ['A'] }, 'X')).toBe(false)
    expect(campaignAllowsEmitter({ ...camp, allowedEmitterTenantIds: ['A'] }, 'A')).toBe(true)
  })
  it('descuento: mínimo de compra, porcentaje con tope e importe fijo', () => {
    expect(computeBenefitDiscount(camp, 400_000)).toBe(0)
    expect(computeBenefitDiscount(camp, 1_000_000)).toBe(150_000)
    expect(computeBenefitDiscount(camp, 2_000_000)).toBe(200_000)
    expect(computeBenefitDiscount({ benefit: { type: 'fixed', value: 300_000, maxDiscountCents: null }, minPurchaseCents: 0 }, 200_000)).toBe(200_000)
  })
})
