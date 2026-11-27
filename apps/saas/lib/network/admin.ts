// ============================================================================
// Administración de la red de beneficios — superadmin (etapa 3)
// ============================================================================
// Altas, aprobaciones, suspensiones, relaciones, acuerdos versionados y
// campañas. Todo lo comercial (porcentajes, base, topes, umbral de deuda,
// vigencias) entra por acá desde el panel: no hay valores fijos en el código.
// Cada operación queda en la auditoría de sistema (logAudit sin comercio).
// ============================================================================

import mongoose from 'mongoose'
import { z } from 'zod'
import Tenant from '@/models/Tenant'
import NetworkMember from '@/models/NetworkMember'
import NetworkRelation from '@/models/NetworkRelation'
import NetworkAgreement from '@/models/NetworkAgreement'
import NetworkCampaign from '@/models/NetworkCampaign'
import { logAudit } from '@/lib/audit'

export class NetworkError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export interface NetworkActor {
  userId: string | null
  name: string
}

const objectId = z.string().refine(v => mongoose.Types.ObjectId.isValid(v), 'Identificador inválido')
const cents = z.number().int('Los importes van en centavos').min(0).max(10_000_000_000)
const date = z.union([z.string(), z.date()]).transform(v => new Date(v)).refine(d => !Number.isNaN(d.getTime()), 'Fecha inválida')

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw)
  if (!r.success) throw new NetworkError(400, 'invalid_input', r.error.issues[0]?.message ?? 'Datos inválidos')
  return r.data
}

async function audit(actor: NetworkActor, action: string, entityId: string, details: Record<string, unknown>) {
  await logAudit({
    tenantId: null,
    userId: actor.userId,
    userName: actor.name,
    userRole: 'superadmin',
    action: `network.${action}`,
    entity: 'network',
    entityId,
    details,
  })
}

async function requireTenant(id: string) {
  const t = await Tenant.findById(id).select('_id name slug').lean<{ _id: mongoose.Types.ObjectId; name: string; slug: string }>()
  if (!t) throw new NetworkError(404, 'tenant_not_found', 'No encontramos el comercio')
  return t
}

// ─── Comercios adheridos ────────────────────────────────────────────────────

const addMemberSchema = z.object({
  tenantId: objectId,
  canEmit: z.boolean().optional().default(true),
  canReceive: z.boolean().optional().default(true),
  notes: z.string().trim().max(1000).optional().default(''),
})

/** Incorpora un comercio a la red. Queda pendiente hasta que se apruebe. */
export async function addMember(raw: unknown, actor: NetworkActor) {
  const input = parse(addMemberSchema, raw)
  await requireTenant(input.tenantId)
  if (await NetworkMember.exists({ tenantId: input.tenantId })) {
    throw new NetworkError(409, 'already_member', 'El comercio ya está en la red')
  }
  const member = await NetworkMember.create({
    tenantId: input.tenantId,
    status: 'pending',
    canEmit: input.canEmit,
    canReceive: input.canReceive,
    notes: input.notes,
    history: [{ at: new Date(), by: actor.name, action: 'added', note: input.notes }],
  })
  await audit(actor, 'member_added', String(member._id), { tenantId: input.tenantId })
  return member
}

const memberActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), note: z.string().trim().max(500).optional().default('') }),
  z.object({ action: z.literal('suspend'), note: z.string().trim().min(3, 'Indicá el motivo').max(500) }),
  z.object({ action: z.literal('reactivate'), note: z.string().trim().max(500).optional().default('') }),
  z.object({ action: z.literal('suspend_receiving'), reason: z.enum(['debt', 'other']), note: z.string().trim().min(3, 'Indicá el motivo').max(500) }),
  z.object({ action: z.literal('resume_receiving'), note: z.string().trim().max(500).optional().default('') }),
  z.object({ action: z.literal('permissions'), canEmit: z.boolean(), canReceive: z.boolean(), note: z.string().trim().max(500).optional().default('') }),
])

