// ============================================================================
// Reglas de la red de beneficios (etapa 3) — funciones puras
// ============================================================================
// Informe 21/11/2026, §3–§4. Las usan las rutas del superadmin ahora y la
// emisión/canje (etapa 5) y las liquidaciones (etapa 6) después, así las
// reglas viven en un solo lugar.
// ============================================================================

export interface MemberLike {
  status: 'pending' | 'active' | 'suspended'
  canEmit: boolean
  canReceive: boolean
  receiverSuspension?: { reason: string } | null
}

export interface RelationLike {
  emitterTenantId: unknown
  receiverTenantId: unknown
  status: 'active' | 'paused'
}

export type EmitBlockReason =
  | 'emitter_not_member'
  | 'emitter_inactive'
  | 'emitter_cannot_emit'
  | 'receiver_not_member'
  | 'receiver_inactive'
  | 'receiver_cannot_receive'
  | 'receiver_suspended'
  | 'no_relation'
  | 'relation_paused'
  | 'same_tenant'

export const EMIT_BLOCK_LABELS: Record<EmitBlockReason, string> = {
  emitter_not_member: 'El emisor no está en la red',
  emitter_inactive: 'El emisor no está activo en la red',
  emitter_cannot_emit: 'El emisor no tiene habilitado emitir beneficios',
  receiver_not_member: 'El receptor no está en la red',
  receiver_inactive: 'El receptor no está activo en la red',
  receiver_cannot_receive: 'El receptor no tiene habilitado recibir beneficios',
  receiver_suspended: 'La recepción de beneficios del comercio está suspendida',
  no_relation: 'No hay una relación autorizada entre estos comercios',
  relation_paused: 'La relación entre estos comercios está pausada',
  same_tenant: 'Un comercio no emite beneficios para sí mismo',
}

/**
 * ¿Puede el emisor entregar NUEVOS beneficios para el receptor? Devuelve null
 * si puede, o el primer motivo que lo impide. Una suspensión de recepción
 * (p. ej. por deuda) solo corta beneficios nuevos hacia ese comercio.
 */
export function emitBlockReason(input: {
  emitterTenantId: unknown
  receiverTenantId: unknown
  emitter: MemberLike | null | undefined
  receiver: MemberLike | null | undefined
  relation: RelationLike | null | undefined
}): EmitBlockReason | null {
  if (String(input.emitterTenantId) === String(input.receiverTenantId)) return 'same_tenant'
  const { emitter, receiver, relation } = input
  if (!emitter) return 'emitter_not_member'
  if (emitter.status !== 'active') return 'emitter_inactive'
  if (!emitter.canEmit) return 'emitter_cannot_emit'
  if (!receiver) return 'receiver_not_member'
  if (receiver.status !== 'active') return 'receiver_inactive'
  if (!receiver.canReceive) return 'receiver_cannot_receive'
  if (receiver.receiverSuspension) return 'receiver_suspended'
  if (!relation) return 'no_relation'
  if (relation.status !== 'active') return 'relation_paused'
  return null
}

// ─── Acuerdos ───────────────────────────────────────────────────────────────

export interface AgreementLike {
  _id?: unknown
  scope: 'receiver' | 'relation' | 'campaign'
  relationId?: unknown
  campaignId?: unknown
  commissionPercent: number
  commissionBase: 'purchase_total' | 'discounted_total'
  capPerOperationCents: number | null
  debtThresholdCents: number
  validFrom: Date | string
  validTo: Date | string | null
  status: 'active' | 'superseded' | 'ended'
  version: number
}

function inWindow(a: AgreementLike, at: Date): boolean {
  const from = new Date(a.validFrom).getTime()
  const to = a.validTo ? new Date(a.validTo).getTime() : Infinity
  const t = at.getTime()
  return t >= from && t < to
}

