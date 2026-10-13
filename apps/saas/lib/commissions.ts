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
  /** settlements solapados sin detalle de órdenes (datos viejos), en centavos */
  unattributedSettled: number
}

interface RawOrder {
  _id: Types.ObjectId
  payment?: { method?: string | null; platformFeeAmount?: number | null } | null
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
      .select('_id payment.method payment.platformFeeAmount')
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
  const unsettled: { method: string; fee: number }[] = []

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
    } else {
      row.pending += fee
      unsettled.push({ method, fee })
    }
  }

  // Descuenta settlements sin orderIds (datos viejos) del pendiente, en orden,
  // manteniendo exacto: total = settled + pending por método.
  let remaining = unattributedSettled
  for (const u of unsettled) {
    if (remaining <= 0) break
    const deduct = Math.min(u.fee, remaining)
    if (deduct <= 0) break
    const row = getRow(u.method)
    row.pending -= deduct
    row.settled += deduct
    settled += deduct
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