/**
 * Cambia el estado de un comercio en la red. Suspender la recepción solo
 * corta beneficios NUEVOS hacia ese comercio; nunca toca su operación SaaS.
 */
export async function updateMember(tenantId: string, raw: unknown, actor: NetworkActor) {
  if (!mongoose.Types.ObjectId.isValid(tenantId)) throw new NetworkError(400, 'invalid_input', 'Comercio inválido')
  const input = parse(memberActionSchema, raw)
  const member = await NetworkMember.findOne({ tenantId })
  if (!member) throw new NetworkError(404, 'not_member', 'El comercio no está en la red')
  const now = new Date()

  switch (input.action) {
    case 'approve':
      if (member.status !== 'pending') throw new NetworkError(409, 'invalid_state', 'Solo se aprueba un comercio pendiente')
      member.status = 'active'
      member.approvedAt = now
      member.approvedBy = actor.name
      break
    case 'suspend':
      if (member.status === 'suspended') throw new NetworkError(409, 'invalid_state', 'El comercio ya está suspendido')
      member.status = 'suspended'
      break
    case 'reactivate':
      if (member.status !== 'suspended') throw new NetworkError(409, 'invalid_state', 'Solo se reactiva un comercio suspendido')
      member.status = 'active'
      break
    case 'suspend_receiving':
      member.receiverSuspension = { at: now, by: actor.name, reason: input.reason, note: input.note }
      break
    case 'resume_receiving':
      if (!member.receiverSuspension) throw new NetworkError(409, 'invalid_state', 'La recepción no está suspendida')
      member.receiverSuspension = null
      break
    case 'permissions':
      member.canEmit = input.canEmit
      member.canReceive = input.canReceive
      break
  }
  member.history.push({ at: now, by: actor.name, action: input.action, note: input.note ?? '' })
  await member.save()
  await audit(actor, `member_${input.action}`, String(member._id), { tenantId, note: input.note ?? '' })
  return member
}

// ─── Relaciones ─────────────────────────────────────────────────────────────

const relationSchema = z.object({
  emitterTenantId: objectId,
  receiverTenantId: objectId,
  note: z.string().trim().max(500).optional().default(''),
})

/** Autoriza a un comercio a distribuir beneficios de otro (una dirección). */
export async function createRelation(raw: unknown, actor: NetworkActor) {
  const input = parse(relationSchema, raw)
  if (input.emitterTenantId === input.receiverTenantId) {
    throw new NetworkError(400, 'same_tenant', 'Un comercio no emite beneficios para sí mismo')
  }
  const members = await NetworkMember.find({ tenantId: { $in: [input.emitterTenantId, input.receiverTenantId] } }).select('tenantId').lean<Array<{ tenantId: unknown }>>()
  const ids = new Set(members.map(m => String(m.tenantId)))
  if (!ids.has(input.emitterTenantId) || !ids.has(input.receiverTenantId)) {
    throw new NetworkError(409, 'not_member', 'Los dos comercios tienen que estar incorporados a la red')
  }
  try {
    const relation = await NetworkRelation.create({ ...input, status: 'active', createdBy: actor.name })
    await audit(actor, 'relation_created', String(relation._id), input)
    return relation
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw new NetworkError(409, 'relation_exists', 'Esa relación ya existe')
    throw err
  }
}

export async function setRelationStatus(relationId: string, raw: unknown, actor: NetworkActor) {
  if (!mongoose.Types.ObjectId.isValid(relationId)) throw new NetworkError(400, 'invalid_input', 'Relación inválida')
  const { status } = parse(z.object({ status: z.enum(['active', 'paused']) }), raw)
  const relation = await NetworkRelation.findByIdAndUpdate(relationId, { $set: { status } }, { new: true })
  if (!relation) throw new NetworkError(404, 'relation_not_found', 'No encontramos la relación')
  await audit(actor, `relation_${status}`, relationId, {})
  return relation
}

// ─── Acuerdos comerciales (versionados) ─────────────────────────────────────

