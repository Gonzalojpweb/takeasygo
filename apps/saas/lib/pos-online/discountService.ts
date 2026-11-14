import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import Order from '@/models/Order'
import FiscalDocument from '@/models/FiscalDocument'
import PosDiscountEvent, { type DiscountApprovalMode } from '@/models/PosDiscountEvent'
import { logAudit } from '@/lib/audit'
import {
  canApproveDiscount,
  checkDiscountReason,
  evaluateDiscount,
  type DiscountAmounts,
  type DiscountDecision,
  type DiscountPolicy,
} from '@takeasygo/business'
import { MANAGER_PIN_HEADER, OFFLINE_APPROVER_HEADER, requireManagerApproval, type Approval } from './approval'
import { PosError } from './errors'
import type { PosContext } from './tenantContext'
import { recomputeOrderTotals } from './orderMapper'
import { assertNotPaid, type PosOrderDoc } from './orderRepo'
import { operatorName } from './operator'
import { resolvePosRole } from './permissions'
import { trustedOfflineAt } from './offlineReplay'
import { loadDiscountPolicy, loadDiscountPolicyAt } from './discountPolicy'
import { applyDiscount, distributeCents, grossOf, removeDiscount, type DiscountInput, type DiscountedItem } from './discounts'

// ============================================================================
// Aplicar / quitar descuentos sobre órdenes del POS (Fase D, 2026-10;
// política por comercio 14/11/2026)
// ============================================================================
// Lo usan POST/DELETE /pos/orders/[id]/discounts (por ítem o por orden) y
// POST/DELETE /pos/tables/[id]/discount (toda la cuenta de la mesa).
// Reglas:
//   · capacidad `orders.pay` en la ruta (el mozo no descuenta).
//   · la POLÍTICA DEL COMERCIO (@takeasygo/business/discount-policy) decide
//     si el rol puede, si alcanza solo o necesita el PIN de alguien que lo
//     cubra (encargado/admin), y los topes. Se evalúa sobre el descuento
//     RESULTANTE de la cuenta: la orden, o todas las rondas sin cobrar de la
//     mesa si la orden es de una mesa (partirlo no esquiva el límite).
//   · quitar un descuento no pide PIN (sube el importe).
//   · solo órdenes sin cobrar (ni en el POS ni online), sin factura emitida,
//     no anuladas ni cerradas.
//   · concurrencia optimista por updatedAt, como el resto del POS.
//   · cada operación queda en PosDiscountEvent (reporte) y en la auditoría.
// ============================================================================

const CLOSED_STATUSES = new Set(['delivered', 'cancelled'])

type OrderDoc = PosOrderDoc & {
  _id?: mongoose.Types.ObjectId
  voided?: unknown
  payment?: { status?: string; method?: string } | null
}

export const DISCOUNT_PIN_INVALID = 'PIN incorrecto o de alguien que no puede autorizar este descuento'

/** Chequeos sin base de datos (sirven también para órdenes ya cargadas en lote). */
export function assertDiscountable(order: OrderDoc): void {
  assertNotPaid(order)
  if (CLOSED_STATUSES.has(order.status) || order.voided) {
    throw PosError.conflict(`No se puede descontar una orden en estado ${order.status}`)
  }
  // Pagada online (app / MP): bajar el total la descuadraría con lo cobrado.
  // Ojo: las órdenes del POS en efectivo NACEN con status 'approved' (el cobro
  // real es posPayments); solo un medio no-efectivo aprobado es dinero cobrado.
  if (order.payment?.status === 'approved' && (order.payment.method ?? 'cash') !== 'cash') {
    throw PosError.conflict('La orden ya está pagada: no se puede cambiar su importe')
  }
}

/**
 * Con factura emitida el importe ya es un comprobante fiscal: cambiarlo lo
 * descuadra. Corresponde anular y refacturar (nota de crédito).
 */
