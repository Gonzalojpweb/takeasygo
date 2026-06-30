/**
 * Cron Job: Cancelar órdenes awaiting_payment huérfanas
 *
 * Cancela órdenes cuyo pago nunca se completó.
 * Se ejecuta periódicamente para mantener la DB limpia.
 *
 * URL: /api/cron/cancel-awaiting-payment
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
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

    const result = await Order.updateMany(
      {
        status: 'awaiting_payment',
        createdAt: { $lt: cutoff },
      },
      {
        $set: {
          status: 'cancelled',
          'payment.status': 'rejected',
        },
      },
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cancelledCount: result.modifiedCount,
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
