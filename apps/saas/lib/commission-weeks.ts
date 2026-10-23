// ============================================================================
// Comisiones por semana — fuente única de verdad (transferencia delivery)
// ============================================================================
// Qué se le debe a TakeasyGO, por semana, y en qué estado está. Lo usan: el
// centro de avisos del panel, la página de Comisiones, el botón «Pagar», el
// webhook de MP, el cierre semanal (cron) y el registro manual del superadmin.
//
// Reglas (documentadas también en DECISIONES de comisiones):
//   · Solo generan deuda los pedidos pagados por TRANSFERENCIA con comisión
//     (`payment.platformFeeAmount` > 0, que hoy solo ocurre en delivery): el
//     cliente le transfiere TODO al restaurante, incluida la comisión, y el
//     restaurante la reenvía a TakeasyGO. Las de MercadoPago se cobran solas.
//   · Un pedido cuenta si está aprobado, no cancelado y no borrado.
//   · Semana = lunes 00:00 → lunes 00:00 en hora de Argentina (no UTC, no la
//     hora del servidor), según `createdAt`.
//   · Pagado = el pedido figura en un CommissionSettlement. Settlements viejos
//     sin detalle de pedidos se descuentan de lo más antiguo.
//   · Calendario (decisión 2026-10-22): la semana cierra el lunes 00:00 y
//     el MARTES es el día de pago.
//       lunes 00:00   cierra → "pendiente" (se ve en el panel y la barra)
//       martes 00:00  día de pago → empieza el aviso en pantalla (payFrom)
//       miércoles 00:00 (fin del martes) sin pagar → "vencida" (dueAt): el
//                     aviso se repite hasta que paga o el superadmin la
//                     marca como cobrada.
//   · Estados de una semana:
//       en_curso  → la semana todavía no terminó (comisión acumulada)
//       pendiente → cerró y todavía no pasó el martes (día de pago)
//       vencida   → terminó el martes sin pagarse
//       pagada    → no queda nada pendiente
//   · Bloqueo de transferencias (decisión 2026-10-22): si la deuda total
//     impaga (vencida + pendiente + acumulada de la semana en curso) SUPERA
//     $5.000, el comercio deja de recibir pagos por transferencia (delivery
//     y take away): el cliente solo ve MercadoPago (y efectivo si lo tiene).
//     Se vuelve a habilitar solo, en cuanto la deuda baja a $5.000 o menos:
//     cuando paga desde el panel (webhook de MP) o cuando el superadmin la
//     marca como cobrada. No hay flag guardado: se calcula siempre de lo
//     realmente impago, así nunca queda trabado por un estado viejo.
// ============================================================================

