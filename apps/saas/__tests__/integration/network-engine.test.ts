// ============================================================================
// network-engine.test.ts — motor de beneficios de la red (etapa 5)
// ============================================================================
// Emisión → cuenta verificada (o reclamo con el mismo email) → QR dinámico →
// canje en el receptor con comisión del acuerdo vigente → sin doble canje,
// reintentos idempotentes, bloqueo por códigos fallidos, reversión inmutable,
// consentimiento, suspensión y aislamiento entre comercios.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import NetworkBenefit from '@/models/NetworkBenefit'
import NetworkLedgerEntry from '@/models/NetworkLedgerEntry'
import { auth } from '@/lib/auth'
import { encrypt, safeDecrypt } from '@/lib/crypto'
import { addMember, updateMember, createRelation, createCampaign, createAgreementVersion } from '@/lib/network/admin'
import {
  issueBenefitsForOrder, claimBenefit, listConsumerBenefits, currentBenefitCode, redeemBenefit, reverseRedemption,
  receiverRedemptions, setNetworkConsent, engineBenefitForTracking, networkLedgerTotals, BenefitError, __resetEngineCacheForTests,
} from '@/lib/network/engine'
import { benefitCode } from '@/lib/network/benefit-code'
import { POST as redeemPost } from '@/app/api/[tenant]/network/redeem/route'

const actor = { userId: null, name: 'SA test' }
const PRE_HASHED = '$2b$12$' + 'a'.repeat(53)
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')

let keke: any
let helado: any
let campaign: any

async function consumer(email: string, verified = true) {
  return User.create({ name: email.split('@')[0], email, password: PRE_HASHED, phone: `+54911${Math.floor(Math.random() * 1e8)}`, role: 'consumer', tenantId: null, emailVerified: verified ? new Date() : null })
}
const order = (tenant: any, email: string) => ({ _id: new mongoose.Types.ObjectId(), tenantId: tenant._id, status: 'confirmed', customer: { email: encrypt(email) } })
async function codeOf(userId: unknown, benefitId: unknown) {
  return (await currentBenefitCode(String(userId), String(benefitId))).manual
}

beforeEach(async () => {
  __resetEngineCacheForTests()
  keke = await Tenant.create({ slug: 'keke', name: 'Keke & Larry', isActive: true, status: 'active', plan: 'full' })
  helado = await Tenant.create({ slug: 'helado', name: 'Heladería', isActive: true, status: 'active', plan: 'full' })
  for (const t of [keke, helado]) {
    await addMember({ tenantId: String(t._id) }, actor)
    await updateMember(String(t._id), { action: 'approve' }, actor)
  }
  await createRelation({ emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) }, actor)
  await createAgreementVersion({ receiverTenantId: String(helado._id), commissionPercent: 5, debtThresholdCents: 5_000_000 }, actor)
  campaign = await createCampaign({
    receiverTenantId: String(helado._id), title: '15% en helados', benefit: { type: 'percent', value: 15, maxDiscountCents: 300_000 },
    minPurchaseCents: 500_000, validFrom: new Date(Date.now() - 86_400_000).toISOString(), status: 'active', perConsumerLimit: 1,
  }, actor)
})

