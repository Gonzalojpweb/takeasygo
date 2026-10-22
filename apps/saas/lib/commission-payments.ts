// ============================================================================
// Acreditación de pagos de comisiones (webhook de MP de la plataforma)
// ============================================================================
// Un pago aprobado de una CommissionPaymentIntent salda EXACTAMENTE los
// pedidos congelados al iniciar el pago:
//   1. Reclama la intención (una sola acreditación por intención y por pago).
//   2. Verifica que MP haya cobrado al menos el monto de la intención; si
//      cobró menos, NO salda nada (queda para revisión del superadmin).
//   3. Salda los pedidos de la intención que todavía no estén saldados
//      (si otro pago ya cubrió alguno, no se cobra dos veces).
//   4. Baja el saldo del comercio, limpia el flag de idempotencia de los
//      pedidos y marca pagadas las semanas que quedaron cubiertas.
// Si algo falla después del reclamo, se libera para que MP reintente.
// ============================================================================

import mongoose from 'mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import CommissionSettlement from '@/models/CommissionSettlement'
import CommissionPaymentIntent from '@/models/CommissionPaymentIntent'
import { syncWeeklyStatements } from '@/lib/commission-weeks'

/** Tolerancia por redondeo de MP (pesos ↔ centavos). @storedAs cents */
const AMOUNT_TOLERANCE_CENTS = 1

export type SettleIntentResult =
  | { status: 'settled'; orders: number; amountCents: number }
  | { status: 'already_paid' }
  | { status: 'not_found' }
  | { status: 'amount_mismatch'; expectedCents: number; paidCents: number }
  | { status: 'nothing_to_settle' }

export async function settleCommissionIntent(
  intentId: string,
  payment: { id: string; amountPesos: number },
): Promise<SettleIntentResult> {
  if (!mongoose.Types.ObjectId.isValid(intentId)) return { status: 'not_found' }
  const intent = await CommissionPaymentIntent.findById(intentId).lean()
  if (!intent) return { status: 'not_found' }
  if (intent.status === 'paid') return { status: 'already_paid' }

  const paidCents = Math.round(payment.amountPesos * 100)
  if (paidCents + AMOUNT_TOLERANCE_CENTS < intent.amount) {
    console.error(`[commission-payments] MP cobró ${paidCents} y la intención ${intentId} es de ${intent.amount}: no se salda`)
    return { status: 'amount_mismatch', expectedCents: intent.amount, paidCents }
  }

  // 1) Reclamo atómico: solo una acreditación por intención.
  const claimed = await CommissionPaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: { $ne: 'paid' } },
    { $set: { status: 'paid', mpPaymentId: payment.id, paidAmount: paidCents, paidAt: new Date() } },
    { new: true },
  ).lean()
  if (!claimed) return { status: 'already_paid' }

  try {
    // 3) Solo los pedidos que todavía no estén saldados por otro pago.
    const settlements = await CommissionSettlement.find({ tenantId: intent.tenantId }).select('orderIds').lean<Array<{ orderIds?: string[] }>>()
    const settled = new Set(settlements.flatMap((s) => (s.orderIds ?? []).map(String)))
    const toSettle = intent.orderIds.filter((id) => !settled.has(String(id)))
    if (toSettle.length === 0) {
      console.warn(`[commission-payments] intención ${intentId} pagada pero sus pedidos ya estaban saldados (revisar devolución)`)
      await syncWeeklyStatements(intent.tenantId, { paidBy: `mp-payment-${payment.id}` })
      return { status: 'nothing_to_settle' }
    }
    const orders = await Order.find({ _id: { $in: toSettle }, tenantId: intent.tenantId })
      .select('_id createdAt payment.platformFeeAmount')
      .lean<Array<{ _id: mongoose.Types.ObjectId; createdAt: Date; payment: { platformFeeAmount: number } }>>()
    const amountCents = orders.reduce((s, o) => s + (o.payment?.platformFeeAmount || 0), 0)
    const times = orders.map((o) => o.createdAt.getTime())

    await CommissionSettlement.create({
      tenantId: intent.tenantId,
      from: new Date(Math.min(...times)),
      to: new Date(Math.max(...times)),
      amountCollected: amountCents,
      collectedAt: new Date(),
      collectedBy: `mp-payment-${payment.id}`,
      notes: `Pago MP de comisiones (intención ${intentId}) — ${payment.amountPesos} ARS`,
      orderIds: orders.map((o) => String(o._id)),
      status: 'paid',
    })
    // 4) Saldo del comercio, flags de idempotencia y semanas.
    await Tenant.updateOne({ _id: intent.tenantId }, { $inc: { 'commissionBalance.transfer': -amountCents } })
    await Order.updateMany({ _id: { $in: orders.map((o) => o._id) } }, { $set: { 'payment.commissionBalanceAdded': false } })
    await syncWeeklyStatements(intent.tenantId, { paidBy: `mp-payment-${payment.id}` })
    return { status: 'settled', orders: orders.length, amountCents }
  } catch (err) {
    // Liberar el reclamo: MP reintenta el aviso y se vuelve a intentar.
    await CommissionPaymentIntent.updateOne(
      { _id: intent._id, mpPaymentId: payment.id },
      { $set: { status: 'pending', mpPaymentId: null, paidAmount: null, paidAt: null } },
    ).catch(() => undefined)
    throw err
  }
}
