import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Feedback from '@/models/Feedback'
import ICOSnapshot from '@/models/ICOSnapshot'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingBag, Clock, CheckCircle, XCircle, Calendar,
  ArrowUpRight, Activity, AlertTriangle, Sparkles, ChevronRight,
  TrendingUp, Zap, UtensilsCrossed, Tag, CreditCard,
} from 'lucide-react'
import type { Types } from 'mongoose'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/plans'
import OnboardingChecklist from '@/components/admin/OnboardingChecklist'
import RatingsWidget from '@/components/admin/RatingsWidget'
import LikesWidget from '@/components/admin/LikesWidget'
import Link from 'next/link'

function PlanBanner({ plan, trialOrderCount, tenantSlug }: { plan: Plan; trialOrderCount?: number; tenantSlug: string }) {
  if (plan === 'full' || plan === 'anfitrion') return null

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
            <a href={`/${tenantSlug}/admin/ico`} className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-80 hover:opacity-100">
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
    .lean<{
      _id: Types.ObjectId
      plan: Plan
      branding: { logoUrl: string }
      cachedScores?: { icoScore: number | null; capacityScore: number | null; updatedAt: Date | null }
    }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'
  const tenantId = tenant._id
  const start30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [total, pending, confirmed, cancelled, cancData, recentOrders, trialOrderCount, icoHistory, feedbackErrors] =
    await Promise.all([
      Order.countDocuments({ tenantId }),
      Order.countDocuments({ tenantId, status: 'pending' }),
      Order.countDocuments({ tenantId, status: 'confirmed' }),
      Order.countDocuments({ tenantId, status: 'cancelled' }),
      // Cancelación últimos 30d para alertas
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: start30 } } },
        { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
      ]),
      Order.find({ tenantId }).sort({ createdAt: -1 }).limit(5).lean(),
      plan === 'trial'
        ? Order.countDocuments({ tenantId, status: { $nin: ['cancelled'] } })
        : Promise.resolve(undefined),
      // Últimos 8 snapshots ICO para sparkline
      ICOSnapshot.find({ tenantId }).sort({ date: -1 }).limit(8).lean<
        Array<{ date: Date; icoScore: number }>
      >(),
      // Feedback errors últimas 24h
      Feedback.aggregate([
        { $match: { tenantId, event: 'checkout_error', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$errorType', count: { $sum: 1 } } },
      ]),
    ])

  const icoHistorySorted = [...icoHistory].reverse() // cronológico asc

  // ── Datos reales del ICO desde cachedScores ──────────────────────────────────
  const realIco = tenant.cachedScores?.icoScore ?? null
  const realCapacity = tenant.cachedScores?.capacityScore ?? null

  const cRaw = cancData[0]
  const cancRate30 = cRaw?.total > 0 ? Math.round((cRaw.cancelled / cRaw.total) * 100) : 0
  const orders30 = cRaw?.total ?? 0
  const hasEnoughData = orders30 >= 10

  // ── Alertas operativas ───────────────────────────────────────────────────────
  type Alert = { level: 'error' | 'warn'; text: string; href: string }
  const alerts: Alert[] = []

  const icoHref    = `/${tenantSlug}/admin/ico`
  const ordersHref = `/${tenantSlug}/admin/orders`

  if (hasEnoughData && realIco !== null && realIco < 51)
    alerts.push({ level: 'error', text: `ICO en zona crítica (${realIco}/100). Revisá los componentes para identificar qué mejorar.`, href: icoHref })
  else if (hasEnoughData && realIco !== null && realIco < 76)
    alerts.push({ level: 'warn', text: `ICO en consolidación (${realIco}/100). Hay margen de mejora operativa.`, href: icoHref })

  if (cancRate30 > 20 && orders30 >= 10)
    alerts.push({ level: 'error', text: `Tasa de cancelación alta: ${cancRate30}% en los últimos 30 días.`, href: ordersHref })
  else if (cancRate30 > 10 && orders30 >= 10)
    alerts.push({ level: 'warn', text: `Cancelaciones elevadas: ${cancRate30}% en los últimos 30 días.`, href: ordersHref })

  if (hasEnoughData && realCapacity !== null && realCapacity < 0.5)
    alerts.push({ level: 'warn', text: 'Se detectaron franjas horarias con sobrecarga de capacidad recurrente.', href: icoHref })

  if (hasEnoughData && realIco === null)
    alerts.push({ level: 'warn', text: 'El ICO no se calculó aún. Visitá la página ICO para generar tu índice.', href: icoHref })

  // ── Alertas de feedback (errores en checkout últimas 24h) ────────────────
  const errorLabels: Record<string, string> = {
    pago_rechazado: 'pago rechazado',
    pantalla_trabada: 'pantalla trabada en checkout',
    precio_incorrecto: 'precio incorrecto en checkout',
    metodo_pago_no_encontrado: 'método de pago no encontrado',
    otro: 'otro tipo de error',
  }
  for (const err of (feedbackErrors as Array<{ _id: string; count: number }>) ?? []) {
    if (err.count >= 2) {
      const label = errorLabels[err._id] || err._id
      alerts.push({
        level: 'error',
        text: `⚠️ ${err.count} clientes reportaron "${label}" en las últimas 24h. Revisá el flujo de pago.`,
        href: `/${tenantSlug}/admin/settings`,
      })
    }
  }

  const stats = [
    { label: 'Total pedidos',  value: total,     icon: ShoppingBag, color: 'text-primary'     },
    { label: 'Pendientes',     value: pending,   icon: Clock,       color: 'text-amber-500'   },
    { label: 'Confirmados',    value: confirmed, icon: CheckCircle, color: 'text-primary'      },
    { label: 'Cancelados',     value: cancelled, icon: XCircle,     color: 'text-destructive'  },
  ]

  const STATUS_COLORS: Record<string, string> = {
    pending:   'bg-amber-500/10 text-amber-500 border-amber-500/20',
    confirmed: 'bg-primary/10 text-primary border-primary/20',
    cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
    delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  }

  const icoBand =
    realIco === null     ? null :
    realIco >= 91        ? { label: 'Alta consistencia', color: 'border-emerald-500', text: 'text-emerald-600' } :
    realIco >= 76        ? { label: 'Operación estable',  color: 'border-emerald-400', text: 'text-emerald-500' } :
    realIco >= 51        ? { label: 'En consolidación',   color: 'border-amber-500',   text: 'text-amber-500'   } :
                           { label: 'Ajustes necesarios', color: 'border-destructive', text: 'text-destructive' }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <PlanBanner plan={plan} trialOrderCount={trialOrderCount} tenantSlug={tenantSlug!} />

      <OnboardingChecklist
        tenantId={tenantId}
        tenantSlug={tenantSlug!}
        logoUrl={tenant.branding?.logoUrl ?? ''}
      />

      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-6">
        <div className="relative z-10 max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight">Panel de control</h2>
          <p className="text-slate-400 text-sm mt-1" suppressHydrationWarning>
            Resumen operativo · {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="rounded-2xl border shadow-sm p-5 bg-card hover:shadow-md transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center bg-muted/60')}>
                  <Icon size={16} className={stat.color} />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums">{stat.value}</p>
            </Card>
          )
        })}
      </div>

      {/* Acciones rápidas */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
        <p className="text-sm font-medium text-white/80 mb-3">Acciones de Gestión</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/${tenantSlug}/admin/menu`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <UtensilsCrossed size={16} />
            Gestionar Productos
          </Link>
          <Link href={`/${tenantSlug}/admin/promotions`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <Tag size={16} />
            Ver Upselling
          </Link>
          <Link href={`/${tenantSlug}/admin/billing`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <CreditCard size={16} />
            Control de Caja
          </Link>
        </div>
      </div>

      {/* Alertas operativas */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <Link key={i} href={alert.href}>
              <div className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-opacity hover:opacity-80 cursor-pointer',
                alert.level === 'error'
                  ? 'bg-destructive/5 border-destructive/20 text-destructive'
                  : 'bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400'
              )}>
                <AlertTriangle size={16} className="shrink-0" />
                <span className="flex-1">{alert.text}</span>
                <ChevronRight size={14} className="shrink-0 opacity-50" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ICO */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity size={18} className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">ICO</CardTitle>
              <p className="text-muted-foreground text-xs mt-0.5">Índice de Consistencia Operativa · últimos 30 días</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary bg-primary/5 px-2.5 py-0.5">
              Interno
            </Badge>
            <Link href={icoHref} className="text-xs font-medium text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors">
              Ver detalle <ChevronRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {!hasEnoughData ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertTriangle size={16} className="text-amber-500" />
              <p className="text-sm font-medium">Se necesitan al menos 10 pedidos en los últimos 30 días para calcular el ICO.</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Score gauge */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                {realIco !== null && icoBand ? (
                  <>
                    <div className={cn(
                      'w-20 h-20 rounded-full border-[6px] flex flex-col items-center justify-center',
                      icoBand.color
                    )}>
                      <span className={cn('text-xl font-bold tabular-nums', icoBand.text)}>{realIco}</span>
                      <span className="text-muted-foreground text-[10px] font-semibold">/100</span>
                    </div>
                    <p className={cn('text-[10px] font-semibold uppercase tracking-wide', icoBand.text)}>
                      {icoBand.label}
                    </p>
                  </>
                ) : (
                  <div className="w-20 h-20 rounded-full border-[6px] border-muted flex items-center justify-center text-muted-foreground text-xs font-semibold text-center px-2 leading-tight">
                    Sin datos aún
                  </div>
                )}
              </div>

              {/* Sparkline histórico + métricas */}
              <div className="flex-1 space-y-3">
                {/* Capacidad */}
                {realCapacity !== null && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Zap size={12} />
                        Capacidad operativa
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{Math.round(realCapacity * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          realCapacity >= 0.8 ? 'bg-emerald-500' : realCapacity >= 0.6 ? 'bg-amber-500' : 'bg-destructive'
                        )}
                        style={{ width: `${Math.round(realCapacity * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Sparkline tendencia */}
                {icoHistorySorted.length >= 2 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <TrendingUp size={12} />
                      Tendencia ({icoHistorySorted.length} mediciones)
                    </p>
                    <div className="flex items-end gap-1 h-10">
                      {icoHistorySorted.map((snap, i) => {
                        const pct = snap.icoScore
                        const barColor =
                          pct >= 91 ? 'bg-emerald-500' :
                          pct >= 76 ? 'bg-emerald-400' :
                          pct >= 51 ? 'bg-amber-400' : 'bg-destructive'
                        const isLatest = i === icoHistorySorted.length - 1
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            {isLatest && (
                              <span className="text-[9px] font-semibold tabular-nums text-foreground">{snap.icoScore}</span>
                            )}
                            <div className="w-full flex items-end" style={{ height: 28 }}>
                              <div
                                className={cn('w-full rounded-t', barColor, isLatest ? 'opacity-100' : 'opacity-40')}
                                style={{ height: `${Math.max(6, pct)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                      Última medición: {new Date(icoHistorySorted.at(-1)!.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                )}

                {icoHistorySorted.length < 2 && realIco !== null && (
                  <p className="text-xs text-muted-foreground/60">
                    El historial de tendencia se construye con cada visita al panel ICO. Volvé mañana para ver la evolución.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calificaciones */}
      <RatingsWidget tenantSlug={tenantSlug!} />

      {/* Platos más likeados */}
      <LikesWidget tenantSlug={tenantSlug!} />

      {/* Pedidos recientes */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Pedidos recientes</CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5">Actualización automática en tiempo real</p>
          </div>
          <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary bg-primary/5 px-2.5 py-0.5">
            Live
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="p-16 text-center">
              <div className="bg-muted/40 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-dashed border-border/50">
                <ShoppingBag className="text-muted-foreground" size={22} />
              </div>
              <p className="text-muted-foreground text-sm font-medium">No hay pedidos registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {recentOrders.map((order: any) => (
                <div key={order._id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-muted border border-border/40 flex items-center justify-center font-semibold text-sm text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20 transition-colors">
                      {order.orderNumber.slice(-2)}
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-semibold group-hover:text-primary transition-colors">#{order.orderNumber}</p>
                      <p className="text-muted-foreground text-xs">{order.customer.name}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <p className="text-foreground text-base font-semibold tracking-tight tabular-nums">${order.total.toLocaleString('es-AR')}</p>
                    <Badge variant="outline" className={cn("text-[10px] font-medium uppercase tracking-wide px-2 py-0.5", STATUS_COLORS[order.status] || 'border-border text-muted-foreground')}>
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