describe('emisión', () => {
  it('cuenta verificada: beneficio en la cuenta; idempotente; respeta el límite por consumidor', async () => {
    const ana = await consumer('ana@t.test')
    const o = order(keke, ana.email)
    expect(await issueBenefitsForOrder(o)).toEqual({ issued: 1, pendingClaim: 0 })
    expect(await issueBenefitsForOrder(o)).toEqual({ issued: 0, pendingClaim: 0 }) // mismo pedido
    expect(await issueBenefitsForOrder(order(keke, ana.email))).toEqual({ issued: 0, pendingClaim: 0 }) // límite 1
    const list = await listConsumerBenefits(String(ana._id))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ status: 'issued', title: '15% en helados', receiver: { name: 'Heladería', slug: 'helado' } })
    expect((await engineBenefitForTracking(String(o._id)))).toMatchObject({ saved: true, url: '/app/beneficios' })
  })

  it('sin cuenta: queda para reclamar con el mismo email (72 h); otro email no puede', async () => {
    const o = order(keke, 'nuevo@t.test')
    expect(await issueBenefitsForOrder(o)).toEqual({ issued: 0, pendingClaim: 1 })
    const tracking = await engineBenefitForTracking(String(o._id))
    expect(tracking?.saved).toBe(false)
    const token = decodeURIComponent(tracking!.url.split('reclamar=')[1])

    const otro = await consumer('otro@t.test')
    await expect(claimBenefit(String(otro._id), token)).rejects.toMatchObject({ code: 'email_mismatch' })
    const sinVerificar = await consumer('nuevo2@t.test', false)
    await expect(claimBenefit(String(sinVerificar._id), token)).rejects.toMatchObject({ code: 'email_unverified' })

    const nuevo = await consumer('nuevo@t.test')
    const claimed = await claimBenefit(String(nuevo._id), token)
    expect(claimed.status).toBe('issued')
    await expect(claimBenefit(String(nuevo._id), token)).rejects.toBeInstanceOf(BenefitError) // un solo uso
  })

  it('consentimiento revocado o recepción suspendida: no se emiten beneficios nuevos', async () => {
    const ana = await consumer('ana2@t.test')
    await setNetworkConsent(String(ana._id), true)
    expect((await issueBenefitsForOrder(order(keke, ana.email))).issued).toBe(0)
    await setNetworkConsent(String(ana._id), false)
    await updateMember(String(helado._id), { action: 'suspend_receiving', reason: 'debt', note: 'Deuda pendiente' }, actor)
    expect((await issueBenefitsForOrder(order(keke, ana.email))).issued).toBe(0)
  })
})