async function assertNotInvoiced(ctx: PosContext, orders: OrderDoc[]): Promise<void> {
  const ids = orders.map((o) => o._id).filter((id): id is mongoose.Types.ObjectId => Boolean(id))
  if (ids.length === 0) return
  const invoiced = await FiscalDocument.exists({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    orderId: { $in: ids },
    kind: 'invoice',
    status: { $ne: 'rejected' },
  })
  if (invoiced) {
    throw PosError.conflict('La cuenta ya tiene factura emitida: no se puede cambiar su importe. Anulá la factura (nota de crédito) primero.')
  }
}

// ── Importes de la cuenta ───────────────────────────────────────────────────

function grossOfItems(items: DiscountedItem[]): number {
  return items.reduce((s, i) => s + grossOf(i), 0)
}

function discountOfItems(items: DiscountedItem[]): number {
  return items.reduce((s, i) => s + (i.posDiscount?.amountCents ?? 0), 0)
}

function totalOfItems(items: DiscountedItem[]): number {
  return recomputeOrderTotals(items).total
}

/** Mismo estado de descuentos en todas las líneas ⇒ la operación no cambia nada. */
function sameDiscounts(a: DiscountedItem[], b: DiscountedItem[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, i) => {
    const x = item.posDiscount
    const y = b[i].posDiscount
    if (!x || !y) return !x && !y
    return x.amountCents === y.amountCents && x.kind === y.kind && x.value === y.value && x.reason === y.reason && (x.note ?? null) === (y.note ?? null)
  })
}

/** Rondas sin cobrar de una mesa, en orden de creación. */
export async function openTableRounds(ctx: { tenantId: string; locationId: string }, tableId: string): Promise<OrderDoc[]> {
  const docs = await Order.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posTableId: tableId,
    status: { $nin: ['delivered', 'cancelled'] },
    voided: { $exists: false },
    $or: [{ posPayments: { $exists: false } }, { posPayments: { $size: 0 } }],
  })
    .sort({ createdAt: 1 })
    .lean()
    .exec()
  return docs as unknown as OrderDoc[]
}

/**
 * Cuenta sobre la que se evalúa la política: la mesa entera si la orden es de
 * una mesa (sus rondas sin cobrar), si no la orden sola. `replaced` son las
 * líneas nuevas de las rondas que cambia la operación.
 */
function accountAmounts(rounds: OrderDoc[], replaced: Map<string, DiscountedItem[]>): DiscountAmounts {
  let grossCents = 0
  let discountCents = 0
  let previousDiscountCents = 0
  for (const round of rounds) {
    const before = round.items as DiscountedItem[]
    const after = replaced.get(String(round.posId)) ?? before
    grossCents += grossOfItems(before)
    previousDiscountCents += discountOfItems(before)
    discountCents += discountOfItems(after)
  }
  return { grossCents, discountCents, previousDiscountCents }
}

// ── Autorización por política ───────────────────────────────────────────────

export interface DiscountAuthorization {
  approval: Approval
  mode: DiscountApprovalMode
  policyVersion: number
}

function rank(d: DiscountDecision): number {
  return d.kind === 'allow' ? 2 : d.kind === 'approval' ? 1 : 0
}

/**
 * Decide con la política del comercio y, si hace falta, pide el PIN de quien
 * lo pueda autorizar. Una operación hecha SIN internet (equipo habilitado)
 * también se acepta si era válida con la política que regía en ese momento:
 * un cambio de política posterior no rechaza lo que el equipo hizo bien.
 */
