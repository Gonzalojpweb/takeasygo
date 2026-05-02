import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import { syncWalletPoints } from '@/lib/walletService'

/**
 * Calcula puntos según la configuración del tenant
 */
export function calculatePoints(orderTotal: number, pointsConfig: any): number {
  if (!pointsConfig?.enabled || orderTotal < (pointsConfig.minOrderForPoints || 0)) {
    return 0
  }

  let points = 0
  const mode = pointsConfig.mode || 'fixed_per_currency'

  if (mode === 'fixed_per_currency') {
    // Puntos por cada $1 gastado (ej: 0.1 = 1 punto cada $10)
    points = Math.floor(orderTotal * (pointsConfig.pointsPerCurrency || 0.1))
  } else if (mode === 'percentage') {
    // % del monto convertido a puntos (ej: 10% = 0.1 del monto)
    points = Math.floor(orderTotal * (pointsConfig.pointsPercentage || 10) / 100)
  } else if (mode === 'hybrid') {
    // Combinación de ambos métodos
    const fromCurrency = Math.floor(orderTotal * (pointsConfig.pointsPerCurrency || 0.1))
    const fromPercentage = Math.floor(orderTotal * (pointsConfig.pointsPercentage || 10) / 100)
    points = fromCurrency + fromPercentage
  }

  // Sumar puntos fijos por pedido si está configurado
  points += pointsConfig.pointsPerOrder || 0

  return Math.max(0, points)
}

/**
 * Agrega puntos a un miembro basado en una orden
 */
export async function addPointsFromOrder(order: any, tenant: any, session?: mongoose.ClientSession) {
  // Evitar duplicados si ya se acreditaron puntos
  if (order.loyaltyPointsCredited) {
    console.log(`[Loyalty] Puntos ya acreditados para la orden ${order.orderNumber}`)
    return null
  }

  if (!order.customer?.phoneHash) return null

  const pointsToAdd = calculatePoints(order.total ?? 0, tenant.pointsConfig)
  if (pointsToAdd <= 0) return null

  console.log(`[Loyalty] Agregando ${pointsToAdd} puntos a miembro con hash ${order.customer.phoneHash}`)

  // 1. Actualizar el miembro
  const member = await LoyaltyMember.findOneAndUpdate(
    {
      tenantId:  tenant._id,
      phoneHash: order.customer.phoneHash,
      status:   'active',
    },
    {
      $inc: {
        'cache.totalOrders': 1,
        'cache.totalSpent':  order.total ?? 0,
        'loyalty.points': pointsToAdd,
      },
      $set: {
        'cache.lastOrderAt': new Date(),
        'cache.updatedAt':  new Date(),
      },
    },
    { session, upsert: false, new: true }
  ).catch(() => null)

  // 2. Marcar la orden como procesada para lealtad
  if (member) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { loyaltyPointsCredited: true } },
      { session }
    )
    
    // Actualizar el objeto local por si se usa después en la misma ejecución
    order.loyaltyPointsCredited = true

    // 3. Sincronizar asíncronamente con la billetera
    if (pointsToAdd > 0 && member.wallet?.googleObjectId) {
      setImmediate(async () => {
        try {
          await syncWalletPoints(member._id)
          console.log(`[Loyalty] Wallet sincronizada para miembro ${member._id}`)
        } catch (err) {
          console.error('[Loyalty] Error sincronizando wallet:', err)
        }
      })
    }
  }

  return member
}