const agreementSchema = z.object({
  receiverTenantId: objectId,
  scope: z.enum(['receiver', 'relation', 'campaign']).default('receiver'),
  relationId: objectId.nullable().optional().default(null),
  campaignId: objectId.nullable().optional().default(null),
  commissionPercent: z.number().min(0, 'El porcentaje no puede ser negativo').max(100, 'Máximo 100 %'),
  commissionBase: z.enum(['purchase_total', 'discounted_total']).default('discounted_total'),
  capPerOperationCents: cents.nullable().optional().default(null),
  debtThresholdCents: cents,
  validFrom: date.optional(),
  note: z.string().trim().max(1000).optional().default(''),
}).superRefine((a, ctx) => {
  if (a.scope === 'relation' && !a.relationId) ctx.addIssue({ code: 'custom', message: 'Elegí la relación del acuerdo' })
  if (a.scope === 'campaign' && !a.campaignId) ctx.addIssue({ code: 'custom', message: 'Elegí la campaña del acuerdo' })
})

/**
 * Crea un acuerdo o una nueva versión. Si hay uno vigente del mismo alcance,
 * se cierra en el momento en que empieza el nuevo (validTo + 'superseded'):
 * las operaciones anteriores conservan las condiciones que tenían.
 */
export async function createAgreementVersion(raw: unknown, actor: NetworkActor) {
  const input = parse(agreementSchema, raw)
  await requireTenant(input.receiverTenantId)
  const member = await NetworkMember.findOne({ tenantId: input.receiverTenantId }).select('_id').lean()
  if (!member) throw new NetworkError(409, 'not_member', 'Incorporá el comercio a la red antes de cargar su acuerdo')

  const relationId = input.scope === 'relation' ? input.relationId : null
  const campaignId = input.scope === 'campaign' ? input.campaignId : null
  if (relationId) {
    const rel = await NetworkRelation.exists({ _id: relationId, receiverTenantId: input.receiverTenantId })
    if (!rel) throw new NetworkError(400, 'invalid_relation', 'La relación no corresponde a este comercio')
  }
  if (campaignId) {
    const camp = await NetworkCampaign.exists({ _id: campaignId, receiverTenantId: input.receiverTenantId })
    if (!camp) throw new NetworkError(400, 'invalid_campaign', 'La campaña no corresponde a este comercio')
  }

  const now = new Date()
  const validFrom = input.validFrom && input.validFrom > now ? input.validFrom : now
  const current = await NetworkAgreement.findOne({
    receiverTenantId: input.receiverTenantId, scope: input.scope, relationId, campaignId, status: 'active',
  }).sort({ version: -1 })

  if (current) {
    current.validTo = validFrom
    current.status = 'superseded'
    await current.save()
  }
  try {
    const agreement = await NetworkAgreement.create({
      receiverTenantId: input.receiverTenantId,
      scope: input.scope,
      relationId,
      campaignId,
      commissionPercent: input.commissionPercent,
      commissionBase: input.commissionBase,
      capPerOperationCents: input.capPerOperationCents,
      debtThresholdCents: input.debtThresholdCents,
      settlement: 'weekly',
      validFrom,
      validTo: null,
      status: 'active',
      version: (current?.version ?? 0) + 1,
      previousId: current?._id ?? null,
      createdBy: actor.name,
      note: input.note,
    })
    await audit(actor, current ? 'agreement_versioned' : 'agreement_created', String(agreement._id), {
      receiverTenantId: input.receiverTenantId, scope: input.scope, version: agreement.version,
      commissionPercent: input.commissionPercent, commissionBase: input.commissionBase,
      capPerOperationCents: input.capPerOperationCents, debtThresholdCents: input.debtThresholdCents,
    })
    return agreement
  } catch (err) {
    // Deshacer el cierre de la versión anterior si la nueva no se pudo crear.
    if (current) {
      current.validTo = null
      current.status = 'active'
      await current.save().catch(() => undefined)
    }
    throw err
  }
}

