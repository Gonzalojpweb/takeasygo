// ============================================================================
// Motor de beneficios de la red (etapa 5)
// ============================================================================
// Informe 21/11/2026, §3–§6 y §9. Flujo:
//   1. Emisión: un pedido confirmado en un comercio EMISOR genera beneficios
//      para los receptores con relación activa y campaña vigente. Respeta la
//      membresía, la suspensión de recepción, los emisores habilitados, el
//      límite por consumidor, el consentimiento y el piloto (en un piloto solo
//      recibe el grupo beneficio). Idempotente por (campaña, pedido).
//   2. Sin cuenta: el beneficio queda «pending_claim» 72 h y se reclama
//      iniciando sesión con el mismo email del pedido.
//   3. El consumidor ve sus beneficios y muestra un QR dinámico (o el código
//      manual). El comercio receptor lo valida en línea.
//   4. Canje: transición atómica + cupo atómico de la campaña + movimiento
//      inmutable con la versión del acuerdo vigente. Reintentos idempotentes;
//      un segundo canje se rechaza. Bloqueo tras 10 códigos fallidos.
//   5. Reversión: movimiento negativo; el beneficio no vuelve a usarse.
// Nada de esto toca la operación SaaS del comercio. Las funciones *Safe nunca
// tiran (se llaman al confirmar cualquier pedido).
// ============================================================================

import crypto from 'crypto'
import mongoose from 'mongoose'
import NetworkCampaign from '@/models/NetworkCampaign'
import NetworkRelation from '@/models/NetworkRelation'
import NetworkMember from '@/models/NetworkMember'
import NetworkAgreement from '@/models/NetworkAgreement'
import NetworkBenefit, { type BenefitStatus } from '@/models/NetworkBenefit'
import NetworkLedgerEntry from '@/models/NetworkLedgerEntry'
import NetworkPilotAssignment from '@/models/NetworkPilotAssignment'
import User from '@/models/User'
import { encrypt, safeDecrypt } from '@/lib/crypto'
import { campaignAllowsEmitter, computeBenefitDiscount, computeNetworkCommission, emitBlockReason, isCampaignLive, resolveAgreement } from './rules'
import { benefitCode, benefitPayload, hashEmail, hashToken, newBenefitRef, newBenefitSecret, parseBenefitInput, verifyBenefitCode } from './benefit-code'

export class BenefitError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'BenefitError'
  }
}

const CLAIM_TTL_MS = 72 * 3_600_000
const MAX_FAILED_ATTEMPTS = 10

// ─── Emisión ────────────────────────────────────────────────────────────────

let liveCache: { has: boolean; at: number } | null = null
async function anyCampaignLive(): Promise<boolean> {
  if (liveCache && Date.now() - liveCache.at < 60_000) return liveCache.has
  const has = Boolean(await NetworkCampaign.exists({ status: 'active' }))
  liveCache = { has, at: Date.now() }
  return has
}
/** Solo tests. */
export function __resetEngineCacheForTests() { liveCache = null }

interface OrderForEngine {
  _id: unknown
  tenantId: unknown
  status?: string
  customer?: { email?: string | null } | null
}

async function consentRevoked(userId: mongoose.Types.ObjectId): Promise<boolean> {
  const { default: UserPreferences } = await import('@/models/UserPreferences')
  const prefs = await UserPreferences.findOne({ userId }).select('networkBenefitsOptOut').lean<{ networkBenefitsOptOut?: boolean }>()
  return prefs?.networkBenefitsOptOut === true
}

export interface IssueResult { issued: number; pendingClaim: number }

