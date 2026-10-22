import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { commissionableFilter, syncWeeklyStatements } from '@/lib/commission-weeks'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Cierre semanal de comisiones por transferencia (lunes 08:00 UTC = 05:00 ART).
 *
 * Para cada comercio con pedidos que generan comisión, lleva las
 * liquidaciones semanales al estado real (lib/commission-weeks.ts, fuente
 * única): crea la de la semana que cerró (lunes a domingo, HORA ARGENTINA),
 * congela sus pedidos y vencimiento, y actualiza pendiente / vencida /
 * pagada según lo saldado. Idempotente: correrlo de nuevo no duplica nada.
 *
 * Antes calculaba la semana en UTC y por `confirmedAt`, mientras el panel
 * usaba hora local y `createdAt`: los montos podían no coincidir.
 */
export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await connectDB()
    const now = new Date()
    const tenants = await Tenant.find({ isActive: true }).select('_id timezone').lean<Array<{ _id: import('mongoose').Types.ObjectId; timezone?: string | null }>>()

    let processed = 0
    let created = 0
    let paid = 0
    const failed: string[] = []
    for (const t of tenants) {
      if (!(await Order.exists(commissionableFilter(t._id)))) continue
      try {
        const r = await syncWeeklyStatements(t._id, { now, tz: t.timezone || undefined })
        processed++
        created += r.created
        paid += r.paid
      } catch (err) {
        failed.push(String(t._id))
        console.error('[Cron:weekly-commission-close] comercio', String(t._id), err)
      }
    }
    return NextResponse.json({ success: failed.length === 0, timestamp: now.toISOString(), processed, created, paid, failed, totalTenants: tenants.length })
  } catch (error) {
    console.error('[Cron:weekly-commission-close] Error:', error)
    return NextResponse.json({ error: 'Error ejecutando cron job' }, { status: 500 })
  }
}