/** Da por terminado el acuerdo vigente (sin reemplazo). */
export async function endAgreement(agreementId: string, actor: NetworkActor) {
  if (!mongoose.Types.ObjectId.isValid(agreementId)) throw new NetworkError(400, 'invalid_input', 'Acuerdo inválido')
  const a = await NetworkAgreement.findOne({ _id: agreementId, status: 'active' })
  if (!a) throw new NetworkError(404, 'agreement_not_found', 'No hay un acuerdo vigente con ese id')
  a.status = 'ended'
  a.validTo = new Date()
  await a.save()
  await audit(actor, 'agreement_ended', agreementId, { receiverTenantId: String(a.receiverTenantId), version: a.version })
  return a
}

// ─── Campañas ───────────────────────────────────────────────────────────────

const campaignSchema = z.object({
  receiverTenantId: objectId,
  title: z.string().trim().min(3, 'Ingresá un título').max(120),
  description: z.string().trim().max(1000).optional().default(''),
  benefit: z.object({
    type: z.enum(['percent', 'fixed']),
    value: z.number().positive('El beneficio tiene que ser mayor a 0'),
    maxDiscountCents: cents.nullable().optional().default(null),
  }).superRefine((b, ctx) => {
    if (b.type === 'percent' && b.value > 100) ctx.addIssue({ code: 'custom', message: 'El descuento máximo es 100 %' })
    if (b.type === 'fixed' && !Number.isInteger(b.value)) ctx.addIssue({ code: 'custom', message: 'El importe fijo va en centavos' })
  }),
  minPurchaseCents: cents.optional().default(0),
  validFrom: date,
  validTo: date.nullable().optional().default(null),
  maxRedemptions: z.number().int().min(1).nullable().optional().default(null),
  perConsumerLimit: z.number().int().min(1).max(100).optional().default(1),
  benefitValidityDays: z.number().int().min(1).max(365).optional().default(30),
  allowedEmitterTenantIds: z.array(objectId).max(200).optional().default([]),
  status: z.enum(['draft', 'active', 'paused', 'ended']).optional().default('draft'),
  // Etapa 4: piloto con grupo de control (lo configura el superadmin).
  pilot: z.object({
    enabled: z.boolean(),
    controlPercent: z.number().min(0).max(90),
    qrPromoId: objectId.nullable().optional().default(null),
    windowDays: z.number().int().min(1).max(180).optional().default(30),
  }).nullable().optional().default(null),
}).superRefine((c, ctx) => {
  if (c.validTo && c.validTo <= c.validFrom) ctx.addIssue({ code: 'custom', message: 'La fecha de fin tiene que ser posterior al inicio' })
})

async function checkPilotPromo(receiverTenantId: string, pilot: { enabled: boolean; qrPromoId?: string | null } | null) {
  if (!pilot?.enabled) return
  if (!pilot.qrPromoId) throw new NetworkError(400, 'pilot_without_promo', 'Elegí la promo del receptor que hace de beneficio en el piloto')
  const { default: QrPromo } = await import('@/models/QrPromo')
  const ok = await QrPromo.exists({ _id: pilot.qrPromoId, tenantId: receiverTenantId })
  if (!ok) throw new NetworkError(400, 'pilot_promo_invalid', 'La promo elegida no es del comercio receptor')
}

async function checkCampaignEmitters(receiverTenantId: string, emitterIds: string[]) {
  if (emitterIds.length === 0) return
  const rels = await NetworkRelation.find({ receiverTenantId, emitterTenantId: { $in: emitterIds } }).select('emitterTenantId').lean<Array<{ emitterTenantId: unknown }>>()
  const ok = new Set(rels.map(r => String(r.emitterTenantId)))
  const missing = emitterIds.filter(id => !ok.has(id))
  if (missing.length) throw new NetworkError(400, 'emitter_without_relation', 'Uno de los emisores elegidos no tiene relación con este comercio')
}