/** Emite los beneficios que corresponden a un pedido confirmado del emisor. */
export async function issueBenefitsForOrder(order: OrderForEngine, now = new Date()): Promise<IssueResult> {
  const out: IssueResult = { issued: 0, pendingClaim: 0 }
  if (order.status === 'cancelled') return out
  if (!(await anyCampaignLive())) return out
  const tenantId = String(order.tenantId)
  const relations = await NetworkRelation.find({ emitterTenantId: tenantId, status: 'active' }).lean<any[]>()
  if (relations.length === 0) return out

  const email = order.customer?.email ? safeDecrypt(order.customer.email).toLowerCase().trim() : ''
  if (!email.includes('@')) return out
  const emailHash = hashEmail(email)
  const user = await User.findOne({ email, role: 'consumer', emailVerified: { $ne: null }, isActive: { $ne: false } }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
  if (user && await consentRevoked(user._id)) return out

  const receiverIds = relations.map(r => r.receiverTenantId)
  const [campaigns, members] = await Promise.all([
    NetworkCampaign.find({ receiverTenantId: { $in: receiverIds }, status: 'active' }).lean<any[]>(),
    NetworkMember.find({ tenantId: { $in: [tenantId, ...receiverIds] } }).lean<any[]>(),
  ])
  const memberOf = new Map(members.map(m => [String(m.tenantId), m]))
  const orderId = String(order._id)

  for (const campaign of campaigns) {
    if (!isCampaignLive(campaign, now) || !campaignAllowsEmitter(campaign, tenantId)) continue
    const relation = relations.find(r => String(r.receiverTenantId) === String(campaign.receiverTenantId))
    if (!relation) continue
    if (emitBlockReason({ emitterTenantId: tenantId, receiverTenantId: campaign.receiverTenantId, emitter: memberOf.get(tenantId), receiver: memberOf.get(String(campaign.receiverTenantId)), relation })) continue

    // Piloto: con promo (etapa 4) el beneficio es el QrPromo; sin promo, solo
    // el grupo beneficio recibe el beneficio del motor (el control, nada).
    if (campaign.pilot?.enabled) {
      if (campaign.pilot.qrPromoId) continue
      if (!user) continue
      const assignment = await NetworkPilotAssignment.findOne({ campaignId: campaign._id, relationId: relation._id, consumerUserId: user._id }).select('group').lean<{ group: string }>()
      if (assignment?.group !== 'treatment') continue
    }

    // Límite por consumidor (por cuenta o, sin cuenta, por email del pedido).
    const owned = await NetworkBenefit.countDocuments({
      campaignId: campaign._id,
      status: { $in: ['pending_claim', 'issued', 'redeemed'] },
      ...(user ? { consumerUserId: user._id } : { sourceEmailHash: emailHash }),
    })
    if (owned >= (campaign.perConsumerLimit ?? 1)) continue

    const claimToken = user ? null : crypto.randomBytes(24).toString('base64url')
    const doc = {
      consumerUserId: user?._id ?? null,
      campaignId: campaign._id,
      relationId: relation._id,
      emitterTenantId: tenantId,
      receiverTenantId: campaign.receiverTenantId,
      sourceOrderId: orderId,
      status: (user ? 'issued' : 'pending_claim') as BenefitStatus,
      benefit: { type: campaign.benefit.type, value: campaign.benefit.value, maxDiscountCents: campaign.benefit.maxDiscountCents ?? null, minPurchaseCents: campaign.minPurchaseCents ?? 0 },
      title: campaign.title,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + (campaign.benefitValidityDays ?? 30) * 86_400_000),
      secretEnc: encrypt(newBenefitSecret()),
      claimTokenHash: claimToken ? hashToken(claimToken) : null,
      claimTokenEnc: claimToken ? encrypt(claimToken) : null,
      claimExpiresAt: claimToken ? new Date(now.getTime() + CLAIM_TTL_MS) : null,
      sourceEmailHash: emailHash,
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await NetworkBenefit.create({ ...doc, ref: newBenefitRef() })
        if (user) out.issued++
        else out.pendingClaim++
        break
      } catch (err) {
        const e = err as { code?: number; keyPattern?: Record<string, unknown> }
        if (e?.code !== 11000) throw err
        if (e.keyPattern && 'sourceOrderId' in e.keyPattern) break // ya emitido para este pedido
        // colisión de ref: se reintenta con otra
      }
    }
  }
  return out
}

export async function issueBenefitsForOrderSafe(order: OrderForEngine): Promise<void> {
  try {
    await issueBenefitsForOrder(order)
  } catch (err) {
    console.warn('[network/engine] no se pudieron emitir beneficios:', err instanceof Error ? err.message : err)
  }
}

// ─── Consumidor ─────────────────────────────────────────────────────────────

