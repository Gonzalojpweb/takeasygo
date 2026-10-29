import mongoose from 'mongoose'
import Order from '@/models/Order'
import type { PosContext } from './tenantContext'
import { recordPartsInOpenRegister, type PaymentPartForCash } from './cashRecorder'

// ============================================================================
// Conciliación de cobros ↔ caja antes del cierre (informe de caja X3/X7)
// ============================================================================
// El cobro (orden) y su movimiento de caja se escriben en la misma petición
// del servidor, pero no en una transacción: si el movimiento falla (red, base
// ocupada) el cobro queda bien y el Z saldría sin esa venta. Antes de cerrar
// se buscan las órdenes del POS COBRADAS en esta sede durante el turno y se
// registra el movimiento que falte (venta y, si se anuló en el turno, su
// devolución). Idempotente por construcción: la misma
// clave `pay:<posId del pago>` y el índice (caja, orden, tipo) — un cobro ya
// registrado nunca se duplica.
// ============================================================================

interface PaidPosOrder {
  _id: mongoose.Types.ObjectId
  posId?: string | null
  orderNumber?: string | null
  posPayments?: { posId: string; method: PaymentPartForCash['method']; amount: number; paidAt?: Date }[] | null
  voided?: { at: Date; reason?: string; approvedBy?: string } | null
}

export async function reconcileShiftSales(ctx: PosContext, openedAt: Date): Promise<number> {
  const orders = await Order.find({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    locationId: new mongoose.Types.ObjectId(ctx.locationId),
    source: 'pos',
    deletedAt: null,
    $or: [{ 'posPayments.paidAt': { $gte: openedAt } }, { 'voided.at': { $gte: openedAt } }],
  })
    .select('posId orderNumber posPayments voided')
    .limit(5000)
    .lean<PaidPosOrder[]>()

  let recorded = 0
  for (const order of orders) {
    const parts = (order.posPayments ?? [])
      .filter((p) => p.posId && p.amount > 0)
      .map((p) => ({ posId: p.posId, method: p.method, amount: p.amount }))
    if (!order.posId || parts.length === 0) continue
    try {
      await recordPartsInOpenRegister(ctx, {
        orderPosId: order.posId,
        parts,
        type: 'sale',
        source: 'payment',
        baseReason: `Pedido ${order.orderNumber ?? order.posId.slice(0, 8)} (conciliado al cierre)`,
        movementPosId: (part) => `pay:${part.posId}`,
        onCreated: () => { recorded++ },
      })
      // Venta anulada en el turno: su devolución (misma clave que la ruta
      // de anulación, `void:<parte>`).
      if (order.voided && order.voided.at >= openedAt) {
        await recordPartsInOpenRegister(ctx, {
          orderPosId: order.posId,
          parts,
          type: 'refund',
          source: 'void',
          baseReason: `Anulación (conciliada al cierre)`,
          approvedBy: order.voided.approvedBy ?? null,
          movementPosId: (part) => `void:${part.posId}`,
          onCreated: () => { recorded++ },
        })
      }
    } catch (err) {
      console.error(`[cash/reconcile] no se pudo conciliar el cobro de ${order.posId}:`, err)
    }
  }
  return recorded
}
