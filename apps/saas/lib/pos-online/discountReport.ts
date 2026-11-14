import mongoose from 'mongoose'
import PosDiscountEvent from '@/models/PosDiscountEvent'
import { DISCOUNT_REASONS, isDiscountReason } from '@takeasygo/business'

// ============================================================================
// Reporte de descuentos y ajustes del POS (panel admin, 14/11/2026)
// ============================================================================
// Lee PosDiscountEvent (append-only). Lo usan la página Cajas POS ›
// Descuentos y su exportación CSV, con los MISMOS filtros y el mismo alcance
// de sede del usuario (un usuario con sedes asignadas nunca ve otras).
//
// Fechas: días calendario de Argentina (UTC−3, sin horario de verano).
// ============================================================================

export const AR_OFFSET = '-03:00'
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[a-f0-9]{24}$/i
const MAX_RANGE_DAYS = 366
export const PAGE_ROWS = 300
export const CSV_ROWS = 5000

export interface DiscountReportFilters {
  from: string
  to: string
  byUserId: string | null
  approverId: string | null
  reason: string | null
  locationId: string | null
  action: 'apply' | 'remove' | null
}

/** Hoy en Argentina (YYYY-MM-DD). */
export function arToday(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00${AR_OFFSET}`)
  d.setUTCDate(d.getUTCDate() + days)
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

/** Filtros desde la URL; lo inválido se ignora (nunca entra a la consulta). */
export function parseDiscountFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): DiscountReportFilters {
  const get = (k: string): string => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k]
    return (Array.isArray(v) ? v[0] : v ?? '').trim()
  }
  const today = arToday()
  let to = DAY_RE.test(get('to')) ? get('to') : today
  let from = DAY_RE.test(get('from')) ? get('from') : shiftDay(to, -6)
  if (from > to) [from, to] = [to, from]
  if (shiftDay(from, MAX_RANGE_DAYS) < to) from = shiftDay(to, -MAX_RANGE_DAYS)
  const id = (k: string) => (ID_RE.test(get(k)) ? get(k) : null)
  const reason = get('reason')
  const action = get('action')
  return {
    from,
    to,
    byUserId: id('by'),
    approverId: id('approver'),
    reason: isDiscountReason(reason) ? reason : null,
    locationId: id('location'),
    action: action === 'apply' || action === 'remove' ? action : null,
  }
}

/** Filtros → query string (para links y la exportación). */
export function filtersToQuery(f: DiscountReportFilters): string {
  const q = new URLSearchParams({ from: f.from, to: f.to })
  if (f.byUserId) q.set('by', f.byUserId)
  if (f.approverId) q.set('approver', f.approverId)
  if (f.reason) q.set('reason', f.reason)
  if (f.locationId) q.set('location', f.locationId)
  if (f.action) q.set('action', f.action)
  return q.toString()
}

/**
 * Query de Mongo. `scopeLocationIds` = sedes del usuario (null = todas): una
 * sede pedida fuera de su alcance no devuelve nada.
 */
export function buildDiscountQuery(tenantId: string, f: DiscountReportFilters, scopeLocationIds: string[] | null): Record<string, unknown> {
  const q: Record<string, unknown> = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    occurredAt: { $gte: new Date(`${f.from}T00:00:00${AR_OFFSET}`), $lt: new Date(`${shiftDay(f.to, 1)}T00:00:00${AR_OFFSET}`) },
  }
  if (scopeLocationIds) {
    const allowed = scopeLocationIds.filter((id) => ID_RE.test(id))
    const wanted = f.locationId ? allowed.filter((id) => id === f.locationId) : allowed
    q.locationId = { $in: wanted.map((id) => new mongoose.Types.ObjectId(id)) }
  } else if (f.locationId) {
    q.locationId = new mongoose.Types.ObjectId(f.locationId)
  }
  if (f.byUserId) q.byUserId = f.byUserId
  if (f.approverId) q.approvedByUserId = f.approverId
  if (f.reason) q.reason = f.reason
  if (f.action) q.action = f.action
  return q
}

export interface DiscountEventRow {
  _id: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderPosId: string
  tableNumber: number | null
  groupId: string
  action: 'apply' | 'remove'
  scope: 'item' | 'order' | 'table'
  lineName: string | null
  kind: 'percent' | 'amount' | null
  value: number | null
  requestedFinalCents: number | null
  reason: string | null
  note: string | null
  grossCents: number
  totalBeforeCents: number
  totalAfterCents: number
  discountDeltaCents: number
  orderDiscountCents: number
  byUserId: string
  byName: string | null
  byRole: string | null
  approvedByUserId: string | null
  approverName: string | null
  approvalMode: 'self' | 'pin' | 'offline_pin' | 'none'
  policyVersion: number
  offline: boolean
  occurredAt: Date
}

const ROW_FIELDS =
  'locationId orderPosId tableNumber groupId action scope lineName kind value requestedFinalCents reason note grossCents totalBeforeCents ' +
  'totalAfterCents discountDeltaCents orderDiscountCents byUserId byName byRole approvedByUserId approverName approvalMode policyVersion offline occurredAt'

export async function findDiscountEvents(query: Record<string, unknown>, limit: number): Promise<DiscountEventRow[]> {
  return PosDiscountEvent.find(query).sort({ occurredAt: -1, _id: -1 }).limit(limit).select(ROW_FIELDS).lean<DiscountEventRow[]>()
}

export interface DiscountReportSummary {
  operations: number
  /** Descuento neto del período (aplicados − quitados). */
  netDiscountCents: number
  appliedCents: number
  removedCents: number
  withApproval: number
  offline: number
  byReason: { reason: string; label: string; cents: number; count: number }[]
  byUser: { userId: string; name: string; cents: number; count: number; approvals: number }[]
  byApprover: { userId: string; name: string; cents: number; count: number }[]
}

/** Totales del período (sobre TODO el filtro, no solo las filas de la página). */
export async function summarizeDiscountEvents(query: Record<string, unknown>): Promise<DiscountReportSummary> {
  const [totals] = await PosDiscountEvent.aggregate<{
    operations: number
    applied: number
    removed: number
    withApproval: number
    offline: number
  }>([
    { $match: query },
    {
      $group: {
        _id: null,
        operations: { $sum: 1 },
        applied: { $sum: { $cond: [{ $gt: ['$discountDeltaCents', 0] }, '$discountDeltaCents', 0] } },
        removed: { $sum: { $cond: [{ $lt: ['$discountDeltaCents', 0] }, { $multiply: ['$discountDeltaCents', -1] }, 0] } },
        withApproval: { $sum: { $cond: [{ $in: ['$approvalMode', ['pin', 'offline_pin']] }, 1, 0] } },
        offline: { $sum: { $cond: ['$offline', 1, 0] } },
      },
    },
  ])
  const byReasonRaw = await PosDiscountEvent.aggregate<{ _id: string | null; cents: number; count: number }>([
    { $match: { ...query, action: 'apply' } },
    { $group: { _id: '$reason', cents: { $sum: '$discountDeltaCents' }, count: { $sum: 1 } } },
    { $sort: { cents: -1 } },
  ])
  const byUserRaw = await PosDiscountEvent.aggregate<{ _id: string; name: string | null; cents: number; count: number; approvals: number }>([
    { $match: { ...query, action: 'apply' } },
    {
      $group: {
        _id: '$byUserId',
        name: { $last: '$byName' },
        cents: { $sum: '$discountDeltaCents' },
        count: { $sum: 1 },
        approvals: { $sum: { $cond: [{ $in: ['$approvalMode', ['pin', 'offline_pin']] }, 1, 0] } },
      },
    },
    { $sort: { cents: -1 } },
    { $limit: 50 },
  ])
  const byApproverRaw = await PosDiscountEvent.aggregate<{ _id: string; name: string | null; cents: number; count: number }>([
    { $match: { ...query, action: 'apply', approvedByUserId: { $ne: null } } },
    { $group: { _id: '$approvedByUserId', name: { $last: '$approverName' }, cents: { $sum: '$discountDeltaCents' }, count: { $sum: 1 } } },
    { $sort: { cents: -1 } },
    { $limit: 50 },
  ])
  const applied = totals?.applied ?? 0
  const removed = totals?.removed ?? 0
  return {
    operations: totals?.operations ?? 0,
    netDiscountCents: applied - removed,
    appliedCents: applied,
    removedCents: removed,
    withApproval: totals?.withApproval ?? 0,
    offline: totals?.offline ?? 0,
    byReason: byReasonRaw.map((r) => ({
      reason: r._id ?? 'other',
      label: r._id && isDiscountReason(r._id) ? DISCOUNT_REASONS[r._id] : r._id ?? '—',
      cents: r.cents,
      count: r.count,
    })),
    byUser: byUserRaw.map((u) => ({ userId: u._id, name: u.name ?? u._id, cents: u.cents, count: u.count, approvals: u.approvals })),
    byApprover: byApproverRaw.map((u) => ({ userId: u._id, name: u.name ?? u._id, cents: u.cents, count: u.count })),
  }
}

/** Personas para los selectores (quién descontó / quién autorizó), con el alcance de sede. */
export async function discountPeople(
  tenantId: string,
  scopeLocationIds: string[] | null
): Promise<{ users: { id: string; name: string }[]; approvers: { id: string; name: string }[] }> {
  const match: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
  if (scopeLocationIds) match.locationId = { $in: scopeLocationIds.filter((id) => ID_RE.test(id)).map((id) => new mongoose.Types.ObjectId(id)) }
  const [users, approvers] = await Promise.all([
    PosDiscountEvent.aggregate<{ _id: string; name: string | null }>([
      { $match: match },
      { $group: { _id: '$byUserId', name: { $last: '$byName' } } },
      { $sort: { name: 1 } },
      { $limit: 200 },
    ]),
    PosDiscountEvent.aggregate<{ _id: string; name: string | null }>([
      { $match: { ...match, approvedByUserId: { $ne: null } } },
      { $group: { _id: '$approvedByUserId', name: { $last: '$approverName' } } },
      { $sort: { name: 1 } },
      { $limit: 200 },
    ]),
  ])
  return {
    users: users.map((u) => ({ id: u._id, name: u.name ?? u._id })),
    approvers: approvers.map((u) => ({ id: u._id, name: u.name ?? u._id })),
  }
}

export const APPROVAL_MODE_LABELS: Record<DiscountEventRow['approvalMode'], string> = {
  self: 'Dentro de su límite',
  pin: 'PIN de encargado',
  offline_pin: 'PIN sin internet',
  none: '—',
}

export const SCOPE_LABELS: Record<DiscountEventRow['scope'], string> = {
  item: 'Plato',
  order: 'Cuenta',
  table: 'Mesa',
}

export function reasonLabel(reason: string | null): string {
  if (!reason) return '—'
  return isDiscountReason(reason) ? DISCOUNT_REASONS[reason] : reason
}
