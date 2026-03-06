import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

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

    if (tenant.plan !== 'trial') {
      return NextResponse.json({ error: 'Solo disponible para plan Trial' }, { status: 403 })
    }

    const tenantId = tenant._id

    const [tppData, cancData, confirmTimeData, topItemsData, peakWindowData, activeDaysData, onTimeData] =
      await Promise.all([
        // TPP: avg + stddev (solo órdenes con confirmedAt y readyAt)
        Order.aggregate([
          { $match: {
            tenantId,
            'statusTimestamps.confirmedAt': { $ne: null },
            'statusTimestamps.readyAt': { $ne: null },
          }},
          { $project: { tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] } } },
          { $group: { _id: null, avgMs: { $avg: '$tppMs' }, stdMs: { $stdDevPop: '$tppMs' }, count: { $sum: 1 } } }
        ]),
        // Cancelaciones totales
        Order.aggregate([
          { $match: { tenantId } },
          { $group: {
            _id: null,
            total: { $sum: 1 },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
          }}
        ]),
        // Tiempo de confirmación promedio (createdAt → confirmedAt)
        Order.aggregate([
          { $match: { tenantId, 'statusTimestamps.confirmedAt': { $ne: null } } },
          { $project: { ms: { $subtract: ['$statusTimestamps.confirmedAt', '$createdAt'] } } },
          { $group: { _id: null, avgMs: { $avg: '$ms' } } }
        ]),
        // Top 5 platos por cantidad de unidades pedidas
        Order.aggregate([
          { $match: { tenantId, status: { $nin: ['cancelled'] } } },
          { $unwind: '$items' },
          { $group: { _id: '$items.name', count: { $sum: '$items.quantity' } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]),
        // Ventana pico de 30 minutos con mayor concentración de pedidos
        Order.aggregate([
          { $match: { tenantId, status: { $nin: ['cancelled'] } } },
          { $project: {
            window: { $concat: [
              { $toString: { $hour: '$createdAt' } }, ':',
              { $cond: [{ $gte: [{ $minute: '$createdAt' }, 30] }, '30', '00'] }
            ]}
          }},
          { $group: { _id: '$window', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 }
        ]),
        // Días con actividad
        Order.aggregate([
          { $match: { tenantId, status: { $nin: ['cancelled'] } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
          { $count: 'days' }
        ]),
        // % en tiempo usando estimatedReadyAt (pedidos post-deploy)
        Order.aggregate([
          { $match: {
            tenantId,
            'statusTimestamps.readyAt': { $ne: null },
            'statusTimestamps.estimatedReadyAt': { $ne: null },
          }},
          { $project: { isOnTime: { $lte: ['$statusTimestamps.readyAt', '$statusTimestamps.estimatedReadyAt'] } }},
          { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } } } }
        ])
      ])

    const tRaw   = tppData[0]
    const cRaw   = cancData[0]
    const ctRaw  = confirmTimeData[0]
    const oRaw   = onTimeData[0]

    const totalOrders    = cRaw?.total ?? 0
    const activeDays     = activeDaysData[0]?.days ?? 0
    const cancRate       = cRaw && cRaw.total > 0 ? Math.round((cRaw.cancelled / cRaw.total) * 100) : 0
    const tppMinutes     = tRaw ? Math.round(tRaw.avgMs / 60000) : null
    const tppStdMinutes  = tRaw ? Math.round(tRaw.stdMs / 60000) : null
    const confirmMinutes = ctRaw ? Math.round((ctRaw.avgMs / 60000) * 10) / 10 : null
    const onTimePct      = oRaw && oRaw.total > 0 ? Math.round((oRaw.onTime / oRaw.total) * 100) : null

    // Clasificación del TPP
    let tppBenchmark: 'rapido' | 'normal' | 'lento' | null = null
    if (tppMinutes !== null) {
      tppBenchmark = tppMinutes < 15 ? 'rapido' : tppMinutes <= 22 ? 'normal' : 'lento'
    }

    // Top items + concentración del top 3
    const topItems = topItemsData.map((i: any) => ({ name: i._id, count: i.count }))
    const totalUnits = topItems.reduce((s: number, i: any) => s + i.count, 0)
    const top3Units  = topItems.slice(0, 3).reduce((s: number, i: any) => s + i.count, 0)
    const topItemsConcentration = totalUnits > 0 ? Math.round((top3Units / totalUnits) * 100) : null

    // Ventana pico
    const peakWindow = peakWindowData[0]
      ? {
          time: peakWindowData[0]._id,
          count: peakWindowData[0].count,
          pct: totalOrders > 0 ? Math.round((peakWindowData[0].count / totalOrders) * 100) : 0,
        }
      : null

    // Recomendaciones dinámicas basadas en los datos
    const recommendations: string[] = []
    if (tppMinutes !== null && tppMinutes > 22) {
      recommendations.push('Tu tiempo de cocina es lento. Revisá si algún ítem genera demoras o si hay pasos en la preparación que se pueden optimizar.')
    }
    if (tppStdMinutes !== null && tppStdMinutes > 8) {
      recommendations.push('Los tiempos de preparación varían bastante entre pedidos. Esto suele indicar picos de carga o procesos que no están estandarizados.')
    }
    if (peakWindow && peakWindow.pct > 35) {
      recommendations.push(`El ${peakWindow.pct}% de los pedidos se concentra entre las ${peakWindow.time} y las ${peakWindow.time.split(':')[0]}:${peakWindow.time.endsWith('00') ? '30' : '00'}. Ese pico puede generar retrasos si el volumen crece.`)
    }
    if (confirmMinutes !== null && confirmMinutes > 3) {
      recommendations.push('Tardás más de 3 minutos en confirmar pedidos. Responder más rápido mejora la experiencia de retiro del cliente.')
    }
    if (onTimePct !== null && onTimePct < 70) {
      recommendations.push(`Solo el ${onTimePct}% de los pedidos estuvo listo en el tiempo prometido. Considerá ajustar el tiempo estimado de pickup en la configuración.`)
    }
    if (recommendations.length === 0) {
      recommendations.push('Tu operación tiene buenos indicadores. Seguí monitoreando para detectar tendencias a medida que crece el volumen.')
    }

    return NextResponse.json({
      totalOrders,
      activeDays,
      cancRate,
      tppMinutes,
      tppStdMinutes,
      tppBenchmark,
      confirmMinutes,
      onTimePct,
      topItems,
      topItemsConcentration,
      peakWindow,
      recommendations,
    })
  } catch (error) {
    console.error('[TRIAL-REPORT] Error:', error)
    return NextResponse.json({ error: 'Error al generar el informe' }, { status: 500 })
  }
}
