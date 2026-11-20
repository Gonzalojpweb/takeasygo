import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import Order from '@/models/Order'
import Table from '@/models/Table'
import Printer from '@/models/Printer'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import {
  isTableVoidReason,
  tableVoidNeedsNote,
  TABLE_VOID_NOTE_MAX,
  TABLE_VOID_REASON_INFO,
  type TableVoidReason,
} from '@takeasygo/business'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { requireManagerApproval, type Approval } from '@/lib/pos-online/approval'
import { hasPosCapability, resolvePosRole } from '@/lib/pos-online/permissions'
import { findPosTable, assertTablePosId, type PosTableDoc } from '@/lib/pos-online/tableRepo'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { toPosTable } from '@/lib/pos-online/tableMapper'
import type { PosOrderDoc } from '@/lib/pos-online/orderRepo'
import { FREE_TABLE_FIELDS } from '@/lib/pos-online/tableRelease'
import { operatorName } from '@/lib/pos-online/operator'
import { planVoidWaste, recordVoidWasteSafe, syncOrderConsumptionSafe } from '@/lib/inventory/sales'
import { syncReferralsForOrder } from '@/lib/referrals'
import { runAfterResponse } from '@/lib/after-response'
import { buildOrderVoidJobs } from '@/lib/printing/orderVoid'

// ============================================================================
// POST /api/[tenant]/pos/tables/[id]/void — anular la MESA entera (sin cobrar)
// ============================================================================
// Pedido 19/11/2026: se abrió la mesa, se comandó y la venta no va. Antes no
// había forma de anularla entera: había que quitar plato por plato y la
// mesa quedaba amarilla. Ahora, en un solo paso:
//
//   · Quién: lo pide cualquiera del salón (mozo, cajero), lo AUTORIZA un
//     admin o encargado — directo si es él quien opera, o con su PIN en el
//     equipo del mozo/cajero (sin cerrar sesión).
//   · Qué: todas las rondas abiertas SIN COBRAR quedan `cancelled` con su
//     registro (Order.tableVoid: motivo, nota, quién pidió, quién autorizó,
//     importe, si fue a merma) y la mesa vuelve a libre (verde).
//   · Inventario (`wasted`, lo elige el operador; cada motivo propone):
//       false → «no se llegó a preparar»: los insumos vuelven al stock
//               (reversión de la venta en el ledger, como una cancelación).
//       true  → «se preparó y se pierde»: los insumos de lo que ya se mandó
//               a cocina van a MERMA (WasteRecorded con el motivo).
//     Una ronda que nunca fue a cocina (`pending`) no descontó nada.
//   · Cocina/barra: cada estación que recibió la comanda imprime «ANULADA ·
//     NO PREPARAR» con los platos (no frena la anulación si falla).
//   · Una ronda YA COBRADA no se anula acá: se anula la venta (devuelve la
//     plata en la caja) desde Ventas → 409 con ese aviso.
//   · Mesa ocupada sin nada cargado (o con rondas vacías): «liberar» sin
//     motivo; la caja lo hace sola, el mozo con el PIN.
//
// Body: { reason, note?, wasted? }   (reason/note opcionales si no hay platos)
// Respuesta: { table, orders, voided: { rounds, amount, wasted, printed } }
// ============================================================================

const OPEN = { $nin: ['delivered', 'cancelled'] }

interface RoundDoc {
  _id: unknown
  posId: string
  orderNumber: string
  status: string
  total: number
  posTableNumber?: number | null
  posPayments?: unknown[] | null
  items: { _id?: unknown; name: string; quantity: number; itemType?: string; printRole?: string | null }[]
  updatedAt: Date
}

