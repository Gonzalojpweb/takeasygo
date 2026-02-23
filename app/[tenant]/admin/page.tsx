import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Clock, CheckCircle, XCircle, TrendingUp, Calendar, ArrowUpRight } from 'lucide-react'
import type { Types } from 'mongoose'
import { cn } from '@/lib/utils'

export default async function AdminDashboard() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const [total, pending, confirmed, cancelled] = await Promise.all([
    Order.countDocuments({ tenantId }),
    Order.countDocuments({ tenantId, status: 'pending' }),
    Order.countDocuments({ tenantId, status: 'confirmed' }),
    Order.countDocuments({ tenantId, status: 'cancelled' }),
  ])

  const recentOrders = await Order.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean()

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
