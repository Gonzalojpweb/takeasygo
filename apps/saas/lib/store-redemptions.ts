import StoreRedemption from '@/models/StoreRedemption'
import mongoose from 'mongoose'

/**
 * Cuenta los canjes vigentes (status pending y expiresAt futuro) de un
 * tenant. Lo usan el badge del sidebar "Tienda" y la pestaña Solicitudes.
 * Los vencidos no cuentan aunque el cron de expiración todavía no los
 * haya barrido.
 */
export async function countPendingRedemptions(
  tenantId: mongoose.Types.ObjectId | string
): Promise<number> {
  return StoreRedemption.countDocuments({
    tenantId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
}
