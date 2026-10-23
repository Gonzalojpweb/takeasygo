// ============================================================================
// Programa de referidos del club («Invitá y ganá») — fuente única de verdad
// ============================================================================
// Recorrido del invitado (cada paso suma puntos al que invita):
//   1. registered          se sumó al club con el link. Queda PENDIENTE hasta
//                          que haga su primera compra (un registro falso
//                          nunca paga).
//   2. first_online_order  primer pedido delivery o take away entregado.
//   3. visit               primer pedido consumido en el local (dine-in,
//                          QR de mesa) entregado.
//   4. second_order        segundo pedido (cualquier tipo) entregado dentro
//                          de `secondOrderWindowDays` desde el primero.
// Al completar TODOS los pasos activos, el que invita recibe el premio: un
// artículo de la tienda del club, como canje sin costo con código.
// El invitado recibe los puntos de bienvenida que el club ya tiene.
//
// Cómo se calcula (mismo criterio que las comisiones): el avance NO se
// guarda a mano desde cada evento; se RECALCULA de los pedidos reales del
// invitado (entregados, no cancelados, no borrados). Así un pedido cancelado
// después revierte solo, y un aviso repetido no paga dos veces:
//   · cada paso es una fila única (referido, paso) en ReferralEvent;
//   · cada cambio de estado es un update condicional: solo una llamada
//     gana la transición y aplica el $inc de puntos.
// Se sincroniza al entregar o cancelar un pedido (rutas de estado) y un
// cron diario de respaldo barre lo que haya quedado sin sincronizar.
//
// Antifraude: el link propio no vale (mismo miembro, teléfono, usuario,
// email o dispositivo); solo miembros NUEVOS (no ya registrados en el
// comercio ni clientes previos); un solo referidor por invitado; límite de
// invitados por mes por miembro; vigencia de la campaña.
// ============================================================================

import crypto from 'crypto'
import mongoose, { type Types } from 'mongoose'
import type { NextRequest } from 'next/server'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import Referral, { type IReferral } from '@/models/Referral'
import ReferralEvent, { type ReferralEventStatus } from '@/models/ReferralEvent'
import ReferralProgram, { REFERRAL_TASKS, type ReferralTask } from '@/models/ReferralProgram'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import { referralCookieName } from '@/lib/referrals-ui'

type Id = Types.ObjectId | string
const oid = (id: Id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)

