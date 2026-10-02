import Order from '@/models/Order'
import Tenant from '@/models/Tenant'

/**
 * Incrementa tenant.commissionBalance.transfer de forma idempotente.
 *
 * Usa un flag `payment.commissionBalanceAdded` en la orden para garantizar
 * que cada orden solo incremente el balance UNA vez, sin importar cuántas
 * veces se llame (race conditions, cambios de status repetidos, etc).
 *
 * Retorna true si el incremento se aplicó, false si ya estaba aplicado.
 */
export async function incrementCommissionBalance(
  orderId: unknown,
  tenantId: unknown,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return false

  // Atomically claim the flag on the order — only one caller wins
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.commissionBalanceAdded': { $ne: true } },
    { $set: { 'payment.commissionBalanceAdded': true } },
    { new: true },
  ).select('_id')

  if (!claimed) return false

  // Flag claimed — now increment the tenant balance
  await Tenant.updateOne(
    { _id: tenantId },
    { $inc: { 'commissionBalance.transfer': amount } },
  )

  return true
}

/**
 * Revierte el incremento de commissionBalance si la orden se cancela.
 * Solo revierte si el flag estaba activo (es decir, si realmente se incrementó).
 */
export async function revertCommissionBalance(
  orderId: unknown,
  tenantId: unknown,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return false

  const reverted = await Order.findOneAndUpdate(
    { _id: orderId, 'payment.commissionBalanceAdded': true },
    { $set: { 'payment.commissionBalanceAdded': false } },
    { new: true },
  ).select('_id')

  if (!reverted) return false

  await Tenant.updateOne(
    { _id: tenantId },
    { $inc: { 'commissionBalance.transfer': -amount } },
  )

  return true
}