export async function authorizeDiscount(
  ctx: PosContext,
  input: Pick<DiscountInput, 'reason' | 'note'>,
  amounts: DiscountAmounts
): Promise<DiscountAuthorization> {
  const role = resolvePosRole(ctx.user.role)
  const current = await loadDiscountPolicy(ctx.tenantId)
  const candidates: { version: number; policy: DiscountPolicy }[] = [current]
  const offlineAt = ctx.offline ? await trustedOfflineAt(ctx) : null
  if (offlineAt) {
    const then = await loadDiscountPolicyAt(ctx.tenantId, offlineAt)
    if (then && then.version !== current.version) candidates.push(then)
  }

  // La primera política (vigente, luego la del momento offline) con el mejor resultado.
  const evaluated = candidates.map((c) => {
    const reasonError = checkDiscountReason(c.policy, input.reason, input.note)
    const decision: DiscountDecision = reasonError ? { kind: 'deny', message: reasonError } : evaluateDiscount(c.policy, role, amounts)
    return { ...c, decision }
  })
  const chosen = evaluated.reduce((best, e) => (rank(e.decision) > rank(best.decision) ? e : best), evaluated[0])
  const { decision, version } = chosen
  // Con PIN: vale quien lo cubra con CUALQUIERA de las políticas que pedían PIN
  // (primero la vigente). Se registra la versión que efectivamente lo habilitó.
  const approvalPolicies = evaluated.filter((e) => e.decision.kind === 'approval')
  let approvedUnder = version

  if (decision.kind === 'deny') throw PosError.forbidden(decision.message)
  if (decision.kind === 'allow') {
    return { approval: { approvedBy: ctx.user.id, approverName: null, viaPin: false }, mode: 'self', policyVersion: version }
  }

  const usedOfflineHeader = !ctx.request.headers.get(MANAGER_PIN_HEADER) && Boolean(ctx.request.headers.get(OFFLINE_APPROVER_HEADER)) && Boolean(ctx.offline)
  const approval = await requireManagerApproval(ctx, 'order.discount', decision.message, {
    requireOther: true,
    approverCheck: (approverRole) => {
      const match = approvalPolicies.find((e) => canApproveDiscount(e.policy, approverRole, amounts))
      if (match) approvedUnder = match.version
      return Boolean(match)
    },
    invalidMessage: DISCOUNT_PIN_INVALID,
  })
  return { approval, mode: usedOfflineHeader ? 'offline_pin' : 'pin', policyVersion: approvedUnder }
}

// ── Guardado + registro ─────────────────────────────────────────────────────

async function saveDiscountedItems(ctx: PosContext, order: OrderDoc, items: DiscountedItem[]): Promise<OrderDoc> {
  const { subtotal, total, baseTotal } = recomputeOrderTotals(items)
  const updated = await Order.findOneAndUpdate(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posId: order.posId, updatedAt: order.updatedAt },
    { $set: { items, subtotal, total, 'payment.baseTotal': baseTotal } },
    { new: true }
  )
    .lean()
    .exec()
  if (!updated) {
    throw PosError.conflict('La orden cambió mientras se procesaba la petición', `posId=${order.posId}`)
  }
  return updated as unknown as OrderDoc
}

interface EventMeta {
  groupId: string
  scope: 'item' | 'order' | 'table'
  lineId: string | null
  account: DiscountAmounts
  auth: DiscountAuthorization | null
  byName: string
}

async function recordEvent(
  ctx: PosContext,
  action: 'apply' | 'remove',
  before: OrderDoc,
  after: OrderDoc,
  input: DiscountInput | null,
  meta: EventMeta
): Promise<void> {
  const beforeItems = before.items as DiscountedItem[]
  const afterItems = after.items as DiscountedItem[]
  const line = meta.lineId ? afterItems.find((i) => String(i._id) === meta.lineId) : null
  const offlineAt = ctx.offline ? await trustedOfflineAt(ctx) : null
  const orderId = after._id ?? before._id
  if (!orderId) return
  try {
    await PosDiscountEvent.create({
      tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
      locationId: new mongoose.Types.ObjectId(ctx.locationId),
      orderId,
      orderPosId: String(before.posId),
      tableId: before.posTableId ?? null,
      tableNumber: before.posTableNumber ?? null,
      groupId: meta.groupId,
      action,
      scope: meta.scope,
      lineId: meta.lineId,
      lineName: line?.name?.slice(0, 200) ?? null,
      kind: input?.kind ?? null,
      value: input?.value ?? null,
      requestedFinalCents: input?.finalCents ?? null,
      reason: input?.reason ?? null,
      note: input?.note ?? null,
      grossCents: grossOfItems(beforeItems),
      totalBeforeCents: totalOfItems(beforeItems),
      totalAfterCents: totalOfItems(afterItems),
      discountDeltaCents: discountOfItems(afterItems) - discountOfItems(beforeItems),
      orderDiscountCents: discountOfItems(afterItems),
      accountGrossCents: meta.account.grossCents,
      accountDiscountCents: meta.account.discountCents,
      byUserId: ctx.user.id,
      byName: meta.byName,
      byRole: resolvePosRole(ctx.user.role),
      approvedByUserId: meta.auth && meta.auth.mode !== 'self' ? meta.auth.approval.approvedBy : null,
      approverName: meta.auth && meta.auth.mode !== 'self' ? meta.auth.approval.approverName : null,
      approvalMode: meta.auth?.mode ?? 'none',
      policyVersion: meta.auth?.policyVersion ?? 0,
      offline: Boolean(offlineAt),
      opId: ctx.offline?.opId ?? null,
      deviceId: ctx.offline?.deviceId ?? null,
      occurredAt: offlineAt ?? new Date(),
    })
  } catch (err) {
    // El descuento ya quedó guardado y en la auditoría: el reporte no puede
    // romper el cobro. Se loguea para revisar.
    console.error('[pos/discounts] no se pudo registrar el evento de descuento', err)
  }
}