export async function createCampaign(raw: unknown, actor: NetworkActor) {
  const input = parse(campaignSchema, raw)
  await requireTenant(input.receiverTenantId)
  const member = await NetworkMember.findOne({ tenantId: input.receiverTenantId }).select('canReceive').lean<{ canReceive: boolean }>()
  if (!member) throw new NetworkError(409, 'not_member', 'El comercio no está en la red')
  if (!member.canReceive) throw new NetworkError(409, 'cannot_receive', 'El comercio no tiene habilitado recibir beneficios')
  await checkCampaignEmitters(input.receiverTenantId, input.allowedEmitterTenantIds)
  await checkPilotPromo(input.receiverTenantId, input.pilot)
  const campaign = await NetworkCampaign.create({ ...input, createdBy: actor.name })
  await audit(actor, 'campaign_created', String(campaign._id), { receiverTenantId: input.receiverTenantId, title: input.title, status: input.status })
  return campaign
}

export async function updateCampaign(campaignId: string, raw: unknown, actor: NetworkActor) {
  if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new NetworkError(400, 'invalid_input', 'Campaña inválida')
  const existing = await NetworkCampaign.findById(campaignId)
  if (!existing) throw new NetworkError(404, 'campaign_not_found', 'No encontramos la campaña')
  // El receptor de una campaña no cambia (los beneficios ya emitidos lo usan).
  const input = parse(campaignSchema, { ...(raw as object), receiverTenantId: String(existing.receiverTenantId) })
  await checkCampaignEmitters(String(existing.receiverTenantId), input.allowedEmitterTenantIds)
  await checkPilotPromo(String(existing.receiverTenantId), input.pilot)
  // El % de control no cambia con el piloto en marcha: las asignaciones ya
  // hechas quedan como estaban (persistentes) y mezclar % sesga la medición.
  const prevPilot = (existing.toObject() as { pilot?: { enabled?: boolean; controlPercent?: number } | null }).pilot
  if (prevPilot?.enabled && input.pilot?.enabled && prevPilot.controlPercent !== input.pilot.controlPercent) {
    const { default: NetworkPilotAssignment } = await import('@/models/NetworkPilotAssignment')
    if (await NetworkPilotAssignment.exists({ campaignId })) {
      throw new NetworkError(409, 'pilot_running', 'El piloto ya tiene consumidores asignados: el % de control no se puede cambiar')
    }
  }
  existing.set({ ...input, receiverTenantId: existing.receiverTenantId })
  await existing.save()
  await audit(actor, 'campaign_updated', campaignId, { status: input.status, title: input.title })
  return existing
}

// ─── Vista general ──────────────────────────────────────────────────────────

/**
 * Todo lo de la red para el panel del superadmin. Los resultados de canjes y
 * comisiones se suman cuando existan (etapas 5–6); hoy van en 0.
 */
export async function networkOverview() {
  const [members, relations, agreements, campaigns] = await Promise.all([
    NetworkMember.find().sort({ createdAt: -1 }).lean(),
    NetworkRelation.find().sort({ createdAt: -1 }).lean(),
    NetworkAgreement.find().sort({ receiverTenantId: 1, scope: 1, version: -1 }).lean(),
    NetworkCampaign.find().sort({ createdAt: -1 }).lean(),
  ])
  const tenantIds = new Set<string>()
  for (const m of members as Array<{ tenantId: unknown }>) tenantIds.add(String(m.tenantId))
  const tenants = await Tenant.find({ _id: { $in: [...tenantIds] } }).select('name slug vertical').lean<Array<{ _id: unknown; name: string; slug: string; vertical?: string }>>()
  return {
    tenants: tenants.map(t => ({ id: String(t._id), name: t.name, slug: t.slug, vertical: t.vertical ?? 'gastronomia' })),
    members,
    relations,
    agreements,
    campaigns,
    results: { redemptions: 0, commissionsGeneratedCents: 0, commissionsPendingCents: 0, commissionsCollectedCents: 0, note: 'Los canjes y comisiones se registran desde la etapa 5.' },
  }
}
