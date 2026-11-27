// ============================================================================
// Piloto de beneficios con grupo de control (etapa 4)
// ============================================================================
// Informe 21/11/2026, §8: antes del motor completo se valida que la red genera
// ventas INCREMENTALES y no solo descuentos a quien ya compraba.
//
//   · Se reusan las promociones existentes: el beneficio es un QrPromo del
//     receptor (campaign.pilot.qrPromoId). El pedido guarda qrPromoId.
//   · Asignación persistente por consumidor y relación (NetworkPilotAssignment):
//     el grupo se decide UNA vez (hash determinístico) y queda guardado.
//   · El consumidor es la cuenta global con email verificado (§5): un pedido
//     sin cuenta verificada no entra al piloto.
//   · Todo se registra en NetworkPilotEvent (idempotente) y se mide por
//     PERSONAS, no solo por pedidos; el éxito no es «muchos canjes» sino la
//     diferencia de compra en el receptor entre beneficio y control.
//
// recordOrderForPilotSafe nunca tira: una falla del piloto jamás frena una venta.
// ============================================================================

import crypto from 'crypto'
import mongoose from 'mongoose'
import NetworkCampaign from '@/models/NetworkCampaign'
import NetworkRelation from '@/models/NetworkRelation'
import NetworkMember from '@/models/NetworkMember'
import NetworkPilotAssignment, { type PilotGroup } from '@/models/NetworkPilotAssignment'
import NetworkPilotEvent, { type PilotEventType } from '@/models/NetworkPilotEvent'
import User from '@/models/User'
import { safeDecrypt } from '@/lib/crypto'
import { campaignAllowsEmitter, emitBlockReason, isCampaignLive } from './rules'

// ─── Puro ───────────────────────────────────────────────────────────────────

/**
 * Grupo de un consumidor en un experimento: determinístico (mismo consumidor +
 * campaña + relación ⇒ mismo grupo) y repartido según el % de control.
 */
export function assignGroup(consumerUserId: string, campaignId: string, relationId: string, controlPercent: number): PilotGroup {
  if (!(controlPercent > 0)) return 'treatment'
  const h = crypto.createHash('sha256').update(`${campaignId}:${relationId}:${consumerUserId}`).digest()
  const bucket = h.readUInt32BE(0) % 100
  return bucket < Math.min(90, controlPercent) ? 'control' : 'treatment'
}

export interface PilotEventLike {
  assignmentId: unknown
  consumerUserId: unknown
  group: PilotGroup
  type: PilotEventType
  orderId: string
  amountCents: number
}

export interface GroupMetrics {
  /** Personas asignadas al grupo. */
  persons: number
  /** Personas con al menos una compra en el receptor en la ventana. */
  buyers: number
  /** buyers / persons (0–1). */
  conversion: number
  /** Pedidos en el receptor. */
  orders: number
  /** Facturación en el receptor (centavos). */
  revenueCents: number
  /** Facturación por persona asignada (centavos). */
  revenuePerPersonCents: number
  /** Beneficios entregados. */
  issued: number
  /** Compras que usaron la promo del piloto. */
  redemptions: number
  /** Personas que volvieron a comprar en el receptor. */
  repeatBuyers: number
}

export interface PilotMetrics {
  treatment: GroupMetrics
  control: GroupMetrics
  /** Diferencia de conversión (puntos porcentuales, beneficio − control). */
  liftPoints: number
  /** Facturación incremental estimada (centavos): (rev/persona beneficio − control) × personas beneficio. */
  incrementalRevenueCents: number
  /** Aviso sobre el tamaño de la muestra (los umbrales son hipótesis a revisar, §8). */
  sampleNote: string
}

function emptyGroup(): GroupMetrics {
  return { persons: 0, buyers: 0, conversion: 0, orders: 0, revenueCents: 0, revenuePerPersonCents: 0, issued: 0, redemptions: 0, repeatBuyers: 0 }
}