async function auditApply(ctx: PosContext, order: OrderDoc, saved: OrderDoc, input: DiscountInput, meta: EventMeta, discountedCents: number): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.discount',
    entity: 'Order',
    entityId: String(order.posId),
    details: {
      lineId: meta.lineId,
      scope: meta.scope,
      groupId: meta.groupId,
      kind: input.kind,
      value: input.value,
      finalCents: input.finalCents,
      reason: input.reason,
      note: input.note,
      discountedCents,
      totalBefore: totalOfItems(order.items as DiscountedItem[]),
      total: saved.total,
      approvedBy: meta.auth?.approval.approvedBy ?? null,
      approvalMode: meta.auth?.mode ?? null,
      policyVersion: meta.auth?.policyVersion ?? null,
      accountGross: meta.account.grossCents,
      accountDiscount: meta.account.discountCents,
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
}

/** El importe final pedido tiene que coincidir con el que queda (si no, la cuenta cambió). */
function assertFinal(input: DiscountInput, totalAfter: number): void {
  if (input.finalCents !== null && input.finalCents !== totalAfter) {
    throw PosError.conflict('La cuenta cambió mientras cargabas el importe final: revisala y volvé a intentar', `final=${input.finalCents} total=${totalAfter}`)
  }
}

// ── Operaciones ─────────────────────────────────────────────────────────────

/**
 * Descuento sobre UNA orden (por plato con lineId, o a toda la orden). Si la
 * orden es de una mesa, la política se evalúa sobre toda la cuenta de la mesa.
 */
export async function discountOrder(
  ctx: PosContext,
  order: OrderDoc,
  input: DiscountInput,
  lineId: string | null
): Promise<{ order: OrderDoc; discountedCents: number }> {
  assertDiscountable(order)
  if (input.finalCents !== null && lineId) throw PosError.validation('El importe final es para toda la cuenta, no para un plato')
  await assertNotInvoiced(ctx, [order])

  // Pasada en seco para evaluar (approvedBy se completa después).
  const at = (await trustedOfflineAt(ctx)) ?? new Date()
  const dry = applyDiscount(order.items as DiscountedItem[], input, { lineId, by: ctx.user.id, approvedBy: null, at })
  assertFinal(input, totalOfItems(dry.items))
  if (sameDiscounts(order.items as DiscountedItem[], dry.items)) return { order, discountedCents: 0 }

  const rounds = order.posTableId ? await openTableRounds(ctx, order.posTableId) : []
  const account = rounds.some((r) => r.posId === order.posId)
    ? accountAmounts(rounds, new Map([[String(order.posId), dry.items]]))
    : accountAmounts([order], new Map([[String(order.posId), dry.items]]))

  const auth = await authorizeDiscount(ctx, input, account)
  const { items, discountedCents } = applyDiscount(order.items as DiscountedItem[], input, {
    lineId,
    by: ctx.user.id,
    approvedBy: auth.mode === 'self' ? null : auth.approval.approvedBy,
    at,
  })
  const saved = await saveDiscountedItems(ctx, order, items)
  const meta: EventMeta = { groupId: randomUUID(), scope: lineId ? 'item' : 'order', lineId, account, auth, byName: await operatorName(ctx, null) }
  await recordEvent(ctx, 'apply', order, saved, input, meta)
  await auditApply(ctx, order, saved, input, meta, discountedCents)
  return { order: saved, discountedCents }
}