/** Cuenta global con email verificado, o error (§5: sin cuenta verificada no hay beneficios). */
export async function requireVerifiedConsumer(userId: string | null | undefined): Promise<{ _id: mongoose.Types.ObjectId; email: string; name: string }> {
  if (!userId || !mongoose.isValidObjectId(userId)) throw new BenefitError(401, 'unauthenticated', 'Iniciá sesión para ver tus beneficios')
  const user = await User.findById(userId).select('email name role emailVerified isActive').lean<{ _id: mongoose.Types.ObjectId; email: string; name?: string; role: string; emailVerified?: Date | null; isActive?: boolean }>()
  if (!user || user.isActive === false || user.role !== 'consumer') throw new BenefitError(403, 'not_consumer', 'Los beneficios de la red son para cuentas de clientes')
  if (!user.emailVerified) throw new BenefitError(403, 'email_unverified', 'Verificá tu email para usar los beneficios de la red')
  return { _id: user._id, email: user.email, name: user.name ?? '' }
}

/** Reclama un beneficio emitido sin cuenta: exige el mismo email del pedido. */
export async function claimBenefit(userId: string, token: unknown, now = new Date()) {
  const user = await requireVerifiedConsumer(userId)
  if (typeof token !== 'string' || token.length < 16) throw new BenefitError(400, 'invalid_token', 'El link del beneficio no es válido')
  const benefit = await NetworkBenefit.findOne({ claimTokenHash: hashToken(token) }).lean<any>()
  if (!benefit) throw new BenefitError(404, 'not_found', 'No encontramos el beneficio (o ya fue reclamado)')
  if (benefit.status !== 'pending_claim') throw new BenefitError(409, 'already_claimed', 'Este beneficio ya fue reclamado')
  if (!benefit.claimExpiresAt || new Date(benefit.claimExpiresAt) < now) throw new BenefitError(410, 'claim_expired', 'El plazo para reclamar este beneficio venció')
  if (benefit.sourceEmailHash !== hashEmail(user.email)) {
    throw new BenefitError(403, 'email_mismatch', 'Este beneficio es para el email con el que se hizo el pedido: iniciá sesión con esa cuenta')
  }
  const claimed = await NetworkBenefit.findOneAndUpdate(
    { _id: benefit._id, status: 'pending_claim' },
    { $set: { status: 'issued', consumerUserId: user._id, claimTokenHash: null, claimTokenEnc: null, claimExpiresAt: null } },
    { new: true },
  ).lean<any>()
  if (!claimed) throw new BenefitError(409, 'already_claimed', 'Este beneficio ya fue reclamado')
  return claimed
}

/** Beneficios del consumidor (vigentes primero; vencidos se marcan al leer). */
export async function listConsumerBenefits(userId: string, now = new Date()) {
  const user = await requireVerifiedConsumer(userId)
  await NetworkBenefit.updateMany({ consumerUserId: user._id, status: 'issued', expiresAt: { $lt: now } }, { $set: { status: 'expired' } })
  const since = new Date(now.getTime() - 90 * 86_400_000)
  const benefits = await NetworkBenefit.find({ consumerUserId: user._id, $or: [{ status: 'issued' }, { updatedAt: { $gte: since } }] })
    .sort({ status: 1, expiresAt: 1 }).limit(100)
    .select('ref status benefit title issuedAt expiresAt redeemedAt receiverTenantId').lean<any[]>()
  const { default: Tenant } = await import('@/models/Tenant')
  const receivers = await Tenant.find({ _id: { $in: [...new Set(benefits.map(b => String(b.receiverTenantId)))] } }).select('name slug branding.logoUrl').lean<any[]>()
  const receiverOf = new Map(receivers.map(t => [String(t._id), t]))
  return benefits.map(b => {
    const r = receiverOf.get(String(b.receiverTenantId))
    return {
      id: String(b._id), status: b.status, title: b.title, benefit: b.benefit,
      issuedAt: b.issuedAt, expiresAt: b.expiresAt, redeemedAt: b.redeemedAt,
      receiver: r ? { name: r.name, slug: r.slug, logoUrl: r.branding?.logoUrl ?? null } : null,
    }
  })
}