/** Métricas por grupo a partir de asignaciones y eventos (personas ≠ pedidos). */
export function computePilotMetrics(
  assignments: Array<{ _id: unknown; group: PilotGroup }>,
  events: PilotEventLike[],
): PilotMetrics {
  const groups: Record<PilotGroup, GroupMetrics> = { treatment: emptyGroup(), control: emptyGroup() }
  const groupOf = new Map<string, PilotGroup>()
  for (const a of assignments) {
    groupOf.set(String(a._id), a.group)
    groups[a.group].persons++
  }
  const buyers: Record<PilotGroup, Set<string>> = { treatment: new Set(), control: new Set() }
  const repeat: Record<PilotGroup, Set<string>> = { treatment: new Set(), control: new Set() }
  for (const e of events) {
    const g = groupOf.get(String(e.assignmentId))
    if (!g) continue
    const m = groups[g]
    const who = String(e.assignmentId)
    if (e.type === 'receiver_purchase') { m.orders++; m.revenueCents += e.amountCents; buyers[g].add(who) }
    if (e.type === 'issued') m.issued++
    if (e.type === 'redeemed') m.redemptions++
    if (e.type === 'repurchase') repeat[g].add(who)
  }
  for (const g of ['treatment', 'control'] as const) {
    const m = groups[g]
    m.buyers = buyers[g].size
    m.repeatBuyers = repeat[g].size
    m.conversion = m.persons ? m.buyers / m.persons : 0
    m.revenuePerPersonCents = m.persons ? Math.round(m.revenueCents / m.persons) : 0
  }
  const t = groups.treatment
  const c = groups.control
  const liftPoints = Math.round((t.conversion - c.conversion) * 10000) / 100
  const incrementalRevenueCents = Math.round((t.revenuePerPersonCents - c.revenuePerPersonCents) * t.persons)
  const sampleNote = c.persons < 100 || t.persons < 400
    ? `Muestra chica (${t.persons} con beneficio, ${c.persons} de control): el resultado todavía no es concluyente.`
    : 'Muestra suficiente para una primera lectura; confirmá con el volumen real de los comercios.'
  return { treatment: t, control: c, liftPoints, incrementalRevenueCents, sampleNote }
}

// ─── Con base de datos ──────────────────────────────────────────────────────

let pilotCache: { has: boolean; at: number } | null = null

/** ¿Hay algún piloto activo? (caché 1 min: los pedidos fuera del piloto no consultan nada más). */
async function anyPilotLive(): Promise<boolean> {
  if (pilotCache && Date.now() - pilotCache.at < 60_000) return pilotCache.has
  const has = Boolean(await NetworkCampaign.exists({ 'pilot.enabled': true, status: 'active' }))
  pilotCache = { has, at: Date.now() }
  return has
}

/** Solo tests: olvida la caché. */
export function __resetPilotCacheForTests() {
  pilotCache = null
}

interface OrderForPilot {
  _id: unknown
  tenantId: unknown
  status?: string
  total?: number
  qrPromoId?: string | null
  customer?: { email?: string | null } | null
  createdAt?: Date
}

/** Cuenta global con email verificado del pedido, o null. */
async function consumerOfOrder(order: OrderForPilot): Promise<mongoose.Types.ObjectId | null> {
  const raw = order.customer?.email
  if (!raw) return null
  const email = safeDecrypt(raw).toLowerCase().trim()
  if (!email.includes('@')) return null
  const user = await User.findOne({ email, role: 'consumer', emailVerified: { $ne: null }, isActive: { $ne: false } }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
  return user?._id ?? null
}

async function addEvent(doc: { assignmentId: unknown; campaignId: unknown; consumerUserId: unknown; group: PilotGroup; type: PilotEventType; tenantId: unknown; orderId: string; amountCents?: number; at: Date }): Promise<boolean> {
  try {
    await NetworkPilotEvent.create({ amountCents: 0, ...doc })
    return true
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) return false // ya registrado (idempotente)
    throw err
  }
}

export interface PilotRecordResult {
  eligible: number
  issued: number
  receiverPurchases: number
  redeemed: number
}

/**
 * Registra un pedido confirmado en los pilotos activos: como compra en un
 * EMISOR (elegible / beneficio entregado) y como compra en un RECEPTOR
 * (compra vinculada / canje / recompra). Idempotente.
 */
