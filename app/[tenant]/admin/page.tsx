import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Clock, CheckCircle, XCircle, Calendar, ArrowUpRight, Activity, AlertTriangle, Sparkles, ChevronRight } from 'lucide-react'
import type { Types } from 'mongoose'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/plans'

function PlanBanner({ plan, trialOrderCount }: { plan: Plan; trialOrderCount?: number }) {
  if (plan === 'full') return null

  if (plan === 'trial') {
    const count = trialOrderCount ?? 0
    const isReady = count >= 30
    return (
      <div className={cn(
        'flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium',
        PLAN_COLORS.trial
      )}>
        <Sparkles size={16} className="shrink-0" />
        {isReady ? (
          <>
            <span className="flex-1">🎉 Procesaste 30 pedidos. Tu Informe ICO de Contexto está listo.</span>
            <a href="./ico" className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-80 hover:opacity-100">
              Ver Informe <ChevronRight size={12} />
            </a>
          </>
        ) : (
          <>
            <span className="flex-1">Trial activo — {count} de 30 pedidos para tu Informe ICO.</span>
            <span className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-60">
              {30 - count} restantes
            </span>
          </>
        )}
      </div>
    )
  }

  const messages: Record<'try' | 'buy', { text: string; cta: string }> = {
    try: {
      text: `Estás en el plan ${PLAN_LABELS.try}. Accedé a reportes, múltiples sedes y más.`,
      cta: 'Ver planes',
    },
    buy: {
      text: `Estás en el plan ${PLAN_LABELS.buy}. Desbloqueá analytics avanzados e ICO completo con Premium.`,
      cta: 'Saber más',
    },
  }

  const msg = messages[plan as 'try' | 'buy']

  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium',
      PLAN_COLORS[plan]
    )}>
      <Sparkles size={16} className="shrink-0" />
      <span className="flex-1">{msg.text}</span>
      <span className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-80 hover:opacity-100 cursor-pointer">
        {msg.cta} <ChevronRight size={12} />
      </span>
    </div>
  )
}

