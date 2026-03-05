import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, ShoppingBag, DollarSign, Store, Calendar, Activity, Users, Clock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default async function SuperAdminAnalyticsPage() {
  await connectDB()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const totalTenants = await Tenant.countDocuments({ isActive: true })

  const [
    ordersThisMonth,
    ordersLastMonth,
    topTenants,
    recentOrders,
    activeTenants30,
    globalTppData,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: '$tenantId', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$total' } } },
      { $sort: { totalOrders: -1 } },
      { $limit: 5 }
    ]),
    Order.find({ status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    // Tasa de activación: tenants con ≥1 orden en los últimos 30 días
    Order.aggregate([
      { $match: { createdAt: { $gte: start30 } } },
      { $group: { _id: '$tenantId' } },
      { $count: 'active' }
    ]),
    // TPP global promedio (últimos 30 días, todos los tenants)
    Order.aggregate([
      { $match: {
        createdAt: { $gte: start30 },
        'statusTimestamps.confirmedAt': { $ne: null },
        'statusTimestamps.readyAt': { $ne: null },
      }},
      { $project: { tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] }, tenantId: 1 } },
      { $group: {
        _id: '$tenantId',
        avgMs: { $avg: '$tppMs' },
        stdMs: { $stdDevPop: '$tppMs' },
        count: { $sum: 1 }
      }},
    ]),
  ])

  // Enriquecer topTenants con nombres
  const tenantIds = topTenants.map((t: any) => t._id)
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).lean()
  const tenantMap = Object.fromEntries(tenants.map((t: any) => [t._id.toString(), t]))

  const thisMonth = ordersThisMonth[0] || { total: 0, count: 0 }
  const lastMonth = ordersLastMonth[0] || { total: 0, count: 0 }
  const revenueGrowth = lastMonth.total > 0
    ? (((thisMonth.total - lastMonth.total) / lastMonth.total) * 100).toFixed(1)
    : '0'

  // Tasa de activación
  const activeTenantCount = activeTenants30[0]?.active ?? 0
  const activationRate = totalTenants > 0 ? Math.round((activeTenantCount / totalTenants) * 100) : 0

  // TPP global promedio (media de medias por tenant)
  const globalTppMinutes = globalTppData.length > 0
    ? Math.round(globalTppData.reduce((s: number, t: any) => s + t.avgMs, 0) / globalTppData.length / 60000)
    : null

  // % tenants consistentes: stdDev < 30% de la media (o sin datos TPP)
  const consistentTenants = globalTppData.filter((t: any) => t.avgMs > 0 && t.stdMs / t.avgMs < 0.30).length
  const consistentPct = globalTppData.length > 0
    ? Math.round((consistentTenants / globalTppData.length) * 100)
    : null

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none">Analytics Global</h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <Calendar size={14} className="text-primary" />
          Rendimiento histórico de la plataforma
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card border-2 border-border/60 shadow-lg group hover:border-primary/50 transition-all duration-300 rounded-3xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">Ventas del mes</CardTitle>
            <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary transition-colors">
              <DollarSign size={20} className="text-primary group-hover:text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-foreground text-3xl font-bold tracking-tighter tabular-nums">${thisMonth.total.toLocaleString('es-AR')}</p>
              <div className={cn(
                "flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border",
                Number(revenueGrowth) >= 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
              )}>
                {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}%
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 shadow-lg group hover:border-primary/50 transition-all duration-300 rounded-3xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">Pedidos del mes</CardTitle>
            <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary transition-colors">
              <ShoppingBag size={20} className="text-primary group-hover:text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-3xl font-bold tracking-tighter tabular-nums">{thisMonth.count}</p>
            <p className="text-muted-foreground text-[10px] font-bold mt-1 uppercase tracking-tighter">vs {lastMonth.count} el mes pasado</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 shadow-lg group hover:border-primary/50 transition-all duration-300 rounded-3xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">Ticket promedio</CardTitle>
            <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary transition-colors">
              <TrendingUp size={20} className="text-primary group-hover:text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-3xl font-bold tracking-tighter tabular-nums">
              ${thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count).toLocaleString('es-AR') : 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 shadow-lg group hover:border-primary/50 transition-all duration-300 rounded-3xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">Mes anterior</CardTitle>
            <div className="p-2.5 rounded-xl bg-muted/60 group-hover:bg-primary transition-colors">
              <Store size={20} className="text-muted-foreground group-hover:text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-3xl font-bold tracking-tighter tabular-nums">${lastMonth.total.toLocaleString('es-AR')}</p>
            <p className="text-muted-foreground text-[10px] font-bold mt-1 uppercase tracking-tighter">{lastMonth.count} pedidos totales</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs de ecosistema */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-emerald-500/10 w-fit mb-3">
              <Users size={18} className="text-emerald-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Tasa de activación</p>
            <p className="text-2xl font-black tabular-nums">{activationRate}%</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">{activeTenantCount} de {totalTenants} tenants activos (30d)</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-blue-500/10 w-fit mb-3">
              <Clock size={18} className="text-blue-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">TPP global prom.</p>
            <p className="text-2xl font-black tabular-nums">{globalTppMinutes !== null ? `${globalTppMinutes} min` : '—'}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">{globalTppData.length} tenants con datos</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-purple-500/10 w-fit mb-3">
              <Zap size={18} className="text-purple-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Tenants consistentes</p>
            <p className="text-2xl font-black tabular-nums">{consistentPct !== null ? `${consistentPct}%` : '—'}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">{consistentTenants} con σ/μ &lt; 30%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-amber-500/10 w-fit mb-3">
              <Activity size={18} className="text-amber-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Listos para red</p>
            <p className="text-2xl font-black tabular-nums">{consistentPct !== null ? `${consistentPct}%` : '—'}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">Score operativo alto (Fase 2)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Top tenants */}
        <Card className="bg-card border-2 border-border/60 shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
            <CardTitle className="text-foreground text-xl font-bold">Tenants más activos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topTenants.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">Sin datos todavía</div>
            ) : (
              <div className="divide-y divide-border/40">
                {topTenants.map((item: any, index: number) => {
                  const tenant = tenantMap[item._id?.toString()]
                  return (
                    <div key={item._id} className="flex items-center justify-between p-5 hover:bg-muted/50 transition-all group">
                      <div className="flex items-center gap-4">
                        <span className="text-primary font-bold text-xs w-6">{index + 1}.</span>
                        <div className="h-10 w-10 rounded-xl bg-muted border border-border/50 flex items-center justify-center font-bold text-muted-foreground overflow-hidden group-hover:bg-primary group-hover:text-white transition-all">
                          {tenant?.name?.slice(0, 1).toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-foreground text-sm font-bold group-hover:text-primary transition-colors">{tenant?.name || 'Desconocido'}</p>
                          <p className="text-muted-foreground text-[10px] font-mono font-bold tracking-tighter opacity-60 leading-none">{tenant?.slug}</p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-[10px] font-bold border-primary/40 text-primary bg-primary/5 px-3 py-1 scale-90">
                          {item.totalOrders} pedidos
                        </Badge>
                        <p className="text-foreground text-xs font-bold tabular-nums tracking-tight opacity-80">${item.totalRevenue.toLocaleString('es-AR')}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos pedidos globales */}
        <Card className="bg-card border-2 border-border/60 shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
            <CardTitle className="text-foreground text-xl font-bold">Últimos pedidos globales</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrders.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">Sin pedidos registrados</div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentOrders.map((order: any) => (
                  <div key={order._id} className="flex items-center justify-between p-5 hover:bg-muted/50 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-muted border border-border/50 flex items-center justify-center font-bold text-muted-foreground group-hover:bg-primary group-hover:text-primary transition-all">
                        {order.orderNumber.slice(-2)}
                      </div>
                      <div>
                        <p className="text-foreground text-sm font-bold group-hover:text-primary transition-colors">#{order.orderNumber}</p>
                        <p className="text-muted-foreground text-[10px] font-bold opacity-60 leading-none">{order.customer.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-foreground text-sm font-bold tabular-nums tracking-tight">${order.total.toLocaleString('es-AR')}</p>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest opacity-50 border-0 p-0 h-auto">
                        Realizado
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}