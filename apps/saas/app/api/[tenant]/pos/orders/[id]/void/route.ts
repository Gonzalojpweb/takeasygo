import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import Table from '@/models/Table'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosOrder, assertPosId, type PosOrderDoc } from '@/lib/pos-online/orderRepo'
import { requireManagerApproval } from '@/lib/pos-online/approval'
import { recordPartsInOpenRegister } from '@/lib/pos-online/cashRecorder'
import { findOpenRegister } from '@/lib/pos-online/cashRepo'
import { syncOrderConsumptionSafe } from '@/lib/inventory/sales'
import { syncReferralsForOrder } from '@/lib/referrals'
import { runAfterResponse } from '@/lib/after-response'
import { isVoidReason, VOID_REASON_LABELS } from '@takeasygo/business'
import { documentSummary, issueCreditNoteForOrder } from '@/lib/fiscal/issue'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import type { PaymentMethod } from '@takeasygo/types'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/void — anular una venta COBRADA
// ============================================================================
// Fase 1 de caja (2026-10). Antes un cajero podía cancelar una orden cobrada
// sin autorización y sin que la plata saliera de la caja: la forma más simple
// de llevarse efectivo sin rastro. Ahora:
//
//   · Solo órdenes cobradas (posPayments). Una orden sin cobrar se cancela
//     con PATCH status (y si ya está en cocina también pide encargado).
//   · Cajero ⇒ PIN de encargado (lib/pos-online/approval.ts). Encargado o
//     admin ⇒ aprobación implícita.
//   · Hace falta la caja abierta: cada parte del cobro genera su DEVOLUCIÓN
//     (type 'refund', source 'void') con la misma clave que la venta
//     (`posId` o `posId#i`). El efectivo baja el arqueo; el resto queda en
//     el Z por medio de pago (la devolución en el posnet/MP se hace en el
//     terminal).
//   · Vale para cualquier estado, también `delivered`: anular no es una
//     transición del flujo de servicio (ese grafo no se toca) sino un hecho
//     contable. La orden queda `cancelled` (también `payment.status`) y con
//     `voided` (write-once) para auditoría.
//   · Efectos: devuelve insumos (inventario), libera la mesa, revierte el
//     paso de referidos y, si la venta estaba facturada, emite la NOTA DE
//     CRÉDITO asociada (Fase 5). Si ARCA no responde, queda en reintento:
//     la anulación no se frena.
//
// Body: { reason: 'load_error' | 'customer_left' | 'complaint' | 'other', note? }
// ============================================================================

const MAX_NOTE = 200

type VoidableOrder = PosOrderDoc & {
  status: string
  total: number
  posPayments?: { posId: string; method: string; amount: number }[] | null
  voided?: { at: Date } | null
}

export const POST = posRoute<{ tenant: string; id: string }>('orders.pay', async (ctx, params) => {
  const posId = assertPosId(params.id)
  const body = await readPosBody<{ reason?: unknown; note?: unknown }>(ctx.request)

  if (!isVoidReason(body.reason)) throw PosError.validation('Elegí el motivo de la anulación')
  const reason = body.reason
  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE) : null

  const order = (await findPosOrder(ctx, posId)) as VoidableOrder

  if (order.voided) {
    // Reintento de la misma anulación: idempotente.
    return NextResponse.json({ order: toPosOrder(order as never) })
  }
  const parts = order.posPayments ?? []
  if (parts.length === 0) {
    throw PosError.conflict('La orden no está cobrada: cancelala desde el pedido')
  }

  const register = await findOpenRegister(ctx)
  if (!register) {
    throw PosError.conflict('Abrí la caja para registrar la devolución')
  }

  const approval = await requireManagerApproval(
    ctx,
    'order.void',
    `Anular una venta cobrada (${VOID_REASON_LABELS[reason]}) necesita la aprobación de un encargado`
  )

  // Write-once: solo la primera anulación gana (dos cajeros a la vez).
  const now = new Date()
  const updated = await Order.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
      'posPayments.0': { $exists: true },
      voided: { $exists: false },
    },
    {
      $set: {
        status: 'cancelled',
        'payment.status': 'cancelled',
        'statusTimestamps.cancelledAt': now,
        'statusTimestamps.cancelledBy': 'admin',
        voided: {
          at: now,
          by: ctx.user.id,
          approvedBy: approval.approvedBy,
          reason,
          note,
          registerPosId: String(register.posId),
        },
      },
    },
    { new: true }
  )
    .lean()
    .exec()

  if (!updated) {
    const fresh = (await findPosOrder(ctx, posId)) as VoidableOrder
    if (fresh.voided) return NextResponse.json({ order: toPosOrder(fresh as never) })
    throw PosError.conflict('La orden cambió mientras se anulaba', `posId=${posId}`)
  }

  // Devoluciones (idempotentes por posId `void:<parte>`).
  await recordPartsInOpenRegister(ctx, {
    orderPosId: posId,
    parts: parts.map((p) => ({ posId: p.posId, method: p.method as PaymentMethod, amount: p.amount })),
    type: 'refund',
    source: 'void',
    baseReason: `Anulación — ${VOID_REASON_LABELS[reason]}`,
    approvedBy: approval.approvedBy,
    movementPosId: (part) => `void:${part.posId}`,
  })

  // Inventario: la cancelación devuelve los insumos descontados.
  await syncOrderConsumptionSafe(updated as never)

  if (order.posTableId) {
    await Table.updateOne(
      {
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        posId: order.posTableId,
        currentOrderId: posId,
      },
      { $set: { status: 'free', currentOrderId: null, needsBill: false } }
    )
  }

  runAfterResponse('referidos (venta POS anulada)', () => syncReferralsForOrder(updated as never))

  // Nota de crédito de la factura (si la había). Nunca frena la anulación.
  let creditNote: ReturnType<typeof documentSummary> | null = null
  try {
    const nc = await issueCreditNoteForOrder({
      tenantId: ctx.tenantId,
      orderId: String((updated as unknown as { _id: unknown })._id),
      userId: ctx.user.id,
    })
    if (nc) {
      creditNote = documentSummary(nc)
      if (nc.status === 'authorized') await enqueueFiscalTicket(nc).catch(() => undefined)
    }
  } catch (err) {
    console.error('[pos/void] nota de crédito pendiente:', err)
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.void',
    entity: 'Order',
    entityId: posId,
    details: {
      posId,
      total: order.total,
      previousStatus: order.status,
      reason,
      note,
      approvedBy: approval.approvedBy,
      viaPin: approval.viaPin,
      registerPosId: String(register.posId),
      parts: parts.map((p) => ({ method: p.method, amount: p.amount })),
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(updated as never), creditNote })
})