/** Código vigente del QR de un beneficio propio y disponible. */
export async function currentBenefitCode(userId: string, benefitId: string, nowMs = Date.now()) {
  const user = await requireVerifiedConsumer(userId)
  if (!mongoose.isValidObjectId(benefitId)) throw new BenefitError(400, 'invalid_id', 'Beneficio inválido')
  const b = await NetworkBenefit.findOne({ _id: benefitId, consumerUserId: user._id }).select('ref status expiresAt secretEnc').lean<any>()
  if (!b) throw new BenefitError(404, 'not_found', 'No encontramos el beneficio')
  if (b.status !== 'issued') throw new BenefitError(409, 'not_available', 'Este beneficio ya no está disponible')
  if (new Date(b.expiresAt).getTime() < nowMs) throw new BenefitError(410, 'expired', 'El beneficio venció')
  const { code, secondsLeft } = benefitCode(safeDecrypt(b.secretEnc), nowMs)
  return { ...benefitPayload(b.ref, code), secondsLeft }
}

export async function setNetworkConsent(userId: string, optOut: boolean) {
  const user = await requireVerifiedConsumer(userId)
  const { default: UserPreferences } = await import('@/models/UserPreferences')
  await UserPreferences.updateOne({ userId: user._id }, { $set: { networkBenefitsOptOut: optOut, networkConsentUpdatedAt: new Date() } }, { upsert: true })
  return { optOut }
}

export async function getNetworkConsent(userId: string) {
  const user = await requireVerifiedConsumer(userId)
  const { default: UserPreferences } = await import('@/models/UserPreferences')
  const prefs = await UserPreferences.findOne({ userId: user._id }).select('networkBenefitsOptOut').lean<{ networkBenefitsOptOut?: boolean }>()
  return { optOut: prefs?.networkBenefitsOptOut === true }
}

// ─── Canje (comercio receptor) ──────────────────────────────────────────────

export interface RedeemInput {
  tenantId: string
  code: unknown
  purchaseTotalCents: unknown
  saleRef?: unknown
  requestId?: unknown
  dryRun?: boolean
  actorName: string
}

export interface RedeemResult {
  dryRun: boolean
  title: string
  purchaseTotalCents: number
  discountCents: number
  discountedTotalCents: number
  commissionCents: number
  ledgerId: string | null
  replayed?: boolean
}

const STATUS_MESSAGE: Partial<Record<BenefitStatus, string>> = {
  pending_claim: 'El cliente todavía no guardó el beneficio en su cuenta TGO',
  redeemed: 'Este beneficio ya fue canjeado',
  reversed: 'Este beneficio fue anulado',
  expired: 'El beneficio venció',
  revoked: 'El beneficio fue dado de baja',
}

function resultFromLedger(e: any, title: string): RedeemResult {
  return {
    dryRun: false, title, purchaseTotalCents: e.purchaseTotalCents, discountCents: e.discountCents,
    discountedTotalCents: e.discountedTotalCents, commissionCents: e.commissionCents, ledgerId: String(e._id), replayed: true,
  }
}

