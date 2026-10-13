import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import type { Types } from 'mongoose'

/**
 * Fuente única de verdad para los cálculos de comisiones del panel de admin,
 * el botón de pago, el banner del dashboard y el resumen del dashboard.
 *
 * Reglas:
 *  - Una orden "entra" al período por createdAt, si está aprobada y no cancelada.
 *  - La comisión de la orden es `payment.platformFeeAmount` (centavos).
 *  - Una orden está "pagada" si su _id aparece en `orderIds` de algún
 *    CommissionSettlement que solape el período (criterio usado por el webhook
 *    de pago de MP y por el superadmin al registrar un pago).
 *  - Settlements viejos sin `orderIds` se descuentan del pendiente en orden
 *    (queda `unattributedSettled` para mostrarlo como ajuste).
 *
 * Siempre se cumple: total = settled + pending (en centavos, por método y en total).
 */

export interface MethodCommissionRow {
  method: string
  orderCount: number
  settledOrderCount: number
  /** centavos */
  total: number
  settled: number
  pending: number
}

export interface TransferPending {
  /** centavos de comisión de transferencia todavía no saldadas en el período */
  pendingCents: number
  /** órdenes de transferencia del período que todavía no están saldadas */
  orderCount: number
}

export interface TransferWeekRow {
  /** lunes 00:00 (hora local) del bucket */
  weekStart: Date
  /** domingo 23:59:59.999 (hora local) del bucket */
  weekEnd: Date
  orderCount: number
  settledOrderCount: number
  /** centavos */
  total: number
  settled: number
  pending: number
}

export interface PeriodCommissions {
  from: Date
  to: Date
  orderCount: number
  settledOrderCount: number
  /** centavos */
  total: number
  settled: number
  pending: number
  breakdown: MethodCommissionRow[]
  transfer: MethodCommissionRow
  /** transferencias agrupadas por semana (lunes a domingo, hora local) */
  weekly: TransferWeekRow[]
  /** settlements solapados sin detalle de órdenes (datos viejos), en centavos */
  unattributedSettled: number
}

interface RawOrder {
  _id: Types.ObjectId
  createdAt: Date
  payment?: { method?: string | null; platformFeeAmount?: number | null } | null
}

/** Lunes 00:00 (hora local) de la semana que contiene a `d`. */
function getLocalMonday(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = r.getDay() // 0=domingo
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}

async function loadPeriodData(tenantId: Types.ObjectId | string, from: Date, to: Date) {
  const [orders, settlements] = await Promise.all([
    Order.find({
      tenantId,
      deletedAt: null,
      status: { $ne: 'cancelled' },
      'payment.status': 'approved',
      createdAt: { $gte: from, $lte: to },
    })
      .select('_id createdAt payment.method payment.platformFeeAmount')
      .lean<RawOrder[]>(),
    CommissionSettlement.find({ tenantId, from: { $lte: to }, to: { $gte: from } })
      .select('amountCollected orderIds')
      .lean<{ amountCollected: number; orderIds: string[] }[]>(),
  ])

  const settledIds = new Set<string>()
  let unattributedSettled = 0
  for (const s of settlements) {
    if (!s.orderIds?.length) {
      unattributedSettled += s.amountCollected || 0
      continue
    }
    for (const id of s.orderIds) settledIds.add(String(id))
  }

  return { orders, settledIds, unattributedSettled }
}

export async function computePeriodCommissions(
  tenantId: Types.ObjectId | string,
  from: Date,
  to: Date,
): Promise<PeriodCommissions> {
  const { orders, settledIds, unattributedSettled } = await loadPeriodData(tenantId, from, to)

  const rows = new Map<string, MethodCommissionRow>()
  const unsettled: { method: string; fee: number; week?: TransferWeekRow }[] = []
  const weeks = new Map<number, TransferWeekRow>()

  const getWeekRow = (createdAt: Date): TransferWeekRow => {
    const monday = getLocalMonday(createdAt)
    const key = monday.getTime()
    let row = weeks.get(key)
    if (!row) {
      const weekEnd = new Date(monday)
      weekEnd.setDate(weekEnd.getDate() + 7)
      weekEnd.setMilliseconds(weekEnd.getMilliseconds() - 1)
      row = { weekStart: monday, weekEnd, orderCount: 0, settledOrderCount: 0, total: 0, settled: 0, pending: 0 }
      weeks.set(key, row)
    }
    return row
  }

  let total = 0
  let settled = 0
  let settledOrderCount = 0

  const getRow = (method: string): MethodCommissionRow => {
    let row = rows.get(method)
    if (!row) {
      row = { method, orderCount: 0, settledOrderCount: 0, total: 0, settled: 0, pending: 0 }
      rows.set(method, row)
    }
    return row
  }

  for (const o of orders) {
    const method = o.payment?.method || 'unknown'
    const fee = o.payment?.platformFeeAmount || 0
    const row = getRow(method)
    total += fee
    row.orderCount += 1
    row.total += fee
    if (settledIds.has(String(o._id))) {
      settled += fee
      settledOrderCount += 1
      row.settled += fee
      row.settledOrderCount += 1
      if (method === 'transfer') {
        const week = getWeekRow(o.createdAt)
        week.orderCount += 1
        week.settledOrderCount += 1
        week.total += fee
        week.settled += fee
      }
    } else {
      row.pending += fee
      if (method === 'transfer') {
        const week = getWeekRow(o.createdAt)
        week.orderCount += 1
        week.total += fee
        week.pending += fee
        unsettled.push({ method, fee, week })
      } else {
        unsettled.push({ method, fee })
      }
    }
  }

  // Descuenta settlements sin orderIds (datos viejos) del pendiente, en orden,
  // manteniendo exacto: total = settled + pending por método y por semana.
  let remaining = unattributedSettled
  for (const u of unsettled) {
    if (remaining <= 0) break
    const deduct = Math.min(u.fee, remaining)
    if (deduct <= 0) break
    const row = getRow(u.method)
    row.pending -= deduct
    row.settled += deduct
    settled += deduct
    if (u.week) {
      u.week.pending -= deduct
      u.week.settled += deduct
    }
    remaining -= deduct
  }

  const zeroRow = (method: string): MethodCommissionRow => ({
    method,
    orderCount: 0,
    settledOrderCount: 0,
    total: 0,
    settled: 0,
    pending: 0,
  })

  return {
    from,
    to,
    orderCount: orders.length,
    settledOrderCount,
    total,
    settled,
    pending: Math.max(0, total - settled),
    breakdown: Array.from(rows.values()).sort((a, b) => b.total - a.total),
    transfer: rows.get('transfer') ?? zeroRow('transfer'),
    weekly: Array.from(weeks.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime()),
    unattributedSettled,
  }
}

/**
 * Lo que el admin debe pagar por transferencia en el período — monto exacto
 * que cobra POST /commissions/pay y que muestran el panel y el banner.
 */
export async function computeTransferPayable(
  tenantId: Types.ObjectId | string,
  from: Date,
  to: Date,
): Promise<TransferPending> {
  const period = await computePeriodCommissions(tenantId, from, to)
  return {
    pendingCents: Math.max(0, period.transfer.pending),
    orderCount: Math.max(0, period.transfer.orderCount - period.transfer.settledOrderCount),
  }
}
