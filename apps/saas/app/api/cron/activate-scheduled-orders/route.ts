/**
 * Cron Job: Activar pedidos programados
 *
 * Se ejecuta una vez al día (el plan Hobby de Vercel solo permite crons
 * diarios). Pasa scheduledStatus de pending_schedule → active cuando llegó
 * la hora programada, y marca como expirados los que pasaron la ventana de
 * gracia. Solo bookkeeping de estados: NO imprime ni notifica — la
 * impresión se gatea por tiempo en GET /print-jobs (poll del agente).
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
