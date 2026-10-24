import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosOrder, assertPosId, type PosOrderDoc } from '@/lib/pos-online/orderRepo'
import {
  assertPaymentsCoverTotal,
  parsePosPayments,
  paymentsSignature,
  posPlatformFeeAmount,
  summaryPaymentMethod,
} from '@/lib/pos-online/paymentPolicy'
import { recordPartsInOpenRegister, type PaymentPartForCash } from '@/lib/pos-online/cashRecorder'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/payments — registra el cobro de la orden
// ============================================================================
// Body: { payments: [{ id, method, amount, reference? }] }   (centavos)
//
// Orden de operación: tenant → auth → sede (posRoute) → body → reglas.
// Reglas (lib/pos-online/paymentPolicy.ts):
//   · la suma de las partes == total recalculado por el server
//   · write-once: una orden se cobra UNA vez. Reintento idéntico ⇒ 200 con
//     la orden; un cobro distinto sobre una orden ya cobrada ⇒ 409.
//   · orden cancelada ⇒ 409; Kripton ⇒ 400 (no integrado en el POS).
//
// Acá queda la verdad del cobro EN LA ORDEN (lo que leen reportes, comisiones
// y el panel de pedidos del SaaS) y, desde la Fase 1 de caja (2026-10), la
// venta entra en la MISMA operación a la caja abierta de la sede
// (lib/pos-online/cashRecorder.ts, `source: 'payment'`). Sin caja abierta, el
// POS la deja en su cola de pendientes como antes. `reason` (opcional) es el
// concepto que se ve en la caja: "Pedido M5".
// ============================================================================

const MAX_REASON_LENGTH = 120

function readReason(body: unknown, posId: string): string {
  const raw = (body as { reason?: unknown })?.reason
  const text = typeof raw === 'string' ? raw.trim().slice(0, MAX_REASON_LENGTH) : ''
  return text || `Pedido ${posId.slice(0, 8)}`
}

/** Registra el cobro en la caja abierta (idempotente). Nunca corta el cobro. */
async function recordSaleInCash(
  ctx: Parameters<Parameters<typeof posRoute>[1]>[0],
  posId: string,
  parts: PaymentPartForCash[],
  reason: string
): Promise<string | null> {
  try {
    return await recordPartsInOpenRegister(ctx, {
      orderPosId: posId,
      parts,
      type: 'sale',
      source: 'payment',
      baseReason: reason,
      movementPosId: (part) => `pay:${part.posId}`,
    })
  } catch (err) {
    console.error('[pos/payments] no se pudo registrar la venta en caja:', err)
    return null
  }
}

type PaidOrderDoc = PosOrderDoc & {
  total: number
  status: string
  posPayments?: { posId: string; method: string; amount: number; reference?: string | null }[] | null
}

export const POST = posRoute<{ tenant: string; id: string }>('orders.pay', async (ctx, params) => {
  const posId = assertPosId(params.id)
  const body = await readPosBody(ctx.request)
  const parts = parsePosPayments(body)
  const reason = readReason(body, posId)

  const order = (await findPosOrder(ctx, posId)) as PaidOrderDoc

  const replay = async (existing: PaidOrderDoc) => {
    if (paymentsSignature(existing.posPayments ?? []) !== paymentsSignature(parts)) {
      throw PosError.idempotencyMismatch('La orden ya fue cobrada con otro detalle', `posId=${posId}`)
    }
    // Reintento: si la venta no había llegado a la caja, se completa ahora.
    const cashRegisterId = await recordSaleInCash(ctx, posId, parts, reason)
    return NextResponse.json({ order: toPosOrder(existing), cashRegisterId }, { status: 200 })
  }

  if (order.posPayments?.length) return replay(order)

  if (order.status === 'cancelled') {
    throw PosError.conflict('La orden está cancelada: no se puede cobrar')
  }

  assertPaymentsCoverTotal(parts, order.total)

  const paidAt = new Date()
  const posPayments = parts.map((p) => ({
    posId: p.posId,
    method: p.method,
    amount: p.amount,
    reference: p.reference,
    userId: ctx.user.id,
    paidAt,
  }))

  // Guard atómico: solo escribe si la orden sigue sin cobro y con el mismo
  // total que se validó (si alguien agregó un item en el medio, 409).
  const updated = await Order.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
      total: order.total,
      status: { $ne: 'cancelled' },
      'posPayments.0': { $exists: false },
    },
    {
      $set: {
        posPayments,
        'payment.status': 'approved',
        'payment.method': summaryPaymentMethod(parts),
        'payment.baseTotal': order.total,
        'payment.surchargePercent': 0,
        'payment.surchargeAmount': 0,
        'payment.platformFeeAmount': posPlatformFeeAmount(),
      },
    },
    { returnDocument: 'after' }
  )
    .lean()
    .exec()

  if (!updated) {
    // Carrera: otro request cobró, canceló o cambió el total. Releer decide.
    const fresh = (await findPosOrder(ctx, posId)) as PaidOrderDoc
    if (fresh.posPayments?.length) return replay(fresh)
    throw PosError.conflict('La orden cambió mientras se registraba el cobro', `posId=${posId}`)
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.payment',
    entity: 'Order',
    entityId: posId,
    details: {
      posId,
      total: order.total,
      parts: parts.map((p) => ({ method: p.method, amount: p.amount })),
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  const cashRegisterId = await recordSaleInCash(ctx, posId, parts, reason)

  return NextResponse.json(
    { order: toPosOrder(updated as unknown as PosOrderDoc), cashRegisterId },
    { status: 201 }
  )
})
