import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { commissionableFilter, weekBounds, weekKeyOf } from '@/lib/commission-weeks'
import { DEFAULT_TIMEZONE, addDaysToDateStr } from '@/lib/restaurant-time'

/**
 * El cron de cierre corre los lunes 08:00 UTC (05:00 ART). Antes de eso, que
 * no exista la liquidación de la semana que terminó es lo esperable: margen
 * de 10 h desde el fin de la semana antes de avisar.
 */
const CLOSE_GRACE_MS = 10 * 60 * 60 * 1000

/**
 * GET /api/superadmin/commissions/failed-closes
 *
 * Detecta comercios que tuvieron pedidos con comisión la semana anterior pero
 * cuya liquidación semanal (WeeklyCommissionStatement) no se creó.
 *
 * Usa EXACTAMENTE los criterios del cierre (lib/commission-weeks.ts): semana
 * de lunes a domingo en la hora del comercio, pedidos que generan comisión
 * (commissionableFilter) y fecha de creación. Antes calculaba la semana en
 * UTC: buscaba la liquidación del lunes 00:00 UTC cuando el cierre la guarda
 * el lunes 00:00 hora Argentina (03:00 UTC), no la encontraba y avisaba un
 * «cierre fallido» que no existía.
 *
 * Response: { failedCloses: [{ tenantId, name, slug, orderCount, estimatedCommission }] }
 */
export async function GET() {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()
  const now = new Date()

  const tenants = await Tenant.find({ isActive: true })
    .select('slug name timezone')
    .lean<Array<{ _id: import('mongoose').Types.ObjectId; slug: string; name: string; timezone?: string | null }>>()

  const failedCloses: {
    tenantId: string
    name: string
    slug: string
    orderCount: number
    estimatedCommission: number
  }[] = []
  let lastWeekStart: Date | null = null
  let lastWeekEnd: Date | null = null

  for (const tenant of tenants) {
    const tz = tenant.timezone || DEFAULT_TIMEZONE
    const previousKey = addDaysToDateStr(weekKeyOf(now, tz), -7)
    const { weekStart, weekEnd } = weekBounds(previousKey, tz)
    lastWeekStart ??= weekStart
    lastWeekEnd ??= weekEnd

    // El cierre todavía no tuvo oportunidad de correr para esta semana.
    if (now.getTime() < weekEnd.getTime() + CLOSE_GRACE_MS) continue

    const statement = await WeeklyCommissionStatement.exists({ tenantId: tenant._id, weekStart })
    if (statement) continue

    const result = await Order.aggregate([
      { $match: commissionableFilter(tenant._id, { createdAt: { $gte: weekStart, $lt: weekEnd } }) },
      { $group: { _id: null, totalCommission: { $sum: '$payment.platformFeeAmount' }, orderCount: { $sum: 1 } } },
    ])

    const orderCount = result[0]?.orderCount || 0
    if (orderCount > 0) {
      failedCloses.push({
        tenantId: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        orderCount,
        estimatedCommission: result[0]?.totalCommission || 0, // centavos — fmt() en el page aplica toPesos()
      })
    }
  }

  return NextResponse.json({
    lastWeekStart: lastWeekStart?.toISOString() ?? null,
    lastWeekEnd: lastWeekEnd ? new Date(lastWeekEnd.getTime() - 1000).toISOString() : null,
    failedCloses,
  })
}
