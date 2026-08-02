/**
 * Cron Job: Activar pedidos programados
 *
 * Se ejecuta cada 5 minutos para activar pedidos cuya hora programada llegó.
 * También marca como expirados los pedidos que pasaron la ventana de gracia.
 *
 * URL: /api/cron/activate-scheduled-orders
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import { activateScheduledOrders } from '@/lib/scheduled-orders'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const { activated, expired } = await activateScheduledOrders()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      activated,
      expired,
    })
  } catch (error) {
    console.error('[Cron:activate-scheduled-orders] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