/** Margen para que cuente el pedido del checkout que creó al miembro (se crea segundos antes). */
export const JOIN_GRACE_MS = 10 * 60_000
const MONTH_MS = 30 * 86_400_000
const DAY_MS = 86_400_000
/** Sin 0/O ni 1/I: se dicta y se escribe sin confusiones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const REFERRAL_TASK_LABEL: Record<ReferralTask, string> = {
  registered: 'Se sumó al club',
  first_online_order: 'Primera compra online',
  visit: 'Fue al local',
  second_order: 'Volvió a comprar',
}

// Cookie que recuerda el link con el que llegó el invitado (cualquier puerta
// de registro la lee). La escribe la página del link: lib/referrals-ui.
export { referralCookieName }

// ── Configuración ──────────────────────────────────────────────────────────

export interface ProgramConfig {
  enabled: boolean
  tasks: Record<ReferralTask, { enabled: boolean; points: number }>
  rewardStoreItemId: string | null
  rewardValidityDays: number
  secondOrderWindowDays: number
  monthlyInviteLimit: number
  startsAt: Date | null
  endsAt: Date | null
}

export const DEFAULT_PROGRAM: ProgramConfig = {
  enabled: false,
  tasks: {
    registered: { enabled: true, points: 50 },
    first_online_order: { enabled: true, points: 100 },
    visit: { enabled: true, points: 100 },
    second_order: { enabled: true, points: 150 },
  },
  rewardStoreItemId: null,
  rewardValidityDays: 30,
  secondOrderWindowDays: 30,
  monthlyInviteLimit: 20,
  startsAt: null,
  endsAt: null,
}

interface ProgramDoc {
  enabled?: boolean
  tasks?: Partial<Record<ReferralTask, { enabled?: boolean; points?: number }>>
  rewardStoreItemId?: Types.ObjectId | null
  rewardValidityDays?: number
  secondOrderWindowDays?: number
  monthlyInviteLimit?: number
  startsAt?: Date | null
  endsAt?: Date | null
}

export function programFromDoc(doc: ProgramDoc | null): ProgramConfig {
  if (!doc) return { ...DEFAULT_PROGRAM, tasks: { ...DEFAULT_PROGRAM.tasks } }
  const tasks = {} as ProgramConfig['tasks']
  for (const t of REFERRAL_TASKS) {
    tasks[t] = {
      enabled: doc.tasks?.[t]?.enabled ?? DEFAULT_PROGRAM.tasks[t].enabled,
      points: doc.tasks?.[t]?.points ?? DEFAULT_PROGRAM.tasks[t].points,
    }
  }
  return {
    enabled: doc.enabled ?? false,
    tasks,
    rewardStoreItemId: doc.rewardStoreItemId ? String(doc.rewardStoreItemId) : null,
    rewardValidityDays: doc.rewardValidityDays ?? DEFAULT_PROGRAM.rewardValidityDays,
    secondOrderWindowDays: doc.secondOrderWindowDays ?? DEFAULT_PROGRAM.secondOrderWindowDays,
    monthlyInviteLimit: doc.monthlyInviteLimit ?? DEFAULT_PROGRAM.monthlyInviteLimit,
    startsAt: doc.startsAt ?? null,
    endsAt: doc.endsAt ?? null,
  }
}

export async function loadProgram(tenantId: Id): Promise<ProgramConfig> {
  const doc = await ReferralProgram.findOne({ tenantId: oid(tenantId) }).lean<ProgramDoc | null>()
  return programFromDoc(doc)
}

/** ¿Se pueden sumar invitados nuevos ahora? (los ya sumados siguen su recorrido igual) */
export function isProgramOpen(p: ProgramConfig, now: Date = new Date()): boolean {
  if (!p.enabled) return false
  if (p.startsAt && now < p.startsAt) return false
  if (p.endsAt && now > p.endsAt) return false
  return REFERRAL_TASKS.some((t) => p.tasks[t].enabled)
}

export function activeTasks(p: ProgramConfig): ReferralTask[] {
  return REFERRAL_TASKS.filter((t) => p.tasks[t].enabled)
}

// ── Código y link ──────────────────────────────────────────────────────────

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null
}

function generateCode(length = 6): string {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** Devuelve el código del miembro; lo crea la primera vez (único por comercio). */
export async function ensureReferralCode(memberId: Id, tenantId: Id): Promise<string> {
  const current = await LoyaltyMember.findOne({ _id: oid(memberId), tenantId: oid(tenantId) })
    .select('referralCode')
    .lean<{ referralCode?: string | null } | null>()
  if (!current) throw new Error('Miembro no encontrado')
  if (current.referralCode) return current.referralCode
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCode(attempt < 3 ? 6 : 8)
    try {
      const updated = await LoyaltyMember.findOneAndUpdate(
        { _id: oid(memberId), tenantId: oid(tenantId), referralCode: null },
        { $set: { referralCode: code } },
        { returnDocument: 'after' },
      )
        .select('referralCode')
        .lean<{ referralCode?: string | null } | null>()
      if (updated?.referralCode) return updated.referralCode
      // Otra llamada lo creó primero: usar ese.
      const again = await LoyaltyMember.findById(oid(memberId)).select('referralCode').lean<{ referralCode?: string | null } | null>()
      if (again?.referralCode) return again.referralCode
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err // colisión: probar otro
    }
  }
  throw new Error('No se pudo generar el código de invitación')
}

/** Mismo identificador de dispositivo que usan los registros del club (rate limit). */
export function requestDeviceId(request: NextRequest): string {
  const ua = request.headers.get('user-agent') || ''
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const ipPrefix = ip.split('.').slice(0, 3).join('.')
  const lang = request.headers.get('accept-language') || ''
  return crypto.createHash('sha256').update(`${ua}|${ipPrefix}|${lang}`).digest('hex').slice(0, 32)
}