/** Valida (dryRun) o confirma el canje de un beneficio en el comercio receptor. */
export async function redeemBenefit(input: RedeemInput, now = new Date()): Promise<RedeemResult> {
  const parsed = parseBenefitInput(input.code)
  if (!parsed) throw new BenefitError(400, 'invalid_code', 'Código inválido: escaneá el QR o tipeá el código completo (ej. ABCD2345-123456)')
  const purchaseTotalCents = typeof input.purchaseTotalCents === 'number' && Number.isInteger(input.purchaseTotalCents) ? input.purchaseTotalCents : NaN
  if (!(purchaseTotalCents > 0)) throw new BenefitError(400, 'invalid_amount', 'Ingresá el total de la compra')
  const saleRef = typeof input.saleRef === 'string' ? input.saleRef.trim().slice(0, 80) : ''
  const requestId = typeof input.requestId === 'string' && input.requestId.length <= 80 ? input.requestId : null

  const benefit = await NetworkBenefit.findOne({ ref: parsed.ref, receiverTenantId: input.tenantId }).lean<any>()
  // Un beneficio de otro comercio responde igual que uno inexistente.
  if (!benefit) throw new BenefitError(404, 'not_found', 'Este beneficio no es para este comercio')

  if (benefit.status === 'redeemed' && requestId && benefit.redemptionRequestId === requestId && benefit.redemptionLedgerId) {
    const e = await NetworkLedgerEntry.findById(benefit.redemptionLedgerId).lean<any>()
    if (e) return resultFromLedger(e, benefit.title) // reintento del mismo canje
  }
  if (benefit.status !== 'issued') throw new BenefitError(409, `status_${benefit.status}`, STATUS_MESSAGE[benefit.status as BenefitStatus] ?? 'El beneficio no está disponible')
  if (new Date(benefit.expiresAt) < now) {
    await NetworkBenefit.updateOne({ _id: benefit._id, status: 'issued' }, { $set: { status: 'expired' } })
    throw new BenefitError(410, 'expired', 'El beneficio venció')
  }
  if ((benefit.failedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) throw new BenefitError(423, 'locked', 'Demasiados códigos incorrectos: el beneficio quedó bloqueado. Comunicate con TakeasyGO.')

  const step = verifyBenefitCode(safeDecrypt(benefit.secretEnc), parsed.code, null, now.getTime())
  if (step === null) {
    await NetworkBenefit.updateOne({ _id: benefit._id }, { $inc: { failedAttempts: 1 } })
    throw new BenefitError(400, 'wrong_code', 'Código vencido o incorrecto: pedile al cliente que muestre el QR de nuevo')
  }

  const discountCents = computeBenefitDiscount({ benefit: benefit.benefit, minPurchaseCents: benefit.benefit.minPurchaseCents ?? 0 }, purchaseTotalCents)
  if (discountCents <= 0) {
    const min = benefit.benefit.minPurchaseCents ?? 0
    throw new BenefitError(400, 'min_purchase', min > 0 ? `La compra mínima para este beneficio es $${(min / 100).toLocaleString('es-AR')}` : 'El beneficio no aplica a esta compra')
  }
  const discountedTotalCents = purchaseTotalCents - discountCents
  const agreements = await NetworkAgreement.find({ receiverTenantId: input.tenantId }).lean<any[]>()
  const agreement = resolveAgreement(agreements, { at: now, relationId: benefit.relationId, campaignId: benefit.campaignId })
  const commissionCents = agreement ? computeNetworkCommission(agreement, { purchaseTotalCents, discountedTotalCents }) : 0
  const preview: RedeemResult = { dryRun: true, title: benefit.title, purchaseTotalCents, discountCents, discountedTotalCents, commissionCents, ledgerId: null }
  if (input.dryRun) return preview

  // Cupo de la campaña (atómico).
  const campaign = await NetworkCampaign.findById(benefit.campaignId).select('maxRedemptions').lean<{ maxRedemptions: number | null }>()
  const slotFilter: Record<string, unknown> = { _id: benefit.campaignId }
  if (campaign?.maxRedemptions) slotFilter.$expr = { $lt: ['$redeemedCount', campaign.maxRedemptions] }
  const slot = await NetworkCampaign.updateOne(slotFilter, { $inc: { redeemedCount: 1 } })
  if (slot.modifiedCount !== 1) throw new BenefitError(409, 'campaign_exhausted', 'La campaña alcanzó su máximo de canjes')

  // Un solo canje (atómico).
  const taken = await NetworkBenefit.findOneAndUpdate(
    { _id: benefit._id, status: 'issued' },
    { $set: { status: 'redeemed', redeemedAt: now, lastStep: step, redemptionRequestId: requestId } },
    { new: true },
  ).lean<any>()
  if (!taken) {
    await NetworkCampaign.updateOne({ _id: benefit.campaignId }, { $inc: { redeemedCount: -1 } })
    throw new BenefitError(409, 'status_redeemed', STATUS_MESSAGE.redeemed!)
  }

  let entry: any
  try {
    entry = await NetworkLedgerEntry.create({
      type: 'commission',
      idempotencyKey: `redeem:${benefit._id}`,
      benefitId: benefit._id, campaignId: benefit.campaignId, relationId: benefit.relationId,
      emitterTenantId: benefit.emitterTenantId, receiverTenantId: benefit.receiverTenantId, consumerUserId: benefit.consumerUserId,
      agreementId: agreement?._id ?? null, agreementVersion: agreement?.version ?? null,
      commissionPercent: agreement?.commissionPercent ?? 0, commissionBase: agreement?.commissionBase ?? 'discounted_total',
      capPerOperationCents: agreement?.capPerOperationCents ?? null,
      purchaseTotalCents, discountCents, discountedTotalCents, commissionCents,
      saleRef, reason: '', createdBy: input.actorName,
    })
  } catch (err) {
    // Sin movimiento no hay canje: se deshace para que se pueda reintentar.
    await NetworkBenefit.updateOne({ _id: benefit._id, status: 'redeemed' }, { $set: { status: 'issued', redeemedAt: null, redemptionRequestId: null } })
    await NetworkCampaign.updateOne({ _id: benefit.campaignId }, { $inc: { redeemedCount: -1 } })
    throw err
  }
  await NetworkBenefit.updateOne({ _id: benefit._id }, { $set: { redemptionLedgerId: entry._id } })

  // Piloto sin promo: el canje del motor cuenta como canje del piloto.
  try {
    const { default: NetworkPilotEvent } = await import('@/models/NetworkPilotEvent')
    const a = await NetworkPilotAssignment.findOne({ campaignId: benefit.campaignId, relationId: benefit.relationId, consumerUserId: benefit.consumerUserId }).lean<any>()
    if (a) await NetworkPilotEvent.create({ assignmentId: a._id, campaignId: a.campaignId, consumerUserId: a.consumerUserId, group: a.group, type: 'redeemed', tenantId: benefit.receiverTenantId, orderId: `redeem:${benefit._id}`, amountCents: discountedTotalCents, at: now }).catch(() => undefined)
  } catch { /* el piloto nunca frena un canje */ }

  return { ...preview, dryRun: false, ledgerId: String(entry._id) }
}

/** Revierte un canje (cancelación o devolución): movimiento negativo, sin reusar el beneficio. */
export async function reverseRedemption(input: { tenantId: string; ledgerId: string; reason: unknown; actorName: string }) {
  if (!mongoose.isValidObjectId(input.ledgerId)) throw new BenefitError(400, 'invalid_id', 'Canje inválido')
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : ''
  if (reason.length < 3) throw new BenefitError(400, 'reason_required', 'Indicá el motivo de la anulación')
  const original = await NetworkLedgerEntry.findOne({ _id: input.ledgerId, receiverTenantId: input.tenantId, type: 'commission' }).lean<any>()
  if (!original) throw new BenefitError(404, 'not_found', 'No encontramos el canje')
  try {
    const reversal = await NetworkLedgerEntry.create({
      type: 'reversal', idempotencyKey: `reverse:${original._id}`,
      benefitId: original.benefitId, campaignId: original.campaignId, relationId: original.relationId,
      emitterTenantId: original.emitterTenantId, receiverTenantId: original.receiverTenantId, consumerUserId: original.consumerUserId,
      agreementId: original.agreementId, agreementVersion: original.agreementVersion,
      commissionPercent: original.commissionPercent, commissionBase: original.commissionBase, capPerOperationCents: original.capPerOperationCents,
      purchaseTotalCents: -original.purchaseTotalCents, discountCents: -original.discountCents,
      discountedTotalCents: -original.discountedTotalCents, commissionCents: -original.commissionCents,
      saleRef: original.saleRef, reversesId: original._id, reason, createdBy: input.actorName,
    })
    await NetworkBenefit.updateOne({ _id: original.benefitId, status: 'redeemed' }, { $set: { status: 'reversed' } })
    await NetworkCampaign.updateOne({ _id: original.campaignId, redeemedCount: { $gt: 0 } }, { $inc: { redeemedCount: -1 } })
    return reversal
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw new BenefitError(409, 'already_reversed', 'Este canje ya fue anulado')
    throw err
  }
}

/** Canjes del propio comercio receptor (sin datos del emisor ni del historial del cliente). */
export async function receiverRedemptions(tenantId: string, limit = 200) {
  const entries = await NetworkLedgerEntry.find({ receiverTenantId: tenantId }).sort({ createdAt: -1 }).limit(limit).lean<any[]>()
  const benefits = await NetworkBenefit.find({ _id: { $in: entries.map(e => e.benefitId) } }).select('title ref').lean<any[]>()
  const benefitOf = new Map(benefits.map(b => [String(b._id), b]))
  const reversed = new Set(entries.filter(e => e.type === 'reversal').map(e => String(e.reversesId)))
  const { settlementStatusOf } = await import('./settlements')
  const settlement = await settlementStatusOf(entries.map(e => e._id))
  return entries.map(e => ({
    id: String(e._id), type: e.type, createdAt: e.createdAt,
    title: benefitOf.get(String(e.benefitId))?.title ?? '', ref: benefitOf.get(String(e.benefitId))?.ref ?? '',
    purchaseTotalCents: e.purchaseTotalCents, discountCents: e.discountCents, discountedTotalCents: e.discountedTotalCents,
    commissionCents: e.commissionCents, commissionPercent: e.commissionPercent, saleRef: e.saleRef,
    reversed: e.type === 'commission' && reversed.has(String(e._id)), reason: e.reason,
    settlement: settlement.get(String(e._id)) ?? 'pending',
  }))
}

/** Totales de la red para el superadmin (la liquidación llega en la etapa 6). */
export async function networkLedgerTotals() {
  const rows = await NetworkLedgerEntry.aggregate([{ $group: { _id: '$type', count: { $sum: 1 }, commission: { $sum: '$commissionCents' } } }])
  const by = Object.fromEntries(rows.map(r => [r._id, r]))
  const redemptions = (by.commission?.count ?? 0) - (by.reversal?.count ?? 0)
  const commission = (by.commission?.commission ?? 0) + (by.reversal?.commission ?? 0)
  const { collectedTotal } = await import('./settlements')
  const collected = await collectedTotal()
  return { redemptions, commissionsGeneratedCents: commission, commissionsPendingCents: Math.max(0, commission - collected), commissionsCollectedCents: collected }
}

/** Registro completo de canjes para el superadmin (emisor, receptor, consumidor, importes). */
export async function superadminRedemptions(limit = 300) {
  const entries = await NetworkLedgerEntry.find().sort({ createdAt: -1 }).limit(limit).lean<any[]>()
  const userIds = [...new Set(entries.map(e => String(e.consumerUserId)))]
  const users = await User.find({ _id: { $in: userIds } }).select('email name').lean<any[]>()
  const userOf = new Map(users.map(u => [String(u._id), u]))
  const benefits = await NetworkBenefit.find({ _id: { $in: entries.map(e => e.benefitId) } }).select('title ref').lean<any[]>()
  const benefitOf = new Map(benefits.map(b => [String(b._id), b]))
  const { settlementStatusOf } = await import('./settlements')
  const settlement = await settlementStatusOf(entries.map(e => e._id))
  return entries.map(e => ({
    id: String(e._id), type: e.type, createdAt: e.createdAt,
    emitterTenantId: String(e.emitterTenantId), receiverTenantId: String(e.receiverTenantId),
    consumer: userOf.get(String(e.consumerUserId))?.email ?? '',
    title: benefitOf.get(String(e.benefitId))?.title ?? '', ref: benefitOf.get(String(e.benefitId))?.ref ?? '',
    purchaseTotalCents: e.purchaseTotalCents, discountCents: e.discountCents, commissionCents: e.commissionCents,
    agreementVersion: e.agreementVersion, commissionPercent: e.commissionPercent, saleRef: e.saleRef, reason: e.reason,
    settlement: settlement.get(String(e._id)) ?? 'pending',
  }))
}

/**
 * Beneficio del motor para el seguimiento del pedido del emisor: guardado en
 * la cuenta, o link para reclamarlo (solo lo ve quien tiene el link de
 * seguimiento de ese pedido).
 */
export async function engineBenefitForTracking(orderId: string): Promise<null | { title: string; receiverName: string; saved: boolean; url: string }> {
  const b = await NetworkBenefit.findOne({ sourceOrderId: orderId, status: { $in: ['issued', 'pending_claim'] } }).sort({ createdAt: 1 }).lean<any>()
  if (!b) return null
  const { default: Tenant } = await import('@/models/Tenant')
  const receiver = await Tenant.findById(b.receiverTenantId).select('name').lean<{ name: string }>()
  if (b.status === 'issued') return { title: b.title, receiverName: receiver?.name ?? '', saved: true, url: '/app/beneficios' }
  const token = b.claimTokenEnc ? safeDecrypt(b.claimTokenEnc) : ''
  if (!token || !b.claimExpiresAt || new Date(b.claimExpiresAt) < new Date()) return null
  return { title: b.title, receiverName: receiver?.name ?? '', saved: false, url: `/app/beneficios?reclamar=${encodeURIComponent(token)}` }
}
