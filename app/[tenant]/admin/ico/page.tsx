import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, AlertTriangle, CheckCircle, Info, Lock, TrendingUp, Clock, XCircle, RefreshCw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Types } from 'mongoose'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, canAccess, requiredPlanFor } from '@/lib/plans'
import TrialIcoReport from '@/components/admin/TrialIcoReport'

// Bandas diagnósticas ICO
function getBand(score: number): { label: string; color: string; ring: string; text: string } {
  if (score >= 91) return { label: 'Alta consistencia operativa', color: 'border-emerald-600', ring: 'shadow-emerald-500/30', text: 'text-emerald-600' }
  if (score >= 76) return { label: 'Operación estable',           color: 'border-emerald-500', ring: 'shadow-emerald-400/20', text: 'text-emerald-500' }
  if (score >= 51) return { label: 'En consolidación',            color: 'border-amber-500',   ring: 'shadow-amber-400/20',  text: 'text-amber-500'   }
  return              { label: 'Ajustes necesarios',              color: 'border-destructive', ring: 'shadow-red-400/20',    text: 'text-destructive' }
}

export default async function ICOPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan: Plan }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  // ── plan 'trial': vista especial — progreso o informe de contexto ────────────
  if (plan === 'trial') {
    const trialOrderCount = await Order.countDocuments({
      tenantId: tenant._id,
      status: { $nin: ['cancelled'] },
    })

    if (trialOrderCount < 30) {
      const remaining = 30 - trialOrderCount
      const pct = Math.round((trialOrderCount / 30) * 100)
      const sections = [
        { label: 'Resumen operativo', desc: 'Pedidos totales, días activos y cancelaciones' },
        { label: 'Velocidad de cocina', desc: 'Tiempo promedio y clasificación de tu operación' },
        { label: 'Consistencia', desc: 'Variabilidad de los tiempos de preparación' },
        { label: 'Cuello de botella', desc: 'Franjas horarias con mayor concentración de pedidos' },
        { label: 'Platos más pedidos', desc: 'Top 5 ítems y concentración del menú' },
        { label: 'Recomendaciones', desc: 'Sugerencias automáticas basadas en tus datos' },
      ]
      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
          <div>
            <h1 className="text-foreground text-4xl font-bold tracking-tight">Informe ICO</h1>
            <p className="text-muted-foreground mt-2 font-medium">Tu informe de contexto operativo se genera al llegar a 30 pedidos.</p>
          </div>

          {/* Barra de progreso */}
          <div className="rounded-[2rem] border-2 border-violet-500/20 bg-violet-500/5 p-8">
            <div className="flex items-center justify-between mb-3">
              <p className="font-black text-sm text-foreground">{trialOrderCount} de 30 pedidos procesados</p>
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-100 px-3 py-1 rounded-full">
                Faltan {remaining}
              </span>
            </div>
            <div className="h-3 rounded-full bg-violet-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              En un restaurante activo esto ocurre en 2–4 días. Cada pedido suma señal estadística real.
            </p>
          </div>

          {/* Secciones bloqueadas del informe */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Tu informe incluirá</p>
            {sections.map((s, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-border/60 bg-card">
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Lock size={14} className="text-muted-foreground/50" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // ≥30 pedidos: calcular y mostrar el informe de contexto
    const [tppD, cancD, confirmD, topItemsD, peakD, activeDaysD, onTimeD] = await Promise.all([
      Order.aggregate([
        { $match: { tenantId: tenant._id, 'statusTimestamps.confirmedAt': { $ne: null }, 'statusTimestamps.readyAt': { $ne: null } } },
        { $project: { tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$tppMs' }, stdMs: { $stdDevPop: '$tppMs' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { tenantId: tenant._id } },
        { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }
      ]),
      Order.aggregate([
        { $match: { tenantId: tenant._id, 'statusTimestamps.confirmedAt': { $ne: null } } },
        { $project: { ms: { $subtract: ['$statusTimestamps.confirmedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$ms' } } }
      ]),
      Order.aggregate([
        { $match: { tenantId: tenant._id, status: { $nin: ['cancelled'] } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', count: { $sum: '$items.quantity' } } },
        { $sort: { count: -1 } }, { $limit: 5 }
      ]),
      Order.aggregate([
        { $match: { tenantId: tenant._id, status: { $nin: ['cancelled'] } } },
        { $project: { window: { $concat: [{ $toString: { $hour: '$createdAt' } }, ':', { $cond: [{ $gte: [{ $minute: '$createdAt' }, 30] }, '30', '00'] }] } } },
        { $group: { _id: '$window', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 1 }
      ]),
      Order.aggregate([
        { $match: { tenantId: tenant._id, status: { $nin: ['cancelled'] } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
        { $count: 'days' }
      ]),
      Order.aggregate([
        { $match: { tenantId: tenant._id, 'statusTimestamps.readyAt': { $ne: null }, 'statusTimestamps.estimatedReadyAt': { $ne: null } } },
        { $project: { isOnTime: { $lte: ['$statusTimestamps.readyAt', '$statusTimestamps.estimatedReadyAt'] } } },
        { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } } } }
      ]),
    ])

    const tR = tppD[0], cR = cancD[0], ctR = confirmD[0], oR = onTimeD[0]
    const totalOrders   = cR?.total ?? 0
    const activeDays    = activeDaysD[0]?.days ?? 0
    const cancRate      = cR && cR.total > 0 ? Math.round((cR.cancelled / cR.total) * 100) : 0
    const tppMinutes    = tR ? Math.round(tR.avgMs / 60000) : null
    const tppStdMin     = tR ? Math.round(tR.stdMs / 60000) : null
    const confirmMin    = ctR ? Math.round((ctR.avgMs / 60000) * 10) / 10 : null
    const onTimePct     = oR && oR.total > 0 ? Math.round((oR.onTime / oR.total) * 100) : null
    const tppBenchmark  = tppMinutes === null ? null : tppMinutes < 15 ? 'rapido' : tppMinutes <= 22 ? 'normal' : 'lento'
    const topItems      = topItemsD.map((i: any) => ({ name: i._id, count: i.count }))
    const totalUnits    = topItems.reduce((s: number, i: any) => s + i.count, 0)
    const top3Units     = topItems.slice(0, 3).reduce((s: number, i: any) => s + i.count, 0)
    const topConc       = totalUnits > 0 ? Math.round((top3Units / totalUnits) * 100) : null
    const peakWindow    = peakD[0] ? { time: peakD[0]._id, count: peakD[0].count, pct: totalOrders > 0 ? Math.round((peakD[0].count / totalOrders) * 100) : 0 } : null
    const recommendations: string[] = []
    if (tppMinutes !== null && tppMinutes > 22) recommendations.push('Tu tiempo de cocina es lento. Revisá si algún ítem genera demoras.')
    if (tppStdMin !== null && tppStdMin > 8) recommendations.push('Los tiempos varían bastante. Puede indicar picos o procesos no estandarizados.')
    if (peakWindow && peakWindow.pct > 35) recommendations.push(`El ${peakWindow.pct}% de los pedidos se concentra en las ${peakWindow.time}hs. Ese pico puede generar retrasos.`)
    if (confirmMin !== null && confirmMin > 3) recommendations.push('Tardás más de 3 min en confirmar pedidos. Responder rápido mejora la experiencia de retiro.')
    if (onTimePct !== null && onTimePct < 70) recommendations.push(`Solo el ${onTimePct}% de los pedidos estuvo listo a tiempo. Considerá ajustar el tiempo estimado.`)
    if (recommendations.length === 0) recommendations.push('Tu operación tiene buenos indicadores. Seguí monitoreando a medida que crece el volumen.')

    return (
      <TrialIcoReport
        data={{ totalOrders, activeDays, cancRate, tppMinutes, tppStdMinutes: tppStdMin, tppBenchmark, confirmMinutes: confirmMin, onTimePct, topItems, topItemsConcentration: topConc, peakWindow, recommendations }}
        tenantSlug={tenantSlug ?? ''}
      />
    )
  }

  // try/buy/full = locked si no tiene acceso
  if (!canAccess(plan, 'ico')) {
    const required = requiredPlanFor('ico')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">ICO — Fiabilidad Operativa</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad está disponible en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[required]}</span>.
            Contactá al soporte para actualizar tu plan.
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  const tenantId = tenant._id
  const now = new Date()
  const start30  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const start7   = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)
  const start90  = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [cancData, tppData, onTimeData, actData7, actData30, activeDaysData, recompraData, recompraBreakdownData] = await Promise.all([
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 } } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
      }}
    ]),
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
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: false } },
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
    Order.countDocuments({ tenantId, createdAt: { $gte: start7 }, status: { $ne: 'cancelled' } }),
    Order.countDocuments({ tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } }),
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
      { $count: 'days' }
    ]),
    // Tasa de recompra — últimos 90 días, agrupado por teléfono
    Order.aggregate([
      { $match: { tenantId, 'customer.phone': { $ne: '' }, createdAt: { $gte: start90 } } },
      { $group: { _id: '$customer.phone', count: { $sum: 1 } } },
      { $group: {
        _id: null,
        totalClients: { $sum: 1 },
        recurring: { $sum: { $cond: [{ $gt: ['$count', 1] }, 1, 0] } },
      }},
    ]),
    // Breakdown de frecuencia: clientes con 1, 2, 3+ pedidos
    Order.aggregate([
      { $match: { tenantId, 'customer.phone': { $ne: '' }, createdAt: { $gte: start90 } } },
      { $group: { _id: '$customer.phone', count: { $sum: 1 } } },
      { $bucket: {
        groupBy: '$count',
        boundaries: [1, 2, 3, 99999],
        default: 'other',
        output: { clients: { $sum: 1 } },
      }},
    ]),
  ])

  const cRaw = cancData[0]
  const tRaw = tppData[0]
  const oRaw = onTimeData[0]

  const totalOrders = cRaw?.total ?? 0
  const hasEnoughData = totalOrders >= 10
  const tppN = tRaw?.count ?? 0
  const dataQuality: 'insuficiente' | 'muestra_pequeña' | 'valida' =
    tppN >= 30 ? 'valida' : tppN >= 10 ? 'muestra_pequeña' : 'insuficiente'

  const consistency    = tRaw && tRaw.avgMs > 0 ? Math.max(0, Math.min(1, 1 - (tRaw.stdMs / tRaw.avgMs))) : null
  const cumplimiento   = oRaw && oRaw.total > 0 ? oRaw.onTime / oRaw.total : null
  const bajaCancelacion = cRaw && cRaw.total > 0 ? Math.max(0, 1 - (cRaw.cancelled / cRaw.total)) : null
  const avgWeekly      = actData30 / 4
  const actividad      = avgWeekly > 0 ? Math.min(1, actData7 / avgWeekly) : actData7 > 0 ? 1 : 0
  const activeDays     = activeDaysData[0]?.days ?? 0
  const estabilidad    = Math.min(1, activeDays / 20)

  let icoScore: number | null = null
  if (hasEnoughData) {
    const c1 = consistency    ?? 0.5
    const c2 = cumplimiento   ?? 0.5
    const c3 = bajaCancelacion ?? 1
    const c4 = actividad
    const c5 = estabilidad
    icoScore = Math.round((c1 * 0.25 + c2 * 0.30 + c3 * 0.20 + c4 * 0.15 + c5 * 0.10) * 100)
  }

  const band = icoScore !== null ? getBand(icoScore) : null
  const cancRate = cRaw && cRaw.total > 0 ? Math.round((cRaw.cancelled / cRaw.total) * 100) : 0

  // Recompra (solo se usa en full plan)
  const recompraRaw = recompraData[0] ?? { totalClients: 0, recurring: 0 }
  const recompraPct = recompraRaw.totalClients > 0
    ? Math.round((recompraRaw.recurring / recompraRaw.totalClients) * 100)
    : null
  const breakdownMap = Object.fromEntries(
    (recompraBreakdownData as any[]).map((b: any) => [b._id, b.clients])
  )
  const recompraBreakdown = recompraRaw.totalClients > 0
    ? { once: (breakdownMap[1] ?? 0) as number, twice: (breakdownMap[2] ?? 0) as number, thrice: (breakdownMap[3] ?? 0) as number }
    : null

  // ── buy plan: Fiabilidad Operativa (simplified view) ────────────────────────
  if (plan === 'buy') {
    // Auto suggestions based on weakest components
    const suggestions: { icon: typeof TrendingUp; text: string }[] = []
    if (cancRate > 15)
      suggestions.push({ icon: XCircle, text: 'Tenés una tasa de cancelación elevada. Revisá los motivos más frecuentes.' })
    if (consistency !== null && consistency < 0.6)
      suggestions.push({ icon: Clock, text: 'Tu tiempo de preparación varía mucho entre pedidos. Considerá estandarizar los procesos de cocina.' })
    if (cumplimiento !== null && cumplimiento < 0.7)
      suggestions.push({ icon: AlertTriangle, text: 'Muchos pedidos no están listos en el tiempo prometido. Considerá ajustar el tiempo estimado de retiro.' })
    if (actividad < 0.8)
      suggestions.push({ icon: TrendingUp, text: 'La actividad de la última semana está por debajo de tu promedio mensual. Revisá si hay factores que afectan la demanda.' })

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Activity size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none">Fiabilidad Operativa</h1>
              <p className="text-muted-foreground text-sm mt-1.5 font-medium">Qué tan consistente es tu operación en los últimos 30 días</p>
            </div>
          </div>
        </div>

        {!hasEnoughData ? (
          <Card className="bg-card border-2 border-amber-500/30 rounded-3xl">
            <CardContent className="p-6 flex items-start gap-4">
              <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-foreground font-bold">Datos insuficientes</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Se necesitan al menos <strong>10 pedidos</strong> en los últimos 30 días. Actualmente hay <strong>{totalOrders}</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : icoScore !== null && band ? (
          <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
            <CardContent className="p-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className={cn(
                    'w-36 h-36 rounded-full border-[10px] flex flex-col items-center justify-center shadow-2xl',
                    band.color, band.ring
                  )}>
                    <span className={cn('text-5xl font-black tabular-nums leading-none', band.text)}>{icoScore}</span>
                    <span className="text-muted-foreground text-xs font-bold tracking-widest mt-1">/ 100</span>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.15em] px-3 py-1 border-2', band.color, band.text)}>
                    {band.label}
                  </Badge>
                </div>
                <div className="flex-1">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Este score refleja la consistencia y fiabilidad de tu operación basado en {totalOrders} pedidos del período.
                  </p>
                  {suggestions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {suggestions.slice(0, 3).map((s, i) => {
                        const Icon = s.icon
                        return (
                          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <Icon size={14} className="text-primary mt-0.5 shrink-0" />
                            <span>{s.text}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-primary/20 bg-primary/5 text-sm text-muted-foreground">
          <Activity size={16} className="text-primary shrink-0" />
          <span>Actualizá al plan <strong className="text-foreground">{PLAN_LABELS.full}</strong> para ver el diagnóstico completo con todos los factores, estadísticas de TPP y análisis de distribución.</span>
        </div>
      </div>
    )
  }

  // ── full plan: ICO avanzado (current view) ───────────────────────────────────
  const tppSEMs = tRaw && tppN >= 10 ? tRaw.stdMs / Math.sqrt(tppN) : null
  const tppCI95Low  = tRaw && tppSEMs && tppN >= 30 ? Math.round((tRaw.avgMs - 1.96 * tppSEMs) / 60000 * 10) / 10 : null
  const tppCI95High = tRaw && tppSEMs && tppN >= 30 ? Math.round((tRaw.avgMs + 1.96 * tppSEMs) / 60000 * 10) / 10 : null
  const tppMinutes    = tRaw ? Math.round(tRaw.avgMs / 60000) : null
  const tppStdMinutes = tRaw ? Math.round(tRaw.stdMs / 60000) : null
  const tppSEMinutes  = tppSEMs ? Math.round(tppSEMs / 60000 * 10) / 10 : null

  const componentsData = [
    { label: 'Consistencia del TPP',       weight: '×0.25', value: consistency    !== null ? Math.round(consistency * 100)    : null, tip: 'Inverso del coeficiente de variación (σ/μ)' },
    { label: 'Cumplimiento de tiempos',    weight: '×0.30', value: cumplimiento   !== null ? Math.round(cumplimiento * 100)   : null, tip: '% de pedidos entregados dentro del tiempo estimado' },
    { label: 'Baja tasa de cancelación',   weight: '×0.20', value: bajaCancelacion !== null ? Math.round(bajaCancelacion * 100) : null, tip: `${cancRate}% de cancelaciones en 30 días` },
    { label: 'Actividad sostenida',        weight: '×0.15', value: Math.round(actividad * 100),   tip: 'Órdenes últimos 7 días vs promedio semanal del mes' },
    { label: 'Estabilidad horaria',        weight: '×0.10', value: Math.round(estabilidad * 100), tip: `${activeDays} días activos en los últimos 30` },
  ]

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Activity size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none">ICO</h1>
            <p className="text-muted-foreground text-sm mt-1.5 font-medium">Índice de Consistencia Operativa · Últimos 30 días</p>
          </div>
        </div>
      </div>

      {!hasEnoughData && (
        <Card className="bg-card border-2 border-amber-500/30 rounded-3xl">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-foreground font-bold">Datos insuficientes para calcular el ICO</p>
              <p className="text-muted-foreground text-sm mt-1">
                Se necesitan al menos <strong>10 pedidos</strong> en los últimos 30 días. Actualmente hay <strong>{totalOrders}</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {icoScore !== null && band && (
        <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className={cn(
                  'w-36 h-36 rounded-full border-[10px] flex flex-col items-center justify-center shadow-2xl',
                  band.color, band.ring
                )}>
                  <span className={cn('text-5xl font-black tabular-nums leading-none', band.text)}>{icoScore}</span>
                  <span className="text-muted-foreground text-xs font-bold tracking-widest mt-1">/ 100</span>
                </div>
                <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.15em] px-3 py-1 border-2', band.color, band.text)}>
                  {band.label}
                </Badge>
              </div>

              <div className="flex-1 space-y-4">
                {dataQuality === 'muestra_pequeña' && (
                  <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                    <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                      Muestra pequeña (n={tppN}). El ICO es indicativo. Aumentará la precisión con más pedidos registrados (n≥30 para aplicar el Teorema del Límite Central).
                    </p>
                  </div>
                )}
                {dataQuality === 'valida' && (
                  <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                    <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                      Muestra válida (n={tppN} ≥ 30). El Teorema del Límite Central aplica: la media del TPP sigue distribución normal.
                    </p>
                  </div>
                )}

                <p className="text-muted-foreground text-sm leading-relaxed">
                  No es una calificación pública ni un ranking.<br />
                  Es un diagnóstico interno de estabilidad operativa basado en {totalOrders} pedidos del período.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasEnoughData && (
        <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
            <CardTitle className="text-foreground text-base font-bold">Componentes del ICO</CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5 font-medium">Los 5 factores que conforman el índice</p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-5">
              {componentsData.map((c) => (
                <ICOBar key={c.label} label={c.label} weight={c.weight} value={c.value} tip={c.tip} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tRaw && (
        <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
            <CardTitle className="text-foreground text-base font-bold">Detalle TPP — Tiempo Promedio de Preparación</CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5 font-medium">Estadísticas del proceso de preparación</p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              <StatCell label="μ (Media)" value={tppMinutes !== null ? `${tppMinutes} min` : '—'} sub="Tiempo promedio de preparación" />
              <StatCell label="σ (Desvío estándar)" value={tppStdMinutes !== null ? `${tppStdMinutes} min` : '—'} sub="Variabilidad del proceso" />
              <StatCell label="n (Muestra)" value={`${tppN} pedidos`} sub={dataQuality === 'valida' ? 'CLT válido' : dataQuality === 'muestra_pequeña' ? 'Muestra pequeña' : 'Insuficiente'} highlight={dataQuality} />
              {tppSEMinutes !== null && (
                <StatCell label="SE (Error estándar)" value={`±${tppSEMinutes} min`} sub="σ / √n" />
              )}
              {tppCI95Low !== null && tppCI95High !== null && (
                <StatCell label="IC 95%" value={`${tppCI95Low}–${tppCI95High} min`} sub="μ ± 1.96 × SE" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recompra y frecuencia de clientes ── */}
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <RefreshCw size={18} className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-foreground text-base font-bold">Recompra y frecuencia de clientes</CardTitle>
              <p className="text-muted-foreground text-xs mt-0.5 font-medium">Clientes únicos identificados por teléfono — últimos 90 días</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {recompraRaw.totalClients === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <p className="text-sm">Sin suficientes datos aún. Se necesitan pedidos con teléfono de cliente registrado en los últimos 90 días.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Métricas principales */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Tasa de recompra</p>
                  <p className={cn('text-3xl font-black tabular-nums',
                    recompraPct === null ? 'text-muted-foreground' :
                    recompraPct >= 40 ? 'text-emerald-500' :
                    recompraPct >= 20 ? 'text-amber-500' : 'text-foreground'
                  )}>
                    {recompraPct !== null ? `${recompraPct}%` : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 font-medium">Clientes con más de 1 pedido</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Clientes únicos</p>
                  <p className="text-3xl font-black tabular-nums text-foreground">{recompraRaw.totalClients}</p>
                  <p className="text-[10px] text-muted-foreground/60 font-medium">En los últimos 90 días</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Clientes recurrentes</p>
                  <p className="text-3xl font-black tabular-nums text-foreground">{recompraRaw.recurring}</p>
                  <p className="text-[10px] text-muted-foreground/60 font-medium">Con 2 o más pedidos</p>
                </div>
              </div>

              {/* Distribución de frecuencia */}
              {recompraBreakdown && (
                <div className="pt-4 border-t border-border/40 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={14} className="text-primary" />
                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Distribución de frecuencia</p>
                  </div>
                  {[
                    { label: '1 compra', count: recompraBreakdown.once,   color: 'bg-primary/20' },
                    { label: '2 compras', count: recompraBreakdown.twice,  color: 'bg-primary/50' },
                    { label: '3+ compras', count: recompraBreakdown.thrice, color: 'bg-primary' },
                  ].map(({ label, count, color }) => {
                    const pct = recompraRaw.totalClients > 0 ? Math.round((count / recompraRaw.totalClients) * 100) : 0
                    return (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{label}</span>
                          <span className="font-black tabular-nums text-muted-foreground">{count} clientes · {pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ICOBar({ label, weight, value, tip }: { label: string; weight: string; value: number | null; tip: string }) {
  const pct = value ?? 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{label}</p>
          <span className="text-[10px] font-black text-primary/70 uppercase tracking-wider shrink-0">{weight}</span>
        </div>
        <p className="text-sm font-black tabular-nums shrink-0">{value !== null ? `${value}%` : '—'}</p>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-destructive'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 font-medium">{tip}</p>
    </div>
  )
}

function StatCell({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: string }) {
  const color = highlight === 'valida'
    ? 'text-emerald-500'
    : highlight === 'muestra_pequeña'
    ? 'text-amber-500'
    : highlight === 'insuficiente'
    ? 'text-destructive'
    : 'text-foreground'

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">{label}</p>
      <p className={cn('text-xl font-black tabular-nums', color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground/60 font-medium">{sub}</p>
    </div>
  )
}
