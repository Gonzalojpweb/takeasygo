/**
 * Cron Job: Cancelar sub-pagos pendientes en órdenes split (whoPays === 'split')
 *
 * Regla:
 * - 0 sub-pagos approved → cancela la orden completa
 * - ≥1 sub-pago approved → cancela SOLO los sub-pagos pending que superaron el timeout,
 *   remueve sus items, recalcula total, mueve a confirmed
 *
 * Timeout: configurable por tenant (default 2hs). Patrón consistente con
 * la configuración de timeout de reconciliación offline del POS.
 *
 * URL: /api/cron/cancel-pending-group-payments
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET
const DEFAULT_SPLIT_TIMEOUT_HOURS = 2

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const cutoff = new Date(Date.now() - DEFAULT_SPLIT_TIMEOUT_HOURS * 60 * 60 * 1000)

    // Find all split orders that are still awaiting payment or partially paid
    const splitOrders = await Order.find({
      whoPays: 'split',
      status: { $in: ['awaiting_payment', 'open'] },
      'payments.status': 'pending',
      createdAt: { $lt: cutoff },
    }).lean()

    let cancelledOrders = 0
    let partialCleans = 0

    for (const order of splitOrders) {
      const payments = (order.payments as any[]) || []
      const approvedPayments = payments.filter(p => p.status === 'approved')
      const pendingPayments = payments.filter(p => p.status === 'pending')

      if (approvedPayments.length === 0) {
        // No approved payments — cancel the entire order
        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              status: 'cancelled',
              'payment.status': 'rejected',
              'statusTimestamps.cancelledAt': new Date(),
            },
          }
        )
        cancelledOrders++
      } else {
        // Has approved payments — cancel only the pending sub-payments
        // and remove their items from the order
        const pendingItemIds = pendingPayments.flatMap(p => (p.itemIds || []).map((id: any) => id.toString()))

        // Remove pending items from order.items
        const updatedItems = (order.items as any[]).filter(
          item => !pendingItemIds.includes(item._id?.toString())
        )

        // Recalculate totals from remaining (approved) items only
        const newSubtotal = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0)

        // Mark pending payments as cancelled
        const updatedPayments = payments.map(p => {
          if (p.status === 'pending') {
            return { ...p, status: 'cancelled' }
          }
          return p
        })

        // Recalculate the aggregate payment summary from approved payments
        const approvedTotal = approvedPayments.reduce((sum, p) => sum + (p.total || 0), 0)
        const approvedBaseTotal = approvedPayments.reduce((sum, p) => sum + (p.baseTotal || 0), 0)
        const approvedSurcharge = approvedPayments.reduce((sum, p) => sum + (p.surchargeAmount || 0), 0)
        const approvedPlatformFee = approvedPayments.reduce((sum, p) => sum + (p.platformFeeAmount || 0), 0)

        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              status: 'confirmed',
              items: updatedItems,
              subtotal: newSubtotal,
              total: approvedTotal,
              payments: updatedPayments,
              'payment.baseTotal': approvedBaseTotal,
              'payment.surchargeAmount': approvedSurcharge,
              'payment.platformFeeAmount': approvedPlatformFee,
              'payment.status': 'approved',
              'statusTimestamps.confirmedAt': new Date(),
            },
          }
        )
        partialCleans++
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cancelledOrders,
      partialCleans,
      timeoutHours: DEFAULT_SPLIT_TIMEOUT_HOURS,
    })
  } catch (error) {
    console.error('[Cron:cancel-pending-group-payments] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 },
    )
  }
}