export default async function AdminDashboard() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan: Plan }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  const tenantId = tenant._id

  const start30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [total, pending, confirmed, cancelled, cancData, tppData] = await Promise.all([
    Order.countDocuments({ tenantId }),
    Order.countDocuments({ tenantId, status: 'pending' }),
    Order.countDocuments({ tenantId, status: 'confirmed' }),
    Order.countDocuments({ tenantId, status: 'cancelled' }),
    // Cancelación últimos 30 días para Score
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 } } },
      { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }
    ]),
    // TPP últimos 30 días para Score
    Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: start30 }, 'statusTimestamps.confirmedAt': { $ne: null }, 'statusTimestamps.readyAt': { $ne: null } } },
      { $project: { tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] } } },
      { $group: { _id: null, avgMs: { $avg: '$tppMs' }, stdMs: { $stdDevPop: '$tppMs' }, count: { $sum: 1 } } }
    ]),
  ])

  const [recentOrders, trialOrderCount] = await Promise.all([
    Order.find({ tenantId }).sort({ createdAt: -1 }).limit(5).lean(),
    plan === 'trial'
      ? Order.countDocuments({ tenantId, status: { $nin: ['cancelled'] } })
      : Promise.resolve(undefined),
  ])

  // Score Operativo simplificado para el dashboard
  const cRaw = cancData[0]
  const tRaw = tppData[0]
  const hasScore = (cRaw?.total ?? 0) >= 10
  const bajaCancelacion = cRaw?.total > 0 ? Math.max(0, 1 - (cRaw.cancelled / cRaw.total)) : null
  const consistency = tRaw?.avgMs > 0 ? Math.max(0, Math.min(1, 1 - (tRaw.stdMs / tRaw.avgMs))) : null
  const scoreEstimate = hasScore
    ? Math.round(((consistency ?? 0.5) * 0.25 + 0.5 * 0.30 + (bajaCancelacion ?? 1) * 0.20 + 0.15 + 0.10) * 100)
    : null

  const stats = [
    { label: 'Total pedidos', value: total, icon: ShoppingBag, color: 'text-primary' },
    { label: 'Pendientes', value: pending, icon: Clock, color: 'text-amber-500' },
    { label: 'Confirmados', value: confirmed, icon: CheckCircle, color: 'text-primary' },
    { label: 'Cancelados', value: cancelled, icon: XCircle, color: 'text-destructive' },
  ]

  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    confirmed: 'bg-primary/10 text-primary border-primary/20',
    cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
    delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <PlanBanner plan={plan} trialOrderCount={trialOrderCount} />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none">Restaurante</h1>
          <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2" suppressHydrationWarning>
            <Calendar size={14} className="text-primary" />
            Panel de control administrativo - {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="bg-card border-2 border-border/60 shadow-lg hover:shadow-2xl transition-all duration-500 group rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-150 group-hover:rotate-12 transition-transform duration-700 pointer-events-none">
                <Icon size={120} />
              </div>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">{stat.label}</CardTitle>
                <div className={cn("p-2.5 rounded-xl bg-muted/50 group-hover:bg-primary transition-colors duration-500", stat.color.replace('text-', 'text-opacity-70 '))}>
                  <Icon size={20} className={cn("transition-colors duration-500", stat.color, "group-hover:text-white")} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-foreground text-4xl font-bold tracking-tighter tabular-nums">{stat.value}</p>
                  <ArrowUpRight size={18} className="text-primary/70 animate-pulse group-hover:scale-125 transition-transform" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Score Operativo */}
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/30 p-6 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Activity size={20} className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-foreground text-base font-bold">ICO</CardTitle>
              <p className="text-muted-foreground text-xs mt-0.5 font-medium">Índice de Consistencia Operativa — últimos 30 días</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-[0.2em] border-primary/40 text-primary bg-primary/5 px-3 py-1">
            Interno
          </Badge>
        </CardHeader>
        <CardContent className="p-6">
          {!hasScore ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertTriangle size={16} className="text-amber-500" />
              <p className="text-sm font-medium">Se necesitan al menos 10 pedidos en los últimos 30 días para calcular el ICO.</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Gauge visual */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  "w-24 h-24 rounded-full border-8 flex items-center justify-center text-2xl font-black tabular-nums",
                  (scoreEstimate ?? 0) >= 80 ? "border-emerald-500 text-emerald-500" :
                  (scoreEstimate ?? 0) >= 60 ? "border-amber-500 text-amber-500" : "border-destructive text-destructive"
                )}>
                  {scoreEstimate}
                </div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mt-2">/ 100</p>
              </div>
              {/* Detalle */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                <ScoreBar label="Consistencia" value={consistency !== null ? Math.round(consistency * 100) : null} tip="Desvío estándar del TPP" />
                <ScoreBar label="Baja cancelación" value={bajaCancelacion !== null ? Math.round(bajaCancelacion * 100) : null} tip="1 - tasa de cancelación" />
                <ScoreBar label="TPP registrado" value={tRaw?.count > 0 ? Math.min(100, Math.round((tRaw.count / (cRaw?.total || 1)) * 100)) : null} tip={tRaw ? `${Math.round(tRaw.avgMs / 60000)} min promedio` : 'Sin datos de timestamps'} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card className="bg-card border-2 border-border/60 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/30 p-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-xl font-bold">Pedidos recientes</CardTitle>
            <p className="text-muted-foreground text-xs mt-1 font-bold">Actualización automática en tiempo real</p>
          </div>
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-[0.2em] border-primary/40 text-primary bg-primary/5 px-3 py-1">
            Live
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="p-20 text-center">
              <div className="bg-muted/30 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-border/60 transition-transform">
                <ShoppingBag className="text-muted-foreground" size={24} />
              </div>
              <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">No hay pedidos registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentOrders.map((order: any) => (
                <div key={order._id} className="flex items-center justify-between p-6 hover:bg-muted/50 transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-muted border border-border/50 flex items-center justify-center font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20 transition-all duration-300">
                      {order.orderNumber.slice(-2)}
                    </div>
                    <div>
                      <p className="text-foreground text-base font-bold group-hover:text-primary transition-colors">#{order.orderNumber}</p>
                      <p className="text-muted-foreground text-xs font-bold">{order.customer.name}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="text-foreground text-lg font-bold tracking-tight tabular-nums">${order.total.toLocaleString('es-AR')}</p>
                    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-widest px-3 py-1 border-2", STATUS_COLORS[order.status] || 'border-border text-muted-foreground')}>
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ScoreBar({ label, value, tip }: { label: string; value: number | null; tip: string }) {
  const pct = value ?? 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">{label}</p>
        <p className="text-xs font-black tabular-nums">{value !== null ? `${value}%` : '—'}</p>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-destructive"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 font-medium">{tip}</p>
    </div>
  )
}
