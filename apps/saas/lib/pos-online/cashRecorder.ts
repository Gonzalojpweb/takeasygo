import mongoose from 'mongoose'
import CashRegister from '@/models/CashRegister'
import CashMovement from '@/models/CashMovement'
import { cashExpectedDelta } from '@takeasygo/business'
import type { CashMovementSource, CashMovementType, PaymentMethod } from '@takeasygo/types'
import { findOpenRegister } from './cashRepo'
import type { PosContext } from './tenantContext'

// ============================================================================
// Registro de ventas y devoluciones en la caja, del lado del server (Fase 1)
// ============================================================================
// Antes el cobro quedaba en la orden y el movimiento de caja lo mandaba el POS
// en otra petición: si esa segunda petición fallaba, la venta quedaba en
// "pendientes" y el Z salía incompleto. Ahora el server registra las dos
// cosas en la misma operación. El POS sigue mandando su movimiento (POS
// anteriores, cajas abiertas después del cobro): la ruta de movimientos lo
// reconoce como el mismo hecho (`source: 'payment'`) y no duplica.
//
// Convención de idempotencia — IDÉNTICA a la del POS (counter-sale.ts):
//   relatedOrderId = posId de la orden, o `posId#i` si el cobro tiene varias
//   partes. Índice único (registerId, relatedOrderId, type).
// ============================================================================

export interface PaymentPartForCash {
  posId: string
  method: PaymentMethod
  amount: number
}

/** relatedOrderId de la parte `i` (misma regla que el POS). */
export function saleKeyFor(orderPosId: string, index: number, totalParts: number): string {
  return totalParts > 1 ? `${orderPosId}#${index}` : orderPosId
}

/** Concepto de la parte `i` (misma regla que el POS). */
export function saleReasonFor(base: string, index: number, totalParts: number): string {
  return totalParts > 1 ? `${base} (parte ${index + 1}/${totalParts})` : base
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000
}

interface RecordInput {
  orderPosId: string
  parts: readonly PaymentPartForCash[]
  type: Extract<CashMovementType, 'sale' | 'refund'>
  source: CashMovementSource
  baseReason: string
  approvedBy?: string | null
  /** posId del movimiento para la parte `i` (determinístico ⇒ reintento seguro). */
  movementPosId: (part: PaymentPartForCash, index: number) => string
}

/**
 * Registra un movimiento por parte en la caja ABIERTA de la sede.
 * @returns id de la caja usada, o null si no hay caja abierta.
 */
export async function recordPartsInOpenRegister(
  ctx: PosContext,
  input: RecordInput
): Promise<string | null> {
  const register = await findOpenRegister(ctx)
  if (!register) return null
  const registerId = register._id as mongoose.Types.ObjectId

  for (let i = 0; i < input.parts.length; i++) {
    const part = input.parts[i]
    const relatedOrderId = saleKeyFor(input.orderPosId, i, input.parts.length)
    try {
      await CashMovement.create({
        posId: input.movementPosId(part, i),
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        registerId,
        type: input.type,
        amount: part.amount,
        reason: saleReasonFor(input.baseReason, i, input.parts.length),
        userId: ctx.user.id,
        timestamp: new Date(),
        relatedOrderId,
        channel: 'counter',
        paymentMethod: part.method,
        category: null,
        approvedBy: input.approvedBy ?? null,
        source: input.source,
      })
    } catch (error) {
      // Mismo hecho ya registrado (reintento, o el POS lo mandó antes).
      if (isDuplicateKey(error)) continue
      throw error
    }
    const delta = cashExpectedDelta(input.type, part.method, part.amount)
    if (delta !== 0) {
      await CashRegister.updateOne({ _id: registerId, status: 'open' }, { $inc: { expectedAmount: delta } })
    }
  }
  return String(register.posId)
}
