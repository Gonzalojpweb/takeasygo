import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

// ICO — Índice de Consistencia Operativa — uso interno, no público
// Fórmula: Consistencia×0.25 + Cumplimiento×0.30 + BajaCancelacion×0.20 + Actividad×0.15 + Estabilidad×0.10

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

    const [cancData, tppData, onTimeNew, onTimeFallback, actData7, actData30] = await Promise.all([
      // Tasa de cancelación (30 días)
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: start30 } } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
        }}
      ]),
      // TPP — media y desvío estándar poblacional (30 días)
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
      // % en tiempo — NUEVO: usa estimatedReadyAt cuando está presente (pedidos post-deploy)
      Order.aggregate([
        { $match: {
          tenantId,
          createdAt: { $gte: start30 },
          'statusTimestamps.readyAt': { $ne: null },
          'statusTimestamps.estimatedReadyAt': { $ne: null },
        }},
        { $project: {
          isOnTime: { $lte: ['$statusTimestamps.readyAt', '$statusTimestamps.estimatedReadyAt'] }
        }},
        { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } } } }
      ]),
      // % en tiempo — FALLBACK: pedidos históricos sin estimatedReadyAt (fórmula anterior con $lookup)
      Order.aggregate([
        { $match: {
          tenantId,
          createdAt: { $gte: start30 },
          'statusTimestamps.readyAt': { $ne: null },
          'statusTimestamps.estimatedReadyAt': null,
        }},
        { $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'location',
        }},
        { $unwind: { path: '$location', preserveNullAndEmptyArrays: false } },
        { $project: {
          isOnTime: { $lte: [
            { $subtract: ['$statusTimestamps.readyAt', '$createdAt'] },
            { $multiply: ['$location.settings.estimatedPickupTime', 60000] }
          ]}
        }},
        { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } } } }
      ]),
      // Actividad últimos 7 días
      Order.countDocuments({ tenantId, createdAt: { $gte: start7 }, status: { $ne: 'cancelled' } }),
      // Actividad últimos 30 días
      Order.countDocuments({ tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } }),
    ])

    const cRaw = cancData[0]
    const tRaw = tppData[0]
    // Merge on-time data: nuevos pedidos (estimatedReadyAt) + fallback histórico ($lookup)
    const mergedOnTimeTotal = (onTimeNew[0]?.total ?? 0) + (onTimeFallback[0]?.total ?? 0)
    const mergedOnTime      = (onTimeNew[0]?.onTime ?? 0) + (onTimeFallback[0]?.onTime ?? 0)
    const oRaw = mergedOnTimeTotal > 0 ? { total: mergedOnTimeTotal, onTime: mergedOnTime } : null

    // ── Calidad de datos (Teorema del Límite Central) ───────────────────────
    // n < 10  → insuficiente: ICO no calculable
    // 10 ≤ n < 30 → muestra_pequeña: ICO calculable con advertencia
    // n ≥ 30 → valida: CLT aplica, SE e IC 95% son confiables
    const tppN = tRaw?.count ?? 0
    const dataQuality: 'insuficiente' | 'muestra_pequeña' | 'valida' =
      tppN >= 30 ? 'valida' : tppN >= 10 ? 'muestra_pequeña' : 'insuficiente'

    // SE = σ / √n  (Standard Error de la media del TPP)
    // CI_95 = μ ± 1.96 × SE  (solo significativo cuando n ≥ 30, CLT garantiza normalidad)
    let tppSE: number | null = null
    let tppCI95Low: number | null = null
    let tppCI95High: number | null = null
    if (tRaw && tppN >= 10) {
      tppSE = tRaw.stdMs / Math.sqrt(tppN)
      if (tppN >= 30) {
        tppCI95Low  = Math.round((tRaw.avgMs - 1.96 * tppSE) / 60000 * 10) / 10
        tppCI95High = Math.round((tRaw.avgMs + 1.96 * tppSE) / 60000 * 10) / 10
      }
    }

    // Mínimo de datos para calcular el ICO (se requieren ≥ 10 pedidos en 30 días)
    const totalOrders = cRaw?.total ?? 0
    const hasEnoughData = totalOrders >= 10

    // ── Componente 1: Consistencia del TPP (peso 0.25) ─────────────────────
    // 1 - (σ_TPP / μ_TPP) → Coeficiente de variación invertido
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

    // ── Componente 4: Actividad sostenida (peso 0.15) ──────────────────────
    // Proporción entre órdenes de la última semana vs promedio semanal del mes
    const avgWeekly = actData30 / 4
    const actividad = avgWeekly > 0
      ? Math.min(1, actData7 / avgWeekly)
      : actData7 > 0 ? 1 : 0

    // ── Componente 5: Estabilidad horaria (peso 0.10) ──────────────────────
    // Proxy: % de días con actividad en los últimos 30 días (20/30 = score 1)
    const activeDaysData = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
      { $count: 'days' }
    ])
    const activeDays = activeDaysData[0]?.days ?? 0
    const estabilidad = Math.min(1, activeDays / 20)

    // ── ICO final ──────────────────────────────────────────────────────────
    // Pesos: Consistencia×0.25 + Cumplimiento×0.30 + BajaCancelacion×0.20 + Actividad×0.15 + Estabilidad×0.10
    let score: number | null = null
    if (hasEnoughData) {
      const c1 = consistency    ?? 0.5  // fallback neutral si sin datos de TPP
      const c2 = cumplimiento   ?? 0.5  // fallback neutral si sin datos de cumplimiento
      const c3 = bajaCancelacion ?? 1
      const c4 = actividad
      const c5 = estabilidad
      score = c1 * 0.25 + c2 * 0.30 + c3 * 0.20 + c4 * 0.15 + c5 * 0.10
      score = Math.round(score * 100) / 100
    }

    return NextResponse.json({
      score,
      hasEnoughData,
      sampleSize: totalOrders,
      dataQuality,
      components: {
        consistency:     consistency     !== null ? Math.round(consistency * 100)     : null,
        cumplimiento:    cumplimiento    !== null ? Math.round(cumplimiento * 100)    : null,
        bajaCancelacion: bajaCancelacion !== null ? Math.round(bajaCancelacion * 100) : null,
        actividad:       Math.round(actividad * 100),
        estabilidad:     Math.round(estabilidad * 100),
      },
      details: {
        tppMinutes:    tRaw ? Math.round(tRaw.avgMs / 60000) : null,
        tppStdMinutes: tRaw ? Math.round(tRaw.stdMs / 60000) : null,
        tppN,
        tppSEMinutes:  tppSE ? Math.round(tppSE / 60000 * 10) / 10 : null,
        tppCI95Low,
        tppCI95High,
        cancRate:      cRaw && cRaw.total > 0 ? Math.round((cRaw.cancelled / cRaw.total) * 100) : 0,
        onTimePct:     oRaw && oRaw.total > 0 ? Math.round((oRaw.onTime / oRaw.total) * 100) : null,
        ordersLast7:   actData7,
        ordersLast30:  actData30,
        activeDays,
      }
    })
  } catch (error) {
    console.error('[ICO] Error:', error)
    return NextResponse.json({ error: 'Error al calcular el ICO' }, { status: 500 })
  }
}
