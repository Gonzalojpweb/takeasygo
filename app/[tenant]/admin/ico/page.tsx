import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Types } from 'mongoose'

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
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id
  const now = new Date()
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const start7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)

  const [cancData, tppData, onTimeData, actData7, actData30, activeDaysData] = await Promise.all([
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
  ])

  const cRaw = cancData[0]
  const tRaw = tppData[0]
  const oRaw = onTimeData[0]

  const totalOrders = cRaw?.total ?? 0
  const hasEnoughData = totalOrders >= 10
  const tppN = tRaw?.count ?? 0
  const dataQuality: 'insuficiente' | 'muestra_pequeña' | 'valida' =
    tppN >= 30 ? 'valida' : tppN >= 10 ? 'muestra_pequeña' : 'insuficiente'

  // CLT — Standard Error e intervalo de confianza 95%
  const tppSEMs = tRaw && tppN >= 10 ? tRaw.stdMs / Math.sqrt(tppN) : null
  const tppCI95Low  = tRaw && tppSEMs && tppN >= 30 ? Math.round((tRaw.avgMs - 1.96 * tppSEMs) / 60000 * 10) / 10 : null
  const tppCI95High = tRaw && tppSEMs && tppN >= 30 ? Math.round((tRaw.avgMs + 1.96 * tppSEMs) / 60000 * 10) / 10 : null

  // Componentes
  const consistency    = tRaw && tRaw.avgMs > 0 ? Math.max(0, Math.min(1, 1 - (tRaw.stdMs / tRaw.avgMs))) : null
  const cumplimiento   = oRaw && oRaw.total > 0 ? oRaw.onTime / oRaw.total : null
  const bajaCancelacion = cRaw && cRaw.total > 0 ? Math.max(0, 1 - (cRaw.cancelled / cRaw.total)) : null
  const avgWeekly      = actData30 / 4
  const actividad      = avgWeekly > 0 ? Math.min(1, actData7 / avgWeekly) : actData7 > 0 ? 1 : 0
  const activeDays     = activeDaysData[0]?.days ?? 0
  const estabilidad    = Math.min(1, activeDays / 20)

  // ICO — pesos definitivos
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

  const tppMinutes    = tRaw ? Math.round(tRaw.avgMs / 60000) : null
  const tppStdMinutes = tRaw ? Math.round(tRaw.stdMs / 60000) : null
  const tppSEMinutes  = tppSEMs ? Math.round(tppSEMs / 60000 * 10) / 10 : null
  const cancRate      = cRaw && cRaw.total > 0 ? Math.round((cRaw.cancelled / cRaw.total) * 100) : 0

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
            <p className="text-muted-foreground text-sm mt-1.5 font-medium">Índice de Consistencia Operativa · Uso interno exclusivo · Últimos 30 días</p>
          </div>
        </div>
      </div>

      {/* Sin datos suficientes */}
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

      {/* Score principal */}
      {icoScore !== null && band && (
        <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
              {/* Gauge */}
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

              {/* Advertencia CLT */}
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

      {/* Componentes */}
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

      {/* Detalle TPP + CLT */}
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
