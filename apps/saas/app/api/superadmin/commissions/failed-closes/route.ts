import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { requireSuperAdmin } from '@/lib/apiAuth'

/**
 * GET /api/superadmin/commissions/failed-closes
 *
 * Detecta tenants que tuvieron órdenes transfer confirmadas la semana anterior
 * pero cuyo WeeklyCommissionStatement no fue creado (cierre fallido).
 *
 * Response: { failedCloses: [{ tenantId, name, slug, orderCount, estimatedCommission }] }
 */
export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()

  // Calcular semana anterior
  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  ))
  const lastWeekStart = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastWeekEnd = new Date(thisMonday.getTime() - 1000)

  const tenants = await Tenant.find({ isActive: true })
    .select('slug name')
    .lean()

  const failedCloses: {
    tenantId: string
    name: string
    slug: string
    orderCount: number
    estimatedCommission: number
  }[] = []

  for (const tenant of tenants) {
    // ¿Existe statement para la semana pasada?
    const statement = await WeeklyCommissionStatement.findOne({
      tenantId: tenant._id,
      weekStart: lastWeekStart,
    }).lean()

    if (statement) continue // Statement existe, todo OK

    // ¿Hubo órdenes transfer confirmadas?
    const result = await Order.aggregate([
      {
        $match: {
          tenantId: tenant._id,
          'payment.method': 'transfer',
          'payment.status': { $ne: 'cancelled' },
          'statusTimestamps.confirmedAt': { $gte: lastWeekStart, $lte: lastWeekEnd },
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

    if (orderCount > 0) {
      failedCloses.push({
        tenantId: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        orderCount,
        estimatedCommission: totalCommission, // centavos — fmt() en el page aplica toPesos()
      })
    }
  }

  return NextResponse.json({
    lastWeekStart: lastWeekStart.toISOString(),
    lastWeekEnd: lastWeekEnd.toISOString(),
    failedCloses,
  })
}