/** Código con el que llegó el invitado: el del cuerpo del pedido o la cookie del link. */
export function referralCodeFromRequest(request: NextRequest, tenantSlug: string, bodyCode?: unknown): string | null {
  return normalizeCode(bodyCode) ?? normalizeCode(request.cookies.get(referralCookieName(tenantSlug))?.value)
}

/** «Lucía Martínez» → «Lucía M.» (el que invita no ve datos completos de nadie). */
export function displayName(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Invitado'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

// ── Atribución (al crearse un miembro nuevo) ───────────────────────────────

export type AttachResult =
  | { attached: true; referralId: string }
  | { attached: false; reason: 'no_code' | 'program_closed' | 'invalid_code' | 'self' | 'already_member' | 'already_customer' | 'limit' | 'duplicate' }

interface MemberLike {
  _id: Types.ObjectId
  phoneHash?: string | null
  userId?: Types.ObjectId | null
  email?: string | null
  deviceFingerprints?: string[]
  joinedAt?: Date | null
}

/**
 * Vincula un miembro RECIÉN creado con quien lo invitó. Nunca lanza por
 * reglas de negocio: devuelve el motivo si no corresponde.
 */
export async function attachReferral(args: {
  tenantId: Id
  invitee: MemberLike
  code: string | null
  deviceId?: string | null
  now?: Date
}): Promise<AttachResult> {
  const now = args.now ?? new Date()
  const tenantId = oid(args.tenantId)
  const code = normalizeCode(args.code)
  if (!code) return { attached: false, reason: 'no_code' }

  const program = await loadProgram(tenantId)
  if (!isProgramOpen(program, now)) return { attached: false, reason: 'program_closed' }

  const referrer = await LoyaltyMember.findOne({ tenantId, referralCode: code, status: 'active' })
    .select('_id phoneHash userId email deviceFingerprints')
    .lean<MemberLike | null>()
  if (!referrer) return { attached: false, reason: 'invalid_code' }

  const invitee = args.invitee
  const sameEmail = !!invitee.email && !!referrer.email && invitee.email.toLowerCase().trim() === referrer.email.toLowerCase().trim()
  const sharedDevice = !!args.deviceId && (referrer.deviceFingerprints ?? []).includes(args.deviceId)
  if (
    String(referrer._id) === String(invitee._id) ||
    (!!invitee.phoneHash && invitee.phoneHash === referrer.phoneHash) ||
    (!!invitee.userId && !!referrer.userId && String(invitee.userId) === String(referrer.userId)) ||
    sameEmail ||
    sharedDevice
  ) {
    return { attached: false, reason: 'self' }
  }
  if (!invitee.phoneHash) return { attached: false, reason: 'already_member' }

  // Ya era miembro del comercio (otra sede, o una ficha anterior).
  const otherMember = await LoyaltyMember.exists({ tenantId, phoneHash: invitee.phoneHash, _id: { $ne: invitee._id } })
  if (otherMember) return { attached: false, reason: 'already_member' }

  // Ya era cliente: el programa es para clientes NUEVOS.
  const joinedAt = invitee.joinedAt ?? now
  const priorOrder = await Order.exists({
    tenantId,
    'customer.phoneHash': invitee.phoneHash,
    deletedAt: null,
    status: { $ne: 'cancelled' },
    createdAt: { $lt: new Date(joinedAt.getTime() - JOIN_GRACE_MS) },
  })
  if (priorOrder) return { attached: false, reason: 'already_customer' }

  if (program.monthlyInviteLimit > 0) {
    const recent = await Referral.countDocuments({ tenantId, referrerMemberId: referrer._id, createdAt: { $gte: new Date(now.getTime() - MONTH_MS) } })
    if (recent >= program.monthlyInviteLimit) return { attached: false, reason: 'limit' }
  }

  let referral: IReferral
  try {
    referral = await Referral.create({
      tenantId,
      referrerMemberId: referrer._id,
      inviteeMemberId: invitee._id,
      inviteePhoneHash: invitee.phoneHash,
      code,
      status: 'active',
      joinedAt,
    })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { attached: false, reason: 'duplicate' }
    throw err
  }

  // Paso 1: registrado, pendiente hasta la primera compra.
  if (program.tasks.registered.enabled) {
    await ReferralEvent.create({
      tenantId,
      referralId: referral._id,
      referrerMemberId: referrer._id,
      task: 'registered',
      points: program.tasks.registered.points,
      status: 'pending',
    }).catch((err) => {
      if ((err as { code?: number }).code !== 11000) throw err
    })
  }
  return { attached: true, referralId: String(referral._id) }
}

/**
 * Puerta común para las rutas que crean miembros: lee el código (cuerpo o
 * cookie del link) y vincula. Nunca lanza: el registro del club no puede
 * fallar por el programa de referidos.
 */
export async function attachReferralFromRequest(
  request: NextRequest,
  args: { tenantSlug: string; tenantId: Id; inviteeMemberId: Id; bodyCode?: unknown },
): Promise<AttachResult | null> {
  try {
    const code = referralCodeFromRequest(request, args.tenantSlug, args.bodyCode)
    if (!code) return { attached: false, reason: 'no_code' }
    const invitee = await LoyaltyMember.findOne({ _id: oid(args.inviteeMemberId), tenantId: oid(args.tenantId) })
      .select('_id phoneHash userId email deviceFingerprints joinedAt')
      .lean<MemberLike | null>()
    if (!invitee) return null
    return await attachReferral({ tenantId: args.tenantId, invitee, code, deviceId: requestDeviceId(request) })
  } catch (err) {
    console.error('[referrals] no se pudo vincular el referido', err)
    return null
  }
}

// ── Avance: se recalcula de los pedidos reales ─────────────────────────────

export interface QualifyingOrder {
  _id: Types.ObjectId
  orderMode: string
  createdAt: Date
}

export type TaskTargets = Record<ReferralTask, { met: boolean; orderId: Types.ObjectId | null }>

/**
 * Qué pasos se cumplen con estos pedidos (entregados, ordenados por fecha).
 * Pura: la usan la sincronización y los tests.
 */
export function computeTargets(orders: QualifyingOrder[], secondOrderWindowDays: number): TaskTargets {
  const first = orders[0] ?? null
  const online = orders.find((o) => o.orderMode === 'delivery' || o.orderMode === 'takeaway') ?? null
  const visit = orders.find((o) => o.orderMode === 'dine-in') ?? null
  const second = orders[1] ?? null
  const secondInWindow = !!first && !!second && second.createdAt.getTime() - first.createdAt.getTime() <= secondOrderWindowDays * DAY_MS
  return {
    registered: { met: !!first, orderId: first?._id ?? null },
    first_online_order: { met: !!online, orderId: online?._id ?? null },
    visit: { met: !!visit, orderId: visit?._id ?? null },
    second_order: { met: secondInWindow, orderId: secondInWindow ? second!._id : null },
  }
}

async function loadQualifyingOrders(referral: Pick<IReferral, 'tenantId' | 'inviteePhoneHash' | 'joinedAt'>): Promise<QualifyingOrder[]> {
  return Order.find({
    tenantId: referral.tenantId,
    'customer.phoneHash': referral.inviteePhoneHash,
    deletedAt: null,
    status: 'delivered',
    'payment.status': { $nin: ['rejected', 'cancelled'] },
    createdAt: { $gte: new Date(referral.joinedAt.getTime() - JOIN_GRACE_MS) },
  })
    .select('_id orderMode createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .limit(20)
    .lean<QualifyingOrder[]>()
}

async function applyPoints(memberId: Types.ObjectId, delta: number) {
  if (!delta) return
  await LoyaltyMember.updateOne({ _id: memberId }, { $inc: { 'loyalty.points': delta } })
}

/** pending|reverted → credited. Devuelve true si esta llamada ganó la transición. */
async function creditEvent(eventId: Types.ObjectId, orderId: Types.ObjectId | null, now: Date) {
  const flipped = await ReferralEvent.findOneAndUpdate(
    { _id: eventId, status: { $in: ['pending', 'reverted'] } },
    { $set: { status: 'credited', orderId, creditedAt: now, revertedAt: null } },
    { returnDocument: 'after' },
  ).lean<{ points: number; referrerMemberId: Types.ObjectId } | null>()
  if (!flipped) return false
  await applyPoints(flipped.referrerMemberId, flipped.points)
  return true
}

/** credited → reverted (o pending, en el registro). Resta los puntos una sola vez. */
async function revertEvent(eventId: Types.ObjectId, to: Extract<ReferralEventStatus, 'pending' | 'reverted'>, now: Date) {
  const flipped = await ReferralEvent.findOneAndUpdate(
    { _id: eventId, status: 'credited' },
    { $set: { status: to, revertedAt: now, ...(to === 'pending' ? { orderId: null } : {}) } },
    { returnDocument: 'after' },
  ).lean<{ points: number; referrerMemberId: Types.ObjectId } | null>()
  if (!flipped) return false
  await applyPoints(flipped.referrerMemberId, -flipped.points)
  return true
}

export interface SyncSummary {
  referralId: string
  credited: ReferralTask[]
  reverted: ReferralTask[]
  completed: boolean
  reward: 'granted' | 'revoked' | 'unchanged' | 'no_reward_configured' | 'reward_unavailable'
}

/**
 * Lleva un referido a su estado real. Idempotente: llamarlo N veces con los
 * mismos pedidos no cambia nada después de la primera.
 */
export async function syncReferral(referralId: Id, opts: { now?: Date } = {}): Promise<SyncSummary | null> {
  const now = opts.now ?? new Date()
  const referral = await Referral.findById(oid(referralId)).lean<IReferral | null>()
  if (!referral) return null
  const program = await loadProgram(referral.tenantId)
  const [orders, events] = await Promise.all([
    loadQualifyingOrders(referral),
    ReferralEvent.find({ referralId: referral._id }).lean<Array<{ _id: Types.ObjectId; task: ReferralTask; status: ReferralEventStatus }>>(),
  ])
  const targets = computeTargets(orders, program.secondOrderWindowDays)
  const byTask = new Map(events.map((e) => [e.task, e]))
  const summary: SyncSummary = { referralId: String(referral._id), credited: [], reverted: [], completed: false, reward: 'unchanged' }

  for (const task of REFERRAL_TASKS) {
    const existing = byTask.get(task)
    const target = targets[task]
    // Un paso desactivado después de empezar: lo ya ganado se respeta y no se suma nada nuevo.
    if (!program.tasks[task].enabled && !existing) continue

    if (target.met) {
      if (!existing) {
        try {
          const created = await ReferralEvent.create({
            tenantId: referral.tenantId,
            referralId: referral._id,
            referrerMemberId: referral.referrerMemberId,
            task,
            points: program.tasks[task].points,
            status: 'pending',
          })
          if (await creditEvent(created._id, target.orderId, now)) summary.credited.push(task)
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) throw err
          // Otra sincronización lo creó en paralelo: que acredite ella.
        }
      } else if (existing.status !== 'credited') {
        if (await creditEvent(existing._id, target.orderId, now)) summary.credited.push(task)
      }
    } else if (existing?.status === 'credited') {
      // El registro vuelve a "pendiente" (si compra de nuevo, se acredita otra vez).
      if (await revertEvent(existing._id, task === 'registered' ? 'pending' : 'reverted', now)) summary.reverted.push(task)
    }
  }

  // ¿Completó todos los pasos activos?
  const required = activeTasks(program)
  const fresh = await ReferralEvent.find({ referralId: referral._id, status: 'credited' }).select('task').lean<Array<{ task: ReferralTask }>>()
  const creditedTasks = new Set(fresh.map((e) => e.task))
  const completed = required.length > 0 && required.every((t) => creditedTasks.has(t))
  summary.completed = completed

  if (completed) {
    summary.reward = await grantReward(referral, program, now)
    if (referral.status !== 'completed') {
      await Referral.updateOne({ _id: referral._id, status: 'active' }, { $set: { status: 'completed', completedAt: now } })
    }
  } else {
    if (referral.reward?.state === 'granted') summary.reward = await revokeReward(referral, now)
    if (referral.status === 'completed') {
      await Referral.updateOne({ _id: referral._id }, { $set: { status: 'active', completedAt: null } })
    }
  }
  await Referral.updateOne({ _id: referral._id }, { $set: { lastSyncedAt: now } })
  return summary
}

// ── Premio final ───────────────────────────────────────────────────────────

async function grantReward(referral: IReferral, program: ProgramConfig, now: Date): Promise<SyncSummary['reward']> {
  if (referral.reward?.state === 'granted') return 'unchanged'
  if (!program.rewardStoreItemId) return 'no_reward_configured'

  // Reclamo atómico: una sola entrega aunque dos sincronizaciones lleguen juntas.
  const claimed = await Referral.findOneAndUpdate(
    { _id: referral._id, 'reward.state': { $in: ['none', 'revoked'] } },
    { $set: { 'reward.state': 'granting' } },
    { returnDocument: 'after' },
  ).lean()
  if (!claimed) return 'unchanged'

  const previous = referral.reward?.state ?? 'none'
  try {
    const item = await StoreItem.findOne({ _id: oid(program.rewardStoreItemId), tenantId: referral.tenantId, isActive: true })
      .select('_id cashValue stock')
      .lean<{ _id: Types.ObjectId; cashValue?: number | null; stock?: number | null } | null>()
    if (!item) {
      console.warn(`[referrals] premio no disponible (artículo ${program.rewardStoreItemId}) para el referido ${referral._id}`)
      await Referral.updateOne({ _id: referral._id, 'reward.state': 'granting' }, { $set: { 'reward.state': previous } })
      return 'reward_unavailable'
    }
    const redemption = await StoreRedemption.create({
      tenantId: referral.tenantId,
      memberId: referral.referrerMemberId,
      storeItemId: item._id,
      pointsUsed: 0,
      cashValue: item.cashValue ?? null,
      status: 'pending',
      source: 'standalone',
      referralId: referral._id,
      expiresAt: new Date(now.getTime() + program.rewardValidityDays * DAY_MS),
    })
    // Mismos contadores que un canje normal (al vencer o cancelarse se devuelven).
    if (typeof item.stock === 'number' && item.stock > 0) {
      await StoreItem.updateOne({ _id: item._id, stock: { $gt: 0 } }, { $inc: { stock: -1, totalRedemptions: 1 } })
    } else {
      await StoreItem.updateOne({ _id: item._id }, { $inc: { totalRedemptions: 1 } })
    }
    await LoyaltyMember.updateOne(
      { _id: referral.referrerMemberId },
      { $inc: { 'store.totalRedemptions': 1 }, $set: { 'store.lastRedemptionAt': now } },
    )
    await Referral.updateOne(
      { _id: referral._id },
      { $set: { 'reward.state': 'granted', 'reward.storeItemId': item._id, 'reward.redemptionId': redemption._id, 'reward.grantedAt': now, 'reward.revokedAt': null } },
    )
    return 'granted'
  } catch (err) {
    await Referral.updateOne({ _id: referral._id, 'reward.state': 'granting' }, { $set: { 'reward.state': previous } }).catch(() => undefined)
    throw err
  }
}

/** Se cayó un paso: si el premio todavía no se usó, se cancela. Si ya se usó, queda. */
async function revokeReward(referral: IReferral, now: Date): Promise<SyncSummary['reward']> {
  const claimed = await Referral.findOneAndUpdate(
    { _id: referral._id, 'reward.state': 'granted' },
    { $set: { 'reward.state': 'revoked', 'reward.revokedAt': now } },
    { returnDocument: 'after' },
  ).lean<IReferral | null>()
  if (!claimed?.reward?.redemptionId) return 'unchanged'
  const cancelled = await StoreRedemption.findOneAndUpdate(
    { _id: claimed.reward.redemptionId, status: 'pending' },
    { $set: { status: 'cancelled' } },
    { returnDocument: 'after' },
  ).lean<{ storeItemId: Types.ObjectId } | null>()
  if (cancelled) {
    const item = await StoreItem.findById(cancelled.storeItemId).select('stock').lean<{ stock?: number | null } | null>()
    await StoreItem.updateOne(
      { _id: cancelled.storeItemId },
      typeof item?.stock === 'number' ? { $inc: { stock: 1, totalRedemptions: -1 } } : { $inc: { totalRedemptions: -1 } },
    )
    await LoyaltyMember.updateOne({ _id: referral.referrerMemberId, 'store.totalRedemptions': { $gt: 0 } }, { $inc: { 'store.totalRedemptions': -1 } })
  } else {
    console.warn(`[referrals] el premio del referido ${referral._id} ya se había usado: queda entregado`)
  }
  return 'revoked'
}

// ── Disparadores ───────────────────────────────────────────────────────────

/**
 * Llamar cuando un pedido se entrega o se cancela. Nunca lanza: es un
 * efecto secundario del cambio de estado del pedido.
 */
export async function syncReferralsForOrder(order: { tenantId?: Id | null; customer?: { phoneHash?: string | null } | null }): Promise<void> {
  try {
    const phoneHash = order.customer?.phoneHash
    if (!order.tenantId || !phoneHash) return
    const referrals = await Referral.find({ tenantId: oid(order.tenantId), inviteePhoneHash: phoneHash }).select('_id').lean<Array<{ _id: Types.ObjectId }>>()
    for (const r of referrals) await syncReferral(r._id)
  } catch (err) {
    console.error('[referrals] no se pudo sincronizar el avance del pedido', err)
  }
}

/** Respaldo del cron: referidos de los últimos `sinceDays` días. */
export async function syncRecentReferrals(opts: { sinceDays?: number; limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - (opts.sinceDays ?? 120) * DAY_MS)
  const referrals = await Referral.find({ joinedAt: { $gte: since } })
    .select('_id')
    .sort({ lastSyncedAt: 1 })
    .limit(opts.limit ?? 500)
    .lean<Array<{ _id: Types.ObjectId }>>()
  let changed = 0
  let failed = 0
  for (const r of referrals) {
    try {
      const s = await syncReferral(r._id, { now })
      if (s && (s.credited.length || s.reverted.length || s.reward === 'granted' || s.reward === 'revoked')) changed++
    } catch (err) {
      failed++
      console.error('[referrals] cron: falló el referido', String(r._id), err)
    }
  }
  return { scanned: referrals.length, changed, failed }
}

// ── Vistas ─────────────────────────────────────────────────────────────────

export type StepView = 'credited' | 'pending' | 'reverted' | 'todo'

export interface InviteeView {
  referralId: string
  name: string
  joinedAt: string
  steps: Record<ReferralTask, StepView>
  pointsEarned: number
  completed: boolean
  rewardState: IReferral['reward']['state']
}

async function inviteeViews(referrals: IReferral[]): Promise<InviteeView[]> {
  if (referrals.length === 0) return []
  const ids = referrals.map((r) => r._id)
  const [events, invitees] = await Promise.all([
    ReferralEvent.find({ referralId: { $in: ids } }).select('referralId task status points').lean<Array<{ referralId: Types.ObjectId; task: ReferralTask; status: ReferralEventStatus; points: number }>>(),
    LoyaltyMember.find({ _id: { $in: referrals.map((r) => r.inviteeMemberId) } }).select('_id name').lean<Array<{ _id: Types.ObjectId; name: string }>>(),
  ])
  const names = new Map(invitees.map((m) => [String(m._id), m.name]))
  return referrals.map((r) => {
    const mine = events.filter((e) => String(e.referralId) === String(r._id))
    const steps = {} as Record<ReferralTask, StepView>
    for (const t of REFERRAL_TASKS) steps[t] = (mine.find((e) => e.task === t)?.status as StepView | undefined) ?? 'todo'
    return {
      referralId: String(r._id),
      name: displayName(names.get(String(r.inviteeMemberId))),
      joinedAt: r.joinedAt.toISOString(),
      steps,
      pointsEarned: mine.filter((e) => e.status === 'credited').reduce((s, e) => s + e.points, 0),
      completed: r.status === 'completed',
      rewardState: r.reward?.state ?? 'none',
    }
  })
}

/** Pantalla «Invitá y ganá» del miembro. */
export async function loadMemberReferralView(tenantId: Id, memberId: Id) {
  const program = await loadProgram(tenantId)
  const open = isProgramOpen(program)
  const tid = oid(tenantId)
  const mid = oid(memberId)
  const referrals = await Referral.find({ tenantId: tid, referrerMemberId: mid }).sort({ joinedAt: -1 }).limit(100).lean<IReferral[]>()
  const invitees = await inviteeViews(referrals)
  const pending = await ReferralEvent.find({ tenantId: tid, referrerMemberId: mid, status: 'pending' }).select('points').lean<Array<{ points: number }>>()
  const redemptionIds = referrals.map((r) => r.reward?.redemptionId).filter(Boolean) as Types.ObjectId[]
  const redemptions = redemptionIds.length
    ? await StoreRedemption.find({ _id: { $in: redemptionIds } }).select('redemptionCode status expiresAt storeItemId').lean<Array<{ _id: Types.ObjectId; redemptionCode: string; status: string; expiresAt?: Date | null; storeItemId: Types.ObjectId }>>()
    : []
  const itemIds = [...new Set([...redemptions.map((r) => String(r.storeItemId)), ...(program.rewardStoreItemId ? [program.rewardStoreItemId] : [])])]
  const items = itemIds.length
    ? await StoreItem.find({ _id: { $in: itemIds.map((i) => oid(i)) } }).select('_id name').lean<Array<{ _id: Types.ObjectId; name: string }>>()
    : []
  const itemName = new Map(items.map((i) => [String(i._id), i.name]))
  return {
    open,
    code: open || referrals.length ? await ensureReferralCode(mid, tid) : null,
    program: {
      tasks: activeTasks(program).map((t) => ({ task: t, label: REFERRAL_TASK_LABEL[t], points: program.tasks[t].points })),
      reward: program.rewardStoreItemId ? { name: itemName.get(program.rewardStoreItemId) ?? 'Premio del club' } : null,
      secondOrderWindowDays: program.secondOrderWindowDays,
      endsAt: program.endsAt?.toISOString() ?? null,
    },
    stats: {
      invited: invitees.length,
      completed: invitees.filter((i) => i.completed).length,
      pointsEarned: invitees.reduce((s, i) => s + i.pointsEarned, 0),
      pointsPending: pending.reduce((s, e) => s + e.points, 0),
    },
    invitees,
    rewards: redemptions.map((r) => ({
      code: r.redemptionCode,
      status: r.status,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      name: itemName.get(String(r.storeItemId)) ?? 'Premio del club',
    })),
  }
}

/** Panel del admin: ranking de los que más invitan y últimos referidos. */
export async function loadAdminReferralOverview(tenantId: Id) {
  const tid = oid(tenantId)
  const referrals = await Referral.find({ tenantId: tid }).sort({ joinedAt: -1 }).limit(200).lean<IReferral[]>()
  const invitees = await inviteeViews(referrals)
  const referrerIds = [...new Set(referrals.map((r) => String(r.referrerMemberId)))]
  const referrers = referrerIds.length
    ? await LoyaltyMember.find({ _id: { $in: referrerIds.map((i) => oid(i)) } }).select('_id name').lean<Array<{ _id: Types.ObjectId; name: string }>>()
    : []
  const referrerName = new Map(referrers.map((m) => [String(m._id), m.name]))
  const ranking = new Map<string, { name: string; invited: number; completed: number; points: number }>()
  referrals.forEach((r, i) => {
    const key = String(r.referrerMemberId)
    const row = ranking.get(key) ?? { name: referrerName.get(key) ?? 'Miembro', invited: 0, completed: 0, points: 0 }
    row.invited++
    if (invitees[i].completed) row.completed++
    row.points += invitees[i].pointsEarned
    ranking.set(key, row)
  })
  return {
    totals: {
      referrals: referrals.length,
      completed: invitees.filter((i) => i.completed).length,
      withPurchase: invitees.filter((i) => i.steps.first_online_order === 'credited' || i.steps.visit === 'credited').length,
      rewardsGranted: referrals.filter((r) => r.reward?.state === 'granted').length,
      pointsCredited: invitees.reduce((s, i) => s + i.pointsEarned, 0),
    },
    ranking: [...ranking.entries()].map(([memberId, v]) => ({ memberId, ...v })).sort((a, b) => b.completed - a.completed || b.invited - a.invited).slice(0, 20),
    recent: referrals.slice(0, 50).map((r, i) => ({ ...invitees[i], referrerName: referrerName.get(String(r.referrerMemberId)) ?? 'Miembro' })),
  }
}