export async function recordOrderForPilot(order: OrderForPilot, now = new Date()): Promise<PilotRecordResult> {
  const result: PilotRecordResult = { eligible: 0, issued: 0, receiverPurchases: 0, redeemed: 0 }
  if (order.status === 'cancelled') return result
  if (!(await anyPilotLive())) return result
  const consumerUserId = await consumerOfOrder(order)
  if (!consumerUserId) return result
  const orderId = String(order._id)
  const tenantId = String(order.tenantId)

  // ── Lado EMISOR: el pedido hace elegible al consumidor ────────────────────
  const relations = await NetworkRelation.find({ emitterTenantId: tenantId, status: 'active' }).lean<Array<{ _id: mongoose.Types.ObjectId; emitterTenantId: mongoose.Types.ObjectId; receiverTenantId: mongoose.Types.ObjectId; status: 'active' | 'paused' }>>()
  if (relations.length) {
    const receiverIds = relations.map(r => r.receiverTenantId)
    const [campaigns, members] = await Promise.all([
      NetworkCampaign.find({ receiverTenantId: { $in: receiverIds }, status: 'active', 'pilot.enabled': true }).lean<any[]>(),
      NetworkMember.find({ tenantId: { $in: [tenantId, ...receiverIds] } }).lean<any[]>(),
    ])
    const memberOf = new Map(members.map(m => [String(m.tenantId), m]))
    for (const campaign of campaigns) {
      if (!isCampaignLive(campaign, now) || !campaignAllowsEmitter(campaign, tenantId)) continue
      const relation = relations.find(r => String(r.receiverTenantId) === String(campaign.receiverTenantId))
      if (!relation) continue
      const blocked = emitBlockReason({ emitterTenantId: tenantId, receiverTenantId: campaign.receiverTenantId, emitter: memberOf.get(tenantId), receiver: memberOf.get(String(campaign.receiverTenantId)), relation })
      if (blocked) continue

      const controlPercent = campaign.pilot?.controlPercent ?? 20
      let assignment = await NetworkPilotAssignment.findOne({ campaignId: campaign._id, relationId: relation._id, consumerUserId }).lean<any>()
      if (!assignment) {
        try {
          assignment = (await NetworkPilotAssignment.create({
            campaignId: campaign._id, relationId: relation._id, emitterTenantId: tenantId, receiverTenantId: campaign.receiverTenantId,
            consumerUserId, group: assignGroup(String(consumerUserId), String(campaign._id), String(relation._id), controlPercent),
            controlPercent, assignedAt: now, firstEligibleOrderId: orderId,
          })).toObject()
        } catch (err) {
          if ((err as { code?: number })?.code !== 11000) throw err
          assignment = await NetworkPilotAssignment.findOne({ campaignId: campaign._id, relationId: relation._id, consumerUserId }).lean<any>()
        }
      }
      if (!assignment) continue
      const base = { assignmentId: assignment._id, campaignId: campaign._id, consumerUserId, group: assignment.group as PilotGroup, tenantId, orderId, at: now }
      if (await addEvent({ ...base, type: 'eligible' })) result.eligible++
      if (assignment.group === 'treatment' && await addEvent({ ...base, type: 'issued' })) result.issued++
    }
  }

  // ── Lado RECEPTOR: compra vinculada, canje y recompra ─────────────────────
  const assignments = await NetworkPilotAssignment.find({ consumerUserId, receiverTenantId: tenantId }).lean<any[]>()
  if (assignments.length) {
    const campaigns = await NetworkCampaign.find({ _id: { $in: assignments.map(a => a.campaignId) } }).select('pilot').lean<any[]>()
    const campaignOf = new Map(campaigns.map(c => [String(c._id), c]))
    for (const a of assignments) {
      const campaign = campaignOf.get(String(a.campaignId))
      if (!campaign?.pilot) continue
      const windowEnd = new Date(a.assignedAt).getTime() + (campaign.pilot.windowDays ?? 30) * 86_400_000
      const orderAt = order.createdAt ? new Date(order.createdAt).getTime() : now.getTime()
      if (orderAt < new Date(a.assignedAt).getTime() || orderAt > windowEnd) continue
      const base = { assignmentId: a._id, campaignId: a.campaignId, consumerUserId, group: a.group as PilotGroup, tenantId, orderId, at: now, amountCents: Math.max(0, Math.round(order.total ?? 0)) }
      const previous = await NetworkPilotEvent.exists({ assignmentId: a._id, type: 'receiver_purchase', orderId: { $ne: orderId } })
      if (await addEvent({ ...base, type: 'receiver_purchase' })) {
        result.receiverPurchases++
        if (previous) await addEvent({ ...base, type: 'repurchase' })
      }
      const pilotPromo = campaign.pilot.qrPromoId ? String(campaign.pilot.qrPromoId) : null
      if (pilotPromo && order.qrPromoId && String(order.qrPromoId) === pilotPromo && await addEvent({ ...base, type: 'redeemed' })) result.redeemed++
    }
  }
  return result
}