/**
 * Descuento a TODA la cuenta de la mesa. % igual en cada ronda; un monto se
 * reparte entre rondas por su importe (al centavo). Un solo PIN autoriza todo.
 */
export async function discountTable(
  ctx: PosContext,
  tableId: string,
  input: DiscountInput
): Promise<{ orders: OrderDoc[]; discountedCents: number }> {
  const rounds = await openTableRounds(ctx, tableId)
  if (rounds.length === 0) throw PosError.conflict('La mesa no tiene nada sin cobrar')
  for (const r of rounds) assertDiscountable(r)
  await assertNotInvoiced(ctx, rounds)

  const at = (await trustedOfflineAt(ctx)) ?? new Date()
  const weights = rounds.map((o) => grossOfItems(o.items as DiscountedItem[]))
  const shares = input.kind === 'amount' ? distributeCents(weights, input.value) : null
  const plan = rounds.map((round, i) => {
    const roundInput = shares ? { ...input, value: shares[i] } : input
    const skip = Boolean(shares && shares[i] <= 0)
    const dry = skip ? null : applyDiscount(round.items as DiscountedItem[], roundInput, { lineId: null, by: ctx.user.id, approvedBy: null, at })
    return { round, roundInput, dry }
  })
  const replaced = new Map(plan.filter((p) => p.dry).map((p) => [String(p.round.posId), p.dry!.items]))
  const account = accountAmounts(rounds, replaced)
  assertFinal(input, account.grossCents - account.discountCents)

  const auth = await authorizeDiscount(ctx, input, account)
  const meta: EventMeta = { groupId: randomUUID(), scope: 'table', lineId: null, account, auth, byName: await operatorName(ctx, null) }
  const approvedBy = auth.mode === 'self' ? null : auth.approval.approvedBy

  const orders: OrderDoc[] = []
  let discountedCents = 0
  for (const { round, roundInput, dry } of plan) {
    if (!dry) continue
    if (sameDiscounts(round.items as DiscountedItem[], dry.items)) { orders.push(round); continue }
    const res = applyDiscount(round.items as DiscountedItem[], roundInput, { lineId: null, by: ctx.user.id, approvedBy, at })
    const saved = await saveDiscountedItems(ctx, round, res.items)
    await recordEvent(ctx, 'apply', round, saved, roundInput, meta)
    await auditApply(ctx, round, saved, roundInput, meta, res.discountedCents)
    discountedCents += res.discountedCents
    orders.push(saved)
  }
  return { orders, discountedCents }
}

/** Quita el descuento de una línea (lineId) o de toda la orden. No pide PIN. */
export async function removeOrderDiscount(
  ctx: PosContext,
  order: OrderDoc,
  lineId: string | null,
  groupId: string = randomUUID()
): Promise<OrderDoc> {
  assertDiscountable(order)
  const next = removeDiscount(order.items as DiscountedItem[], lineId)
  if (sameDiscounts(order.items as DiscountedItem[], next)) return order
  const saved = await saveDiscountedItems(ctx, order, next)
  const account = accountAmounts([order], new Map([[String(order.posId), next]]))
  await recordEvent(ctx, 'remove', order, saved, null, {
    groupId,
    scope: lineId ? 'item' : order.posTableId ? 'table' : 'order',
    lineId,
    account,
    auth: null,
    byName: await operatorName(ctx, null),
  })
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.discount.remove',
    entity: 'Order',
    entityId: String(order.posId),
    details: { lineId, groupId, totalBefore: order.total, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return saved
}

/** Quita los descuentos de todas las rondas sin cobrar de la mesa. */
export async function removeTableDiscounts(ctx: PosContext, tableId: string): Promise<OrderDoc[]> {
  const rounds = await openTableRounds(ctx, tableId)
  const groupId = randomUUID()
  const out: OrderDoc[] = []
  for (const round of rounds) out.push(await removeOrderDiscount(ctx, round, null, groupId))
  return out
}