import mongoose, { type Types } from 'mongoose'
import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { DEFAULT_TIMEZONE, addDaysToDateStr, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'

/** Días desde el cierre (lunes 00:00) hasta el inicio del día de pago (martes). */
export const COMMISSION_PAY_DAY_OFFSET = 1
/** Días desde el cierre hasta que vence (fin del martes = miércoles 00:00). */
export const COMMISSION_DUE_OFFSET = 2
/** Semanas hacia atrás que se analizan (lo más viejo impago igual se ve si cae adentro). */
export const COMMISSION_WINDOW_WEEKS = 26
/** Deuda impaga a partir de la cual (estrictamente mayor) se apagan las transferencias. @storedAs cents */
export const TRANSFER_LOCK_THRESHOLD_CENTS = 500_000

export type CommissionWeekStatus = 'en_curso' | 'pendiente' | 'vencida' | 'pagada'

export interface CommissionWeek {
  /** "YYYY-MM-DD" del lunes (hora local). */
  key: string
  weekStart: Date
  /** Lunes siguiente 00:00 local (exclusivo): cierre de la semana. */
  weekEnd: Date
  /** Martes 00:00 local: día de pago, empieza el aviso en pantalla. */
  payFrom: Date
  /** Miércoles 00:00 local (fin del martes): si no se pagó, queda vencida. */
  dueAt: Date
  status: CommissionWeekStatus
  /** @storedAs cents */
  totalCents: number
  /** @storedAs cents */
  settledCents: number
  /** @storedAs cents */
  pendingCents: number
  orderCount: number
  orderIds: string[]
  /** Pedidos todavía impagos de la semana. */
  pendingOrderIds: string[]
}

type Id = Types.ObjectId | string

const tidOf = (tenantId: Id) => (typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId)

/** Lunes (fecha local "YYYY-MM-DD") de la semana que contiene `date`. */
export function weekKeyOf(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  const local = getTodayStrInTimezone(tz, date)
  const { day } = getDayAndMidnightInTimezone(local, tz)
  return addDaysToDateStr(local, -(day === 0 ? 6 : day - 1))
}

/** Límites UTC de la semana que arranca el lunes `key`. */
export function weekBounds(key: string, tz: string = DEFAULT_TIMEZONE): { weekStart: Date; weekEnd: Date; payFrom: Date; dueAt: Date } {
  const at = (days: number) => getDayAndMidnightInTimezone(addDaysToDateStr(key, days), tz).date
  return {
    weekStart: at(0),
    weekEnd: at(7),
    payFrom: at(7 + COMMISSION_PAY_DAY_OFFSET),
    dueAt: at(7 + COMMISSION_DUE_OFFSET),
  }
}

/** Filtro de pedidos que generan comisión a pagar por el restaurante. */
export function commissionableFilter(tenantId: Id, extra: Record<string, unknown> = {}) {
  return {
    tenantId: tidOf(tenantId),
    deletedAt: null,
    status: { $ne: 'cancelled' },
    'payment.status': 'approved',
    'payment.method': 'transfer',
    'payment.platformFeeAmount': { $gt: 0 },
    ...extra,
  }
}

/** Pedidos ya saldados + crédito de settlements viejos sin detalle. */
async function loadSettled(tenantId: Id) {
  const settlements = await CommissionSettlement.find({ tenantId: tidOf(tenantId) })
    .select('orderIds amountCollected')
    .lean<Array<{ orderIds?: string[]; amountCollected?: number }>>()
  const settledIds = new Set<string>()
  let unattributed = 0
  for (const s of settlements) {
    if (!s.orderIds?.length) unattributed += s.amountCollected || 0
    else for (const id of s.orderIds) settledIds.add(String(id))
  }
  return { settledIds, unattributed }
}

export function statusOf(w: Pick<CommissionWeek, 'weekEnd' | 'dueAt' | 'pendingCents'>, now: Date): CommissionWeekStatus {
  if (now < w.weekEnd) return 'en_curso'
  if (w.pendingCents <= 0) return 'pagada'
  return now < w.dueAt ? 'pendiente' : 'vencida'
}

/**
 * Semanas con comisión del tenant (de la más vieja a la más nueva), con lo
 * saldado y lo pendiente de cada una. Fuente única para todo el módulo.
 */
export async function loadCommissionWeeks(
  tenantId: Id,
  opts: { now?: Date; tz?: string; windowWeeks?: number } = {},
): Promise<CommissionWeek[]> {
  const now = opts.now ?? new Date()
  const tz = opts.tz ?? DEFAULT_TIMEZONE
  const firstKey = addDaysToDateStr(weekKeyOf(now, tz), -7 * ((opts.windowWeeks ?? COMMISSION_WINDOW_WEEKS) - 1))
  const since = weekBounds(firstKey, tz).weekStart

  const [orders, settled] = await Promise.all([
    Order.find(commissionableFilter(tenantId, { createdAt: { $gte: since } }))
      .select('_id createdAt payment.platformFeeAmount')
      .sort({ createdAt: 1, _id: 1 })
      .lean<Array<{ _id: Types.ObjectId; createdAt: Date; payment: { platformFeeAmount: number } }>>(),
    loadSettled(tenantId),
  ])

  const byKey = new Map<string, CommissionWeek>()
  for (const o of orders) {
    const key = weekKeyOf(o.createdAt, tz)
    let w = byKey.get(key)
    if (!w) {
      w = { key, ...weekBounds(key, tz), status: 'en_curso', totalCents: 0, settledCents: 0, pendingCents: 0, orderCount: 0, orderIds: [], pendingOrderIds: [] }
      byKey.set(key, w)
    }
    const fee = o.payment.platformFeeAmount
    const id = String(o._id)
    w.totalCents += fee
    w.orderCount++
    w.orderIds.push(id)
    if (settled.settledIds.has(id)) w.settledCents += fee
    else {
      w.pendingCents += fee
      w.pendingOrderIds.push(id)
    }
  }

  const weeks = [...byKey.values()].sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
  // Settlements viejos sin detalle: cubren lo más antiguo primero.
  let credit = settled.unattributed
  for (const w of weeks) {
    if (credit <= 0) break
    const take = Math.min(credit, w.pendingCents)
    w.pendingCents -= take
    w.settledCents += take
    credit -= take
    if (w.pendingCents === 0) w.pendingOrderIds = []
  }
  for (const w of weeks) w.status = statusOf(w, now)
  return weeks
}

export type CommissionAlertLevel = 'none' | 'acumulada' | 'pendiente' | 'vencida'

export interface CommissionAlerts {
  level: CommissionAlertLevel
  overdue: { cents: number; weeks: number; oldestDueAt: string | null }
  /** notifyFrom: desde cuándo avisar en pantalla (martes, día de pago). */
  pending: { cents: number; weeks: number; nextDueAt: string | null; notifyFrom: string | null }
  accrued: { cents: number; orders: number }
  /**
   * Deuda total impaga (vencido + pendiente + acumulado) y si por eso están
   * apagadas las transferencias. @storedAs cents
   */
  transferLock: { locked: boolean; owedCents: number; thresholdCents: number }
}

/** ¿La deuda impaga apaga las transferencias? (estrictamente mayor al tope) */
export function isTransferLocked(owedCents: number): boolean {
  return owedCents > TRANSFER_LOCK_THRESHOLD_CENTS
}

/** Resumen para avisos: lo vencido manda, después lo pendiente, después lo acumulado. */
export function summarizeAlerts(weeks: CommissionWeek[]): CommissionAlerts {
  const overdue = weeks.filter((w) => w.status === 'vencida')
  const pending = weeks.filter((w) => w.status === 'pendiente')
  const current = weeks.filter((w) => w.status === 'en_curso')
  const sum = (ws: CommissionWeek[]) => ws.reduce((s, w) => s + w.pendingCents, 0)
  const accrued = sum(current)
  const owedCents = sum(overdue) + sum(pending) + accrued
  return {
    transferLock: { locked: isTransferLocked(owedCents), owedCents, thresholdCents: TRANSFER_LOCK_THRESHOLD_CENTS },
    level: overdue.length ? 'vencida' : pending.length ? 'pendiente' : accrued > 0 ? 'acumulada' : 'none',
    overdue: { cents: sum(overdue), weeks: overdue.length, oldestDueAt: overdue[0]?.dueAt.toISOString() ?? null },
    pending: {
      cents: sum(pending),
      weeks: pending.length,
      nextDueAt: pending[0]?.dueAt.toISOString() ?? null,
      notifyFrom: pending[0]?.payFrom.toISOString() ?? null,
    },
    accrued: { cents: accrued, orders: current.reduce((s, w) => s + w.pendingOrderIds.length, 0) },
  }
}

/**
 * Estado del bloqueo de transferencias de un comercio, calculado en vivo.
 * Lo usan el catálogo de medios de pago (checkout, cambio de medio) y la
 * creación del pedido. Si el cálculo falla NO bloquea (falla abierto): un
 * error de base no puede dejar a un comercio sin vender.
 */
export async function loadTransferLock(tenantId: Id, tz?: string): Promise<CommissionAlerts['transferLock']> {
  try {
    return summarizeAlerts(await loadCommissionWeeks(tenantId, { tz })).transferLock
  } catch (err) {
    console.error('[commission-weeks] no se pudo calcular el bloqueo de transferencias', err)
    return { locked: false, owedCents: 0, thresholdCents: TRANSFER_LOCK_THRESHOLD_CENTS }
  }
}

export type PayScope ={ kind: 'due' } | { kind: 'all' } | { kind: 'week'; key: string }

/**
 * Qué cobra «Pagar»: los pedidos IMPAGOS exactos del alcance elegido.
 *   due  → semanas cerradas (vencidas + pendientes)  ← el botón principal
 *   all  → también lo acumulado de la semana en curso
 *   week → una semana puntual
 * Los settlements viejos sin detalle no tienen pedidos: si cubren parte de
 * una semana, esa semana se cobra por su `pendingCents` recortando pedidos.
 */
export function payableFrom(weeks: CommissionWeek[], scope: PayScope, feeById: Map<string, number>) {
  const selected = weeks.filter((w) =>
    w.pendingCents > 0 &&
    (scope.kind === 'all' ? true : scope.kind === 'due' ? w.status === 'pendiente' || w.status === 'vencida' : w.key === scope.key),
  )
  const orderIds: string[] = []
  let amount = 0
  for (const w of selected) {
    let budget = w.pendingCents
    for (const id of w.pendingOrderIds) {
      const fee = feeById.get(id) ?? 0
      if (fee <= 0 || fee > budget) continue
      orderIds.push(id)
      amount += fee
      budget -= fee
    }
  }
  return { orderIds, amount, weekStarts: selected.map((w) => w.weekStart) }
}

/** Comisión por pedido (para armar el cobro). */
export async function feesByOrder(orderIds: string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map()
  const docs = await Order.find({ _id: { $in: orderIds } }).select('_id payment.platformFeeAmount').lean<Array<{ _id: Types.ObjectId; payment: { platformFeeAmount: number } }>>()
  return new Map(docs.map((d) => [String(d._id), d.payment.platformFeeAmount]))
}

/**
 * Lleva las liquidaciones semanales (WeeklyCommissionStatement) al estado
 * real: crea las de semanas cerradas que falten, congela sus pedidos y
 * vencimiento, y marca pagado/vencido según lo saldado. Idempotente: lo
 * llaman el cierre semanal, el webhook de pago y el registro manual.
 */
export async function syncWeeklyStatements(tenantId: Id, opts: { now?: Date; tz?: string; paidBy?: string } = {}) {
  const now = opts.now ?? new Date()
  const weeks = await loadCommissionWeeks(tenantId, { now, tz: opts.tz })
  let created = 0
  let paid = 0
  for (const w of weeks) {
    if (w.status === 'en_curso') continue
    const status = w.status === 'pagada' ? 'pagado' : w.status === 'vencida' ? 'vencido' : 'pendiente'
    const res = await WeeklyCommissionStatement.findOneAndUpdate(
      { tenantId: tidOf(tenantId), weekStart: w.weekStart },
      {
        $setOnInsert: { tenantId: tidOf(tenantId), weekStart: w.weekStart, closedAt: now },
        $set: {
          weekEnd: new Date(w.weekEnd.getTime() - 1),
          amount: w.totalCents,
          orderCount: w.orderCount,
          orderIds: w.orderIds,
          dueAt: w.dueAt,
          status,
          ...(status === 'pagado' ? {} : { paidAt: null, paidBy: null }),
        },
      },
      { upsert: true, new: false },
    ).lean<{ status?: string } | null>()
    if (!res) created++
    if (status === 'pagado' && res?.status !== 'pagado') {
      paid++
      await WeeklyCommissionStatement.updateOne(
        { tenantId: tidOf(tenantId), weekStart: w.weekStart, paidAt: null },
        { $set: { paidAt: now, paidBy: opts.paidBy ?? 'sistema' } },
      )
    }
  }
  return { created, paid, weeks: weeks.length }
}

/**
 * Comisiones de MercadoPago / Kripton por semana: se cobran SOLAS en cada
 * pago aprobado (split del pago), así que siempre figuran como cobradas.
 * Solo informativo: no generan deuda ni avisos.
 */
export async function loadAutoCollectedByWeek(
  tenantId: Id,
  opts: { now?: Date; tz?: string; windowWeeks?: number } = {},
): Promise<Map<string, { cents: number; orders: number }>> {
  const now = opts.now ?? new Date()
  const tz = opts.tz ?? DEFAULT_TIMEZONE
  const firstKey = addDaysToDateStr(weekKeyOf(now, tz), -7 * ((opts.windowWeeks ?? COMMISSION_WINDOW_WEEKS) - 1))
  const orders = await Order.find({
    tenantId: tidOf(tenantId),
    deletedAt: null,
    status: { $ne: 'cancelled' },
    'payment.status': 'approved',
    'payment.method': { $in: ['mercadopago', 'kripton'] },
    'payment.platformFeeAmount': { $gt: 0 },
    createdAt: { $gte: weekBounds(firstKey, tz).weekStart },
  })
    .select('createdAt payment.platformFeeAmount')
    .lean<Array<{ createdAt: Date; payment: { platformFeeAmount: number } }>>()
  const out = new Map<string, { cents: number; orders: number }>()
  for (const o of orders) {
    const key = weekKeyOf(o.createdAt, tz)
    const cur = out.get(key) ?? { cents: 0, orders: 0 }
    cur.cents += o.payment.platformFeeAmount
    cur.orders++
    out.set(key, cur)
  }
  return out
}
