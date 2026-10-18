import StoreRedemption from '@/models/StoreRedemption'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import { syncWalletPoints } from '@/lib/walletService'
import mongoose from 'mongoose'

/**
 * Filtro compartido de canjes "pendientes vigentes" (badge Tienda y pestaña
 * Solicitudes del admin deben mostrar exactamente lo mismo):
 * - status 'pending', y
 * - sin vencimiento (expiresAt null) o con vencimiento futuro.
 * Los vencidos no aparecen aunque el cron de expiración todavía no los
 * haya barrido.
 */
export function pendingVigenteFilter(now: Date = new Date()) {
  return {
    status: 'pending',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }
}

/**
 * Cuenta los canjes vigentes de un tenant. Lo usan el badge del sidebar
 * "Tienda" y la pestaña Solicitudes.
 */
export async function countPendingRedemptions(
  tenantId: mongoose.Types.ObjectId | string
): Promise<number> {
  return StoreRedemption.countDocuments({ tenantId, ...pendingVigenteFilter() })
}

/**
 * Expira un canje STANDALONE vencido y devuelve los puntos al miembro.
 *
 * Flip condicional pending → expired: gana solo el primer llamante (cron o
 * claim), así un doble run nunca devuelve los puntos dos veces. Devuelve
 * pointsUsed, resta los contadores con clamp, restaura stock SOLO si está
 * trackeado (null = ilimitado; un $inc sobre null revienta) y libera la
 * deuda micro-SOS si el saldo queda >= 0 (misma regla auto-liberar que
 * addPointsFromOrder: esa deuda nació de ESTE canje).
 *
 * Los canjes de checkout nunca pasan por acá: viven con el pedido
 * (expiresAt null) y sus puntos se revierten con revertRewardRedemptions.
 *
 * Devuelve true si esta llamada ganó el flip.
 */
export async function expireStoreRedemption(redemption: {
  _id: mongoose.Types.ObjectId | string
}): Promise<boolean> {
  const flipped = await StoreRedemption.findOneAndUpdate(
    { _id: redemption._id, status: 'pending' },
    { $set: { status: 'expired' } },
    { returnDocument: 'after' }
  )
  if (!flipped) return false

  // Solo los standalone descontaron puntos al crearse.
  if (flipped.source !== 'standalone') return true

  const pointsUsed = flipped.pointsUsed || 0

  const member = await LoyaltyMember.findOne({
    _id: flipped.memberId,
    tenantId: flipped.tenantId,
  })
  if (member) {
    member.loyalty.points = (member.loyalty.points ?? 0) + pointsUsed
    member.store.totalRedemptions = Math.max(0, (member.store.totalRedemptions || 0) - 1)
    member.store.totalPointsSpent = Math.max(0, (member.store.totalPointsSpent || 0) - pointsUsed)
    if (member.sosConfig?.hasPendingSos && (member.loyalty.points ?? 0) >= 0) {
      member.sosConfig.hasPendingSos = false
      member.sosConfig.sosUsed = 0
    }
    await member.save()
  }

  const item = await StoreItem.findById(flipped.storeItemId).select('stock')
  if (item) {
    if (typeof item.stock === 'number') {
      await StoreItem.updateOne({ _id: item._id }, { $inc: { stock: 1, totalRedemptions: -1 } })
    } else {
      await StoreItem.updateOne({ _id: item._id }, { $inc: { totalRedemptions: -1 } })
    }
  }

  if (member?.wallet?.googleObjectId) {
    const memberId = member._id
    setImmediate(async () => {
      try {
        await syncWalletPoints(memberId)
      } catch (err) {
        console.error('[Store Redemptions] Error sincronizando wallet al expirar:', err)
      }
    })
  }

  return true
}

/**
 * Auto-claim de los canjes de checkout de una orden al entregarla
 * (decisión: se cierran solos con claimed + claimedAt + locationId; el
 * claim manual con código queda solo para standalone). Idempotente: solo
 * pasa pending → claimed, y solo toca canjes vinculados por orderId, que
 * son los de checkout. Nunca lanza: es side effect del guard del pedido.
 * Devuelve la cantidad de canjes reclamados.
 */
export async function claimCheckoutRedemptionsForOrder(
  orderId: mongoose.Types.ObjectId | string,
  locationId?: mongoose.Types.ObjectId | string | null
): Promise<number> {
  try {
    const result = await StoreRedemption.updateMany(
      { orderId, status: 'pending' },
      {
        $set: {
          status: 'claimed',
          claimedAt: new Date(),
          ...(locationId ? { locationId } : {}),
        },
      }
    )
    if (result.modifiedCount > 0) {
      console.log(
        `[Store Redemptions] Auto-claim: ${result.modifiedCount} canje(s) de la orden ${orderId}`
      )
    }
    return result.modifiedCount
  } catch (err) {
    console.error('[Store Redemptions] Error auto-reclamando canjes de la orden:', orderId, err)
    return 0
  }
}