describe('canje en el receptor', () => {
  async function issued(email = 'ana@t.test') {
    const u = await consumer(email)
    await issueBenefitsForOrder(order(keke, email))
    const b = await NetworkBenefit.findOne({ consumerUserId: u._id }).lean() as any
    return { u, b }
  }

  it('valida, confirma con la comisión del acuerdo vigente y no permite un segundo canje', async () => {
    const { u, b } = await issued()
    const code = await codeOf(u._id, b._id)
    const base = { tenantId: String(helado._id), code, purchaseTotalCents: 1_000_000, saleRef: 'T-77', actorName: 'Caja' }
    const preview = await redeemBenefit({ ...base, dryRun: true })
    expect(preview).toMatchObject({ dryRun: true, discountCents: 150_000, discountedTotalCents: 850_000, commissionCents: 42_500, ledgerId: null })
    expect((await NetworkBenefit.findById(b._id).lean() as any).status).toBe('issued') // validar no canjea

    const done = await redeemBenefit({ ...base, requestId: 'req-1' })
    expect(done.ledgerId).toBeTruthy()
    const entry = await NetworkLedgerEntry.findById(done.ledgerId).lean() as any
    expect(entry).toMatchObject({ type: 'commission', agreementVersion: 1, commissionPercent: 5, commissionCents: 42_500, saleRef: 'T-77', purchaseTotalCents: 1_000_000 })

    // Reintento del mismo pedido de canje (corte de red): devuelve lo mismo.
    const again = await redeemBenefit({ ...base, requestId: 'req-1' })
    expect(again).toMatchObject({ replayed: true, ledgerId: done.ledgerId })
    // Otro intento: rechazado.
    await expect(redeemBenefit({ ...base, requestId: 'req-2' })).rejects.toMatchObject({ code: 'status_redeemed' })
    expect(await NetworkLedgerEntry.countDocuments({ type: 'commission' })).toBe(1)

    // Un cambio posterior del acuerdo no toca el movimiento ya registrado.
    await createAgreementVersion({ receiverTenantId: String(helado._id), commissionPercent: 9, debtThresholdCents: 0 }, actor)
    expect((await NetworkLedgerEntry.findById(done.ledgerId).lean() as any).commissionPercent).toBe(5)
    expect(await networkLedgerTotals()).toMatchObject({ redemptions: 1, commissionsGeneratedCents: 42_500 })
  })

  it('dos canjes simultáneos del mismo beneficio: uno solo pasa', async () => {
    const { u, b } = await issued()
    const code = await codeOf(u._id, b._id)
    const run = (id: string) => redeemBenefit({ tenantId: String(helado._id), code, purchaseTotalCents: 1_000_000, requestId: id, actorName: 'Caja' })
    const results = await Promise.allSettled([run('a'), run('b'), run('c')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await NetworkLedgerEntry.countDocuments({ benefitId: b._id })).toBe(1)
  })

  it('compra mínima, código incorrecto con bloqueo, y beneficio de otro comercio', async () => {
    const { u, b } = await issued()
    const code = await codeOf(u._id, b._id)
    await expect(redeemBenefit({ tenantId: String(helado._id), code, purchaseTotalCents: 400_000, actorName: 'Caja' })).rejects.toMatchObject({ code: 'min_purchase' })
    await expect(redeemBenefit({ tenantId: String(keke._id), code, purchaseTotalCents: 1_000_000, actorName: 'Caja' })).rejects.toMatchObject({ status: 404 })

    const digits = code.split('-')[1]
    const wrong = `${b.ref}-${digits.endsWith('0') ? digits.slice(0, -1) + '1' : digits.slice(0, -1) + '0'}`
    for (let i = 0; i < 10; i++) {
      await expect(redeemBenefit({ tenantId: String(helado._id), code: wrong, purchaseTotalCents: 1_000_000, actorName: 'Caja' })).rejects.toMatchObject({ code: 'wrong_code' })
    }
    await expect(redeemBenefit({ tenantId: String(helado._id), code, purchaseTotalCents: 1_000_000, actorName: 'Caja' })).rejects.toMatchObject({ code: 'locked' })
  })

  it('una captura vieja del QR no sirve', async () => {
    const { b } = await issued()
    const secret = safeDecrypt(b.secretEnc)
    const old = benefitCode(secret, Date.now() - 5 * 60_000)
    await expect(redeemBenefit({ tenantId: String(helado._id), code: `${b.ref}-${old.code}`, purchaseTotalCents: 1_000_000, actorName: 'Caja' })).rejects.toMatchObject({ code: 'wrong_code' })
  })

  it('anulación: movimiento negativo inmutable, el beneficio no se reusa y no se anula dos veces', async () => {
    const { u, b } = await issued()
    const done = await redeemBenefit({ tenantId: String(helado._id), code: await codeOf(u._id, b._id), purchaseTotalCents: 1_000_000, actorName: 'Caja' })
    await expect(reverseRedemption({ tenantId: String(keke._id), ledgerId: done.ledgerId!, reason: 'Devolución', actorName: 'Admin' })).rejects.toMatchObject({ status: 404 })
    const reversal = await reverseRedemption({ tenantId: String(helado._id), ledgerId: done.ledgerId!, reason: 'Devolución', actorName: 'Admin' })
    expect(reversal.commissionCents).toBe(-42_500)
    expect((await NetworkBenefit.findById(b._id).lean() as any).status).toBe('reversed')
    await expect(reverseRedemption({ tenantId: String(helado._id), ledgerId: done.ledgerId!, reason: 'Otra vez', actorName: 'Admin' })).rejects.toMatchObject({ code: 'already_reversed' })
    await expect(NetworkLedgerEntry.updateOne({ _id: done.ledgerId }, { $set: { commissionCents: 1 } })).rejects.toThrow(/no se modifican/)
    expect(await networkLedgerTotals()).toMatchObject({ redemptions: 0, commissionsGeneratedCents: 0 })

    // El receptor ve sus canjes; el emisor no ve nada.
    expect((await receiverRedemptions(String(helado._id))).length).toBe(2)
    expect(await receiverRedemptions(String(keke._id))).toEqual([])
  })
})

describe('ruta de canje', () => {
  it('cajero del receptor canjea; el personal de otro comercio no', async () => {
    const u = await consumer('ruta@t.test')
    await issueBenefitsForOrder(order(keke, u.email))
    const b = await NetworkBenefit.findOne({ consumerUserId: u._id }).lean() as any
    const code = await codeOf(u._id, b._id)
    const req = (slug: string) => new NextRequest(`http://localhost/api/${slug}/network/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, purchaseTotalCents: 1_000_000, dryRun: true }) })

    vi.mocked(auth).mockResolvedValue({ user: { id: 'caj-k', role: 'cashier', tenantId: String(keke._id), assignedLocations: [] }, expires: '' } as any)
    expect((await redeemPost(req('helado'), { params: Promise.resolve({ tenant: 'helado' }) })).status).toBe(403)

    vi.mocked(auth).mockResolvedValue({ user: { id: 'caj-h', role: 'cashier', tenantId: String(helado._id), assignedLocations: [] }, expires: '' } as any)
    const ok = await redeemPost(req('helado'), { params: Promise.resolve({ tenant: 'helado' }) })
    expect(ok.status).toBe(200)
    expect((await ok.json()).discountCents).toBe(150_000)
  })
})
