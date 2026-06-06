import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import type { Types } from 'mongoose'

// ICO — Índice de Consistencia Operativa — uso interno, no público
// Fórmula: Consistencia×0.25 + Cumplimiento×0.30 + BajaCancelacion×0.20 + Actividad×0.15 + Estabilidad×0.10

type LayerKey = 'takeaway' | 'dineIn' | 'scheduled' | 'business'

const LAYER_FILTERS: Record<LayerKey, Record<string, any>> = {
  takeaway: { orderMode: 'takeaway', orderTiming: { $in: ['immediate', null] } },
  dineIn:   { orderMode: 'dine-in',   orderTiming: { $in: ['immediate', null] } },
  scheduled: { orderMode: 'takeaway', orderTiming: 'scheduled' },
  business: { orderMode: 'business' },
}

async function calcLayer(
  tenantId: Types.ObjectId,
  filter: Record<string, any>,
  start30: Date,
  start7: Date,
  estabilidad: number,
) {
  const [cancData, tppData, onTimeNew, onTimeFallback, actData7, actData30] = await Promise.all([
    Order.aggregate([
      { $match: { tenantId, ...filter, createdAt: { $gte: start30 } } },
      { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
    ]),
    Order.aggregate([
      { $match: { tenantId, ...filter, createdAt: { $gte: start30 }, 'statusTimestamps.confirmedAt': { $ne: null }, 'statusTimestamps.readyAt': { $ne: null } } },
      { $project: { tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] } } },
      { $group: { _id: null, avgMs: { $avg: '$tppMs' }, stdMs: { $stdDevPop: '$tppMs' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { tenantId, ...filter, createdAt: { $gte: start30 }, 'statusTimestamps.readyAt': { $ne: null }, 'statusTimestamps.estimatedReadyAt': { $ne: null } } },
      { $project: { isOnTime: { $lte: ['$statusTimestamps.readyAt', '$statusTimestamps.estimatedReadyAt'] } } },
      { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } } } },
    ]),
    Order.aggregate([
      { $match: { tenantId, ...filter, createdAt: { $gte: start30 }, 'statusTimestamps.readyAt': { $ne: null }, 'statusTimestamps.estimatedReadyAt': null } },
      { $lookup: { from: 'locations', localField: 'locationId', foreignField: '_id', as: 'location' } },
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: false } },
      { $project: { isOnTime: { $lte: [
        { $subtract: ['$statusTimestamps.readyAt', '$createdAt'] },
        { $multiply: ['$location.settings.estimatedPickupTime', 60000] },
      ] } } },
      { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } } } },
    ]),
    Order.countDocuments({ tenantId, ...filter, createdAt: { $gte: start7 }, status: { $ne: 'cancelled' } }),
    Order.countDocuments({ tenantId, ...filter, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } }),
  ])

  const cRaw = cancData[0]
  const tRaw = tppData[0]
  const mergedOnTimeTotal = (onTimeNew[0]?.total ?? 0) + (onTimeFallback[0]?.total ?? 0)
  const mergedOnTime = (onTimeNew[0]?.onTime ?? 0) + (onTimeFallback[0]?.onTime ?? 0)
  const oRaw = mergedOnTimeTotal > 0 ? { total: mergedOnTimeTotal, onTime: mergedOnTime } : null

  const totalOrders = cRaw?.total ?? 0
  const hasEnoughData = totalOrders >= 10

  const tppN = tRaw?.count ?? 0
  const dataQuality: 'insuficiente' | 'muestra_pequeña' | 'valida' =
    tppN >= 30 ? 'valida' : tppN >= 10 ? 'muestra_pequeña' : 'insuficiente'

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

  const consistency = tRaw && tRaw.avgMs > 0
    ? Math.max(0, Math.min(1, 1 - (tRaw.stdMs / tRaw.avgMs)))
    : null

  const cumplimiento = oRaw && oRaw.total > 0
    ? oRaw.onTime / oRaw.total
    : null

  const bajaCancelacion = cRaw && cRaw.total > 0
    ? Math.max(0, 1 - (cRaw.cancelled / cRaw.total))
    : null

  const avgWeekly = actData30 / 4
  const actividad = avgWeekly > 0
    ? Math.min(1, actData7 / avgWeekly)
    : actData7 > 0 ? 1 : 0

  let score: number | null = null
  if (hasEnoughData) {
    score = (consistency   ?? 0.5) * 0.25
          + (cumplimiento  ?? 0.5) * 0.30
          + (bajaCancelacion ?? 1) * 0.20
          + actividad           * 0.15
          + estabilidad         * 0.10
    score = Math.round(score * 100) / 100
  }

  return {
    score,
    sampleSize: totalOrders,
    dataQuality,
    hasEnoughData,
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
    },
  }
}

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

    const requestedLayerParam = request.nextUrl.searchParams.get('layer')
    const requestedLayer: LayerKey =
      requestedLayerParam === 'takeaway' || requestedLayerParam === 'dineIn' || requestedLayerParam === 'scheduled' || requestedLayerParam === 'business'
        ? requestedLayerParam
        : 'takeaway'

    // Estabilidad horaria global (sección 5.6): días activos sobre TODOS los pedidos
    const globalActiveDaysData = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
      { $count: 'days' },
    ])
    const globalActiveDays = globalActiveDaysData[0]?.days ?? 0
    const estabilidad = Math.min(1, globalActiveDays / 20)

    const [tw, di, sc, bu] = await Promise.all([
      calcLayer(tenantId, LAYER_FILTERS.takeaway,  start30, start7, estabilidad),
      calcLayer(tenantId, LAYER_FILTERS.dineIn,    start30, start7, estabilidad),
      calcLayer(tenantId, LAYER_FILTERS.scheduled, start30, start7, estabilidad),
      calcLayer(tenantId, LAYER_FILTERS.business,  start30, start7, estabilidad),
    ])

    const layers = { takeaway: tw, dineIn: di, scheduled: sc, business: bu }
    const primary = layers[requestedLayer]

    return NextResponse.json({
      score: primary.score,
      layer: requestedLayer,
      hasEnoughData: primary.hasEnoughData,
      sampleSize: primary.sampleSize,
      dataQuality: primary.dataQuality,
      components: primary.components,
      details: primary.details,
      layers: {
        takeaway: { score: tw.score, sampleSize: tw.sampleSize, dataQuality: tw.dataQuality },
        dineIn:   { score: di.score, sampleSize: di.sampleSize, dataQuality: di.dataQuality },
        scheduled: { score: sc.score, sampleSize: sc.sampleSize, dataQuality: sc.dataQuality },
        business: { score: bu.score, sampleSize: bu.sampleSize, dataQuality: bu.dataQuality },
      },
    })
  } catch (error) {
    console.error('[ICO] Error:', error)
    return NextResponse.json({ error: 'Error al calcular el ICO' }, { status: 500 })
  }
}
