import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

// Score Operativo Interno — no es público
// Fórmula: Consistencia×0.30 + Cumplimiento×0.30 + BajaCancelacion×0.20 + Actividad×0.10 + Estabilidad×0.10

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const tenantId = tenant._id
    const now = new Date()
    const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const start7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)

    const [cancData, tppData, onTimeData, actData7, actData30] = await Promise.all([
      // Tasa de cancelación (30 días)
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: start30 } } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
        }}
      ]),
      // TPP — media y desvío estándar (30 días)
      Order.aggregate([
        { $match: {
          tenantId,
          createdAt: { $gte: start30 },
          'statusTimestamps.confirmedAt': { $ne: null },
          'statusTimestamps.readyAt': { $ne: null },
        }},
        { $project: { tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] } } },
        { $group: {
          _id: null,
          avgMs: { $avg: '$tppMs' },
          stdMs: { $stdDevPop: '$tppMs' },
          count: { $sum: 1 }
        }}
      ]),
      // % en tiempo — readyAt - createdAt vs estimatedPickupTime (30 días)
      Order.aggregate([
        { $match: {
          tenantId,
          createdAt: { $gte: start30 },
          'statusTimestamps.readyAt': { $ne: null },
        }},
        { $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'location',
        }},
        { $unwind: { path: '$location', preserveNullAndEmpty: false } },
        { $project: {
          isOnTime: { $lte: [
            { $subtract: ['$statusTimestamps.readyAt', '$createdAt'] },
            { $multiply: ['$location.settings.estimatedPickupTime', 60000] }
          ]}
        }},
        { $group: {
          _id: null,
          total: { $sum: 1 },
          onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } }
        }}
      ]),
      // Actividad últimos 7 días
      Order.countDocuments({ tenantId, createdAt: { $gte: start7 }, status: { $ne: 'cancelled' } }),
      // Actividad últimos 30 días
      Order.countDocuments({ tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } }),
    ])

    const cRaw = cancData[0]
    const tRaw = tppData[0]
    const oRaw = onTimeData[0]

    // Mínimo de datos para calcular el score
    const totalOrders = cRaw?.total ?? 0
    const hasEnoughData = totalOrders >= 5

    // ── Componente 1: Consistencia (peso 0.30) ─────────────────────────────
    // 1 - (σ_TPP / μ_TPP). Si no hay datos: null
    let consistency: number | null = null
    if (tRaw && tRaw.avgMs > 0) {
      consistency = Math.max(0, Math.min(1, 1 - (tRaw.stdMs / tRaw.avgMs)))
    }

    // ── Componente 2: Cumplimiento de tiempos (peso 0.30) ──────────────────
    let cumplimiento: number | null = null
    if (oRaw && oRaw.total > 0) {
      cumplimiento = oRaw.onTime / oRaw.total
    }

    // ── Componente 3: Baja cancelación (peso 0.20) ─────────────────────────
    let bajaCancelacion: number | null = null
    if (cRaw && cRaw.total > 0) {
      bajaCancelacion = Math.max(0, 1 - (cRaw.cancelled / cRaw.total))
    }

    // ── Componente 4: Actividad reciente (peso 0.10) ───────────────────────
    // Proporción entre órdenes de la última semana vs promedio semanal del mes
    const avgWeekly = actData30 / 4
    const actividad = avgWeekly > 0
      ? Math.min(1, actData7 / avgWeekly)
      : actData7 > 0 ? 1 : 0

    // ── Componente 5: Estabilidad horaria (peso 0.10) ──────────────────────
    // Proxy: % de días con actividad en los últimos 30 días
    const activeDaysData = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
      { $count: 'days' }
    ])
    const activeDays = activeDaysData[0]?.days ?? 0
    const estabilidad = Math.min(1, activeDays / 20)  // 20/30 días activos = score 1

    // ── Score final ────────────────────────────────────────────────────────
    // Si faltan componentes críticos (TPP/onTime), usamos los disponibles con peso proporcional
    let score: number | null = null
    if (hasEnoughData) {
      const c1 = consistency   ?? 0.5  // fallback neutral si sin datos de TPP
      const c2 = cumplimiento  ?? 0.5  // fallback neutral si sin datos de TPP
      const c3 = bajaCancelacion ?? 1
      const c4 = actividad
      const c5 = estabilidad
      score = c1 * 0.30 + c2 * 0.30 + c3 * 0.20 + c4 * 0.10 + c5 * 0.10
      score = Math.round(score * 100) / 100
    }

    return NextResponse.json({
      score,
      hasEnoughData,
      sampleSize: totalOrders,
      components: {
        consistency:       consistency !== null ? Math.round(consistency * 100) : null,
        cumplimiento:      cumplimiento !== null ? Math.round(cumplimiento * 100) : null,
        bajaCancelacion:   bajaCancelacion !== null ? Math.round(bajaCancelacion * 100) : null,
        actividad:         Math.round(actividad * 100),
        estabilidad:       Math.round(estabilidad * 100),
      },
      details: {
        tppMinutes:    tRaw ? Math.round(tRaw.avgMs / 60000) : null,
        tppStdMinutes: tRaw ? Math.round(tRaw.stdMs / 60000) : null,
        cancRate:      cRaw ? Math.round((cRaw.cancelled / cRaw.total) * 100) : 0,
        onTimePct:     oRaw ? Math.round((oRaw.onTime / oRaw.total) * 100) : null,
        ordersLast7:   actData7,
        ordersLast30:  actData30,
        activeDays,
      }
    })
  } catch (error) {
    console.error('[score] Error:', error)
    return NextResponse.json({ error: 'Error al calcular el score' }, { status: 500 })
  }
}
