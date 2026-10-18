/**
 * Cron Job: Cancelar órdenes awaiting_payment huérfanas
 *
 * Cancela órdenes cuyo pago nunca se completó.
 * Solo aplica a pagos single_payer (empresa paga) o legacy sin whoPays.
 * Órdenes con whoPays === 'split' quedan excluidas — tienen su propio cron.
 *
 * URL: /api/cron/cancel-awaiting-payment
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
import Menu from '@/models/Menu'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET
const CUTOFF_HOURS = 6

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const cutoff = new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000)

    // Only cancel single_payer orders (or legacy orders without whoPays field).
    // whoPays: null también matchea — el schema define `default: null`, así que
    // las órdenes legacy quedan guardadas con el campo presente y valiendo null
    // (con `{ $exists: false }` nunca se cancelaban).
    // Split payment orders are excluded — they have their own cancellation logic
    // with a shorter timeout and per-member handling.
    const filter = {
      status: 'awaiting_payment',
      createdAt: { $lt: cutoff },
      $or: [
        { whoPays: 'single_payer' },
        { whoPays: null },
      ],
    }

    // Primero identificar: los pedidos con premios necesitan la reversa
    // individual (puntos, stock y canjes), que no puede hacerse con updateMany.
    const candidateIds = (await Order.find(filter).select('_id').lean()).map((o: any) => o._id)

    const result = await Order.updateMany(
      { _id: { $in: candidateIds } },
      {
        $set: {
          status: 'cancelled',
          'payment.status': 'rejected',
          'statusTimestamps.cancelledAt': new Date(),
        },
      },
    )

    // Revertir canjes de premios de las órdenes recién canceladas.
    // Sin esto, el stock queda descontado y el StoreRedemption queda 'pending'
    // para siempre (el pedido nunca se paga ni se cancela por otra vía).
    let revertedRewards = 0
    if (candidateIds.length > 0) {
      const ordersWithRewards = await Order.find({
        _id: { $in: candidateIds },
        'rewardItems.0': { $exists: true },
      })
      if (ordersWithRewards.length > 0) {
        const tenantIds = [...new Set(ordersWithRewards.map((o: any) => String(o.tenantId)))]
        const tenants = await Tenant.find({ _id: { $in: tenantIds } })
        const tenantById = new Map(tenants.map((t: any) => [String(t._id), t]))

        for (const order of ordersWithRewards) {
          const tenant = tenantById.get(String(order.tenantId))
          if (!tenant) continue
          try {
            await revertRewardRedemptions(order, tenant)
            revertedRewards++
          } catch (e) {
            console.error(
              `[cancel-awaiting-payment] Failed to revert rewards for order ${order.orderNumber}:`,
              e
            )
          }
        }
      }
    }

    // Liberar hidden reward claims reservados para órdenes canceladas
    if (result.modifiedCount > 0) {
      const cancelledOrderIds = await Order.find({
        status: 'cancelled',
        'statusTimestamps.cancelledAt': { $gte: new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000) },
      }).distinct('_id')

      if (cancelledOrderIds.length > 0) {
        const released = await HiddenRewardClaim.updateMany(
          { usedOrderId: { $in: cancelledOrderIds }, status: 'reservado' },
          { $set: { status: 'pendiente', reservedOrderId: null, reservationExpiresAt: null } }
        )

        if (released.modifiedCount > 0) {
          console.log(`[cancel-awaiting-payment] Released ${released.modifiedCount} hidden reward claims from cancelled orders`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cancelledCount: result.modifiedCount,
      revertedRewardOrders: revertedRewards,
      cutoffHours: CUTOFF_HOURS,
    })
  } catch (error) {
    console.error('[Cron:cancel-awaiting-payment] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 },
    )
  }
}
