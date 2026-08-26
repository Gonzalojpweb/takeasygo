import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Cron de cierre semanal de comisiones por transferencia.
 * Corre los lunes a las 08:00 UTC (05:00 ART).
 *
 * 1. Calcula weekStart (último lunes 00:00) y weekEnd (domingo 23:59)
 * 2. Para cada tenant activo con órdenes de transfer en la semana:
 *    - Crea WeeklyCommissionStatement con upsert (idempotente)
 *    - Marca como vencidos los statements pendientes de semanas anteriores
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const now = new Date()

    // Calcular weekStart (lunes 00:00 UTC de la semana ANTERIOR)
    const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday - 7,
      0, 0, 0, 0
    ))
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000)

    // Solo ejecutar lunes (dayOfWeek === 1)
    if (dayOfWeek !== 1) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Not Monday', dayOfWeek })
    }

    // Buscar tenants activos
    const tenants = await Tenant.find({ isActive: true })
      .select('slug name')
      .lean()

    let created = 0
    let skipped = 0
    let vencidos = 0

    for (const tenant of tenants) {
      // Verificar si ya existe un statement para esta semana (idempotencia)
      const existing = await WeeklyCommissionStatement.findOne({
        tenantId: tenant._id,
        weekStart,
      }).lean()

      if (existing) {
        skipped++
        continue
      }

      // Contar y sumar comisiones de transfer confirmadas en la semana
      const result = await Order.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            'payment.method': 'transfer',
            'payment.status': { $ne: 'cancelled' },
            'statusTimestamps.confirmedAt': { $gte: weekStart, $lte: weekEnd },
          },
        },
        {
          $group: {
            _id: null,
            totalCommission: { $sum: '$payment.platformFeeAmount' },
            orderCount: { $sum: 1 },
          },
        },
      ])

      const totalCommission = result[0]?.totalCommission || 0
      const orderCount = result[0]?.orderCount || 0

      // Solo crear statement si hubo comisiones
      if (totalCommission <= 0) {
        skipped++
        continue
      }

      // Crear statement con upsert (idempotente)
      await WeeklyCommissionStatement.findOneAndUpdate(
        { tenantId: tenant._id, weekStart },
        {
          $setOnInsert: {
            tenantId: tenant._id,
            weekStart,
            weekEnd,
            amount: totalCommission,
            status: 'pendiente',
            closedAt: now,
            orderCount,
          },
        },
        { upsert: true, new: true }
      )

      created++

      // Marcar como vencidos los statements pendientes de semanas anteriores
      const updated = await WeeklyCommissionStatement.updateMany(
        {
          tenantId: tenant._id,
          weekStart: { $lt: weekStart },
          status: 'pendiente',
        },
        { $set: { status: 'vencido' } }
      )

      if (updated.modifiedCount > 0) {
        vencidos += updated.modifiedCount
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      created,
      skipped,
      vencidos,
      totalTenants: tenants.length,
    })
  } catch (error) {
    console.error('[Cron:weekly-commission-close] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