export const POST = posRoute<{ tenant: string; id: string }>('tables.service', async (ctx, params) => {
  const tablePosId = assertTablePosId(params.id)
  const body = await readPosBody<{ reason?: unknown; note?: unknown; wasted?: unknown }>(ctx.request)
  const table = (await findPosTable(ctx, tablePosId)) as PosTableDoc & { number: number; status: string; posId: string }

  const rounds = (await Order.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posTableId: tablePosId,
    status: OPEN,
  })
    .sort({ createdAt: 1 })
    .lean()) as unknown as RoundDoc[]

  if (rounds.some((r) => (r.posPayments?.length ?? 0) > 0)) {
    throw PosError.conflict('La mesa tiene rondas ya cobradas: anulá esa venta desde Ventas (devuelve el dinero en la caja)')
  }
  if (rounds.length === 0 && table.status === 'free') {
    // Reintento o mesa ya libre: idempotente.
    return NextResponse.json({ table: toPosTable(table), orders: [], voided: { rounds: 0, amount: 0, wasted: false, printed: 0 } })
  }
  if (table.status === 'reserved') {
    throw PosError.conflict('La mesa está reservada: soltala desde la reserva')
  }

  const hasPlates = rounds.some((r) => r.items.length > 0)
  const role = resolvePosRole(ctx.user.role)

  // ── Motivo y autorización ────────────────────────────────────────────────
  let reason: TableVoidReason
  let note: string | null = null
  let approval: Approval
  if (hasPlates) {
    if (!isTableVoidReason(body.reason)) throw PosError.validation('Elegí el motivo de la anulación')
    reason = body.reason
    note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, TABLE_VOID_NOTE_MAX) : null
    if (tableVoidNeedsNote(reason) && !note) throw PosError.validation('Escribí el motivo de la anulación')
    approval = await requireManagerApproval(
      ctx,
      'table.void',
      `Anular la mesa ${table.number} (${TABLE_VOID_REASON_INFO[reason].label}) necesita la autorización de un admin o encargado`
    )
  } else {
    // Nada cargado: es liberar la mesa. La caja lo hace sola; el mozo, con PIN.
    reason = isTableVoidReason(body.reason) ? body.reason : 'load_error'
    approval = hasPosCapability(ctx.user.role, 'tables.manage')
      ? { approvedBy: ctx.user.id, approverName: null, viaPin: false }
      : await requireManagerApproval(ctx, 'table.release', `Liberar la mesa ${table.number} necesita la autorización de un admin o encargado`)
  }
  const wasted = hasPlates && body.wasted === true

  // ── Merma: se calcula ANTES de revertir la venta (lee lo descontado) ─────
  type WastePlan = { lineId: string; name: string; consumption: Awaited<ReturnType<typeof planVoidWaste>> }
  const wastePlans = new Map<string, WastePlan[]>()
  if (wasted) {
    for (const round of rounds) {
      if (round.status === 'pending') continue
      const plans: WastePlan[] = []
      for (const line of round.items) {
        if (!line._id || line.itemType === 'combo') continue
        const consumption = await planVoidWaste(round as never, String(line._id), line.quantity)
        if (consumption.length) plans.push({ lineId: String(line._id), name: line.name, consumption })
      }
      if (plans.length) wastePlans.set(round.posId, plans)
    }
  }

  // ── Cancelar cada ronda (write-once, sin cobro) ─────────────────────────
  const now = new Date()
  const voidId = randomUUID()
  const reasonLabel = TABLE_VOID_REASON_INFO[reason].label
  const cancelled: (RoundDoc & { previousStatus: string })[] = []
  for (const round of rounds) {
    const updated = (await Order.findOneAndUpdate(
      {
        _id: round._id,
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        status: round.status,
        'posPayments.0': { $exists: false },
        tableVoid: { $exists: false },
      },
      {
        $set: {
          status: 'cancelled',
          'statusTimestamps.cancelledAt': now,
          'statusTimestamps.cancelledBy': 'admin',
          kitchenPrintDeferred: false,
          tableVoid: {
            at: now,
            by: ctx.user.id,
            byRole: role ?? 'unknown',
            approvedBy: approval.approvedBy,
            viaPin: approval.viaPin,
            reason,
            note,
            wasted: wasted && round.status !== 'pending',
            amount: round.total,
            previousStatus: round.status,
            voidId,
            tablePosId,
            tableNumber: table.number ?? null,
          },
        },
      },
      { returnDocument: 'after' }
    )
      .lean()
      .exec()) as unknown as RoundDoc | null
    if (!updated) {
      throw PosError.conflict(
        cancelled.length
          ? `La mesa cambió mientras se anulaba: se anularon ${cancelled.length} de ${rounds.length} rondas. Revisala y volvé a intentar.`
          : 'La mesa cambió mientras se anulaba. Volvé a intentar.',
        `posId=${round.posId}`
      )
    }
    cancelled.push({ ...updated, previousStatus: round.status })
  }

  // ── Inventario: revertir la venta y registrar la merma ───────────────────
  for (const round of cancelled) {
    await syncOrderConsumptionSafe(round as never)
    for (const plan of wastePlans.get(round.posId) ?? []) {
      await recordVoidWasteSafe(round as never, `table:${voidId}:${plan.lineId}`, plan.consumption, {
        name: plan.name,
        reasonLabel: `Mesa ${table.number} anulada — ${reasonLabel}`,
        actorId: ctx.user.id,
      })
    }
    runAfterResponse('referidos (mesa POS anulada)', () => syncReferralsForOrder(round as never))
  }

  // ── Mesa libre (verde) ───────────────────────────────────────────────────
  const freed = await Table.findOneAndUpdate(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posId: tablePosId },
    { $set: { ...FREE_TABLE_FIELDS, reservationId: null } },
    { returnDocument: 'after' }
  )
    .lean()
    .exec()

  // ── Aviso a cocina/barra de lo que ya se había mandado ───────────────────
  let printed = 0
  const sent = cancelled.filter((r) => r.previousStatus !== 'pending' && r.items.length > 0)
  if (sent.length > 0) {
    try {
      const by = approval.viaPin && approval.approverName ? approval.approverName : await operatorName(ctx)
      const [printers, location] = await Promise.all([
        Printer.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true }).lean(),
        Location.findOne({ _id: ctx.locationId }).select('timezone').lean<{ timezone?: string }>(),
      ])
      for (const round of sent) {
        const jobs = buildOrderVoidJobs({
          order: { orderNumber: round.orderNumber, posTableNumber: round.posTableNumber ?? table.number, items: round.items },
          printers: printers as never,
          reasonLabel,
          by,
          at: now,
          timezone: location?.timezone,
        })
        if (jobs.length === 0) continue
        await Order.updateOne({ _id: round._id }, { $push: { printJobs: { $each: jobs } }, $set: { printed: false } })
        printed += jobs.length
      }
    } catch (err) {
      console.error('[pos/tables/void] no se pudo avisar a cocina:', err)
    }
  }

  const amount = cancelled.reduce((s, r) => s + (r.total ?? 0), 0)
  await logAudit({
    tenantId: ctx.tenantId,
    action: hasPlates ? 'pos.table.void' : 'pos.table.release_empty',
    entity: 'Table',
    entityId: tablePosId,
    details: {
      tablePosId,
      tableNumber: table.number,
      voidId,
      reason,
      note,
      wasted,
      amount,
      approvedBy: approval.approvedBy,
      viaPin: approval.viaPin,
      rounds: cancelled.map((r) => ({ posId: r.posId, previousStatus: r.previousStatus, total: r.total, items: r.items.length })),
      kitchenNotices: printed,
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({
    table: toPosTable((freed ?? table) as unknown as PosTableDoc),
    orders: cancelled.map((r) => toPosOrder(r as unknown as PosOrderDoc)),
    voided: { rounds: cancelled.length, amount, wasted, printed },
  })
})