/** Como recordOrderForPilot pero nunca tira (se llama al confirmar cualquier pedido). */
export async function recordOrderForPilotSafe(order: OrderForPilot): Promise<void> {
  try {
    await recordOrderForPilot(order)
  } catch (err) {
    console.warn('[network/pilot] no se pudo registrar el pedido en el piloto:', err instanceof Error ? err.message : err)
  }
}

/** Métricas de un piloto para el superadmin. */
export async function pilotMetrics(campaignId: string): Promise<PilotMetrics & { assignments: number }> {
  const [assignments, events] = await Promise.all([
    NetworkPilotAssignment.find({ campaignId }).select('_id group').lean<Array<{ _id: unknown; group: PilotGroup }>>(),
    NetworkPilotEvent.find({ campaignId }).select('assignmentId consumerUserId group type orderId amountCents').lean<PilotEventLike[]>(),
  ])
  return { ...computePilotMetrics(assignments, events), assignments: assignments.length }
}

/**
 * Beneficio entregado con un pedido del emisor (para mostrárselo al cliente en
 * el seguimiento). Solo del grupo beneficio; null si no corresponde.
 */
export async function benefitForOrder(orderId: string): Promise<null | { campaignTitle: string; description: string; receiverTenantId: string; qrPromoId: string | null }> {
  const issued = await NetworkPilotEvent.findOne({ orderId, type: 'issued' }).select('campaignId').lean<{ campaignId: unknown }>()
  if (!issued) return null
  const campaign = await NetworkCampaign.findById(issued.campaignId).select('title description receiverTenantId pilot status').lean<any>()
  if (!campaign || campaign.status !== 'active') return null
  return {
    campaignTitle: campaign.title,
    description: campaign.description ?? '',
    receiverTenantId: String(campaign.receiverTenantId),
    qrPromoId: campaign.pilot?.qrPromoId ? String(campaign.pilot.qrPromoId) : null,
  }
}

/**
 * Beneficio para mostrar en el seguimiento del pedido del emisor: título,
 * comercio receptor y link a la promo del piloto. Solo datos públicos (nada
 * del historial del consumidor ni de otros comercios).
 */
export async function networkBenefitForTracking(orderId: string): Promise<null | { title: string; description: string; receiverName: string; url: string | null }> {
  const benefit = await benefitForOrder(orderId)
  if (!benefit) return null
  const [{ default: Tenant }, { default: QrPromo }] = await Promise.all([import('@/models/Tenant'), import('@/models/QrPromo')])
  const receiver = await Tenant.findById(benefit.receiverTenantId).select('name slug').lean<{ name: string; slug: string }>()
  if (!receiver) return null
  const promo = benefit.qrPromoId
    ? await QrPromo.findOne({ _id: benefit.qrPromoId, tenantId: benefit.receiverTenantId, isEnabled: true }).select('slug').lean<{ slug?: string }>()
    : null
  return {
    title: benefit.campaignTitle,
    description: benefit.description,
    receiverName: receiver.name,
    url: promo?.slug ? `/${receiver.slug}/menu?source=qr&promo=${encodeURIComponent(promo.slug)}` : `/${receiver.slug}/menu`,
  }
}