/**
 * Acuerdo aplicable en un momento dado: el más específico vigente
 * (campaña > relación > receptor). Vigente = dentro de [validFrom, validTo).
 * Se mira la fecha, no solo el estado: un canje viejo reprocesado usa la
 * versión que regía cuando ocurrió.
 */
export function resolveAgreement<T extends AgreementLike>(
  agreements: readonly T[],
  ctx: { at: Date; relationId?: unknown; campaignId?: unknown },
): T | null {
  const candidates = agreements.filter(a => a.status !== 'ended' && inWindow(a, ctx.at))
  const pick = (scope: AgreementLike['scope'], match: (a: T) => boolean) =>
    candidates.filter(a => a.scope === scope && match(a)).sort((x, y) => y.version - x.version)[0] ?? null
  if (ctx.campaignId != null) {
    const c = pick('campaign', a => String(a.campaignId) === String(ctx.campaignId))
    if (c) return c
  }
  if (ctx.relationId != null) {
    const r = pick('relation', a => String(a.relationId) === String(ctx.relationId))
    if (r) return r
  }
  return pick('receiver', () => true)
}

/**
 * Comisión de red de una operación en centavos. La paga el receptor. Base:
 * total antes del beneficio o lo que pagó el cliente, según el acuerdo; con
 * tope por operación si lo hay. Nunca negativa.
 */
export function computeNetworkCommission(
  agreement: Pick<AgreementLike, 'commissionPercent' | 'commissionBase' | 'capPerOperationCents'>,
  amounts: { purchaseTotalCents: number; discountedTotalCents: number },
): number {
  const base = agreement.commissionBase === 'purchase_total' ? amounts.purchaseTotalCents : amounts.discountedTotalCents
  if (!(base > 0) || !(agreement.commissionPercent > 0)) return 0
  const raw = Math.round(base * agreement.commissionPercent / 100)
  return agreement.capPerOperationCents != null ? Math.min(raw, agreement.capPerOperationCents) : raw
}

/** ¿La deuda pendiente supera el umbral del acuerdo? (umbral 0 = no se permite deuda). */
export function isOverDebtThreshold(pendingDebtCents: number, thresholdCents: number): boolean {
  return pendingDebtCents > thresholdCents
}

// ─── Campañas ───────────────────────────────────────────────────────────────

export interface CampaignLike {
  status: 'draft' | 'active' | 'paused' | 'ended'
  validFrom: Date | string
  validTo: Date | string | null
  allowedEmitterTenantIds?: unknown[]
  benefit: { type: 'percent' | 'fixed'; value: number; maxDiscountCents: number | null }
  minPurchaseCents: number
}

/** ¿La campaña está activa y en fecha? */
export function isCampaignLive(c: CampaignLike, at: Date): boolean {
  if (c.status !== 'active') return false
  const t = at.getTime()
  if (t < new Date(c.validFrom).getTime()) return false
  return !c.validTo || t < new Date(c.validTo).getTime()
}

/** ¿Este emisor puede distribuir esta campaña? (lista vacía = cualquiera con relación activa). */
export function campaignAllowsEmitter(c: CampaignLike, emitterTenantId: unknown): boolean {
  const list = c.allowedEmitterTenantIds ?? []
  return list.length === 0 || list.some(id => String(id) === String(emitterTenantId))
}

/** Descuento que da el beneficio sobre una compra (centavos). 0 si no llega al mínimo. */
export function computeBenefitDiscount(c: Pick<CampaignLike, 'benefit' | 'minPurchaseCents'>, purchaseCents: number): number {
  if (!(purchaseCents > 0) || purchaseCents < c.minPurchaseCents) return 0
  if (c.benefit.type === 'fixed') return Math.min(purchaseCents, Math.round(c.benefit.value))
  const raw = Math.round(purchaseCents * c.benefit.value / 100)
  const capped = c.benefit.maxDiscountCents != null ? Math.min(raw, c.benefit.maxDiscountCents) : raw
  return Math.min(purchaseCents, capped)
}
