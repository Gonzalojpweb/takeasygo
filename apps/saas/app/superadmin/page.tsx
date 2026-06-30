import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import User from '@/models/User'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, ShoppingBag, Users, TrendingUp, Calendar, ChevronRight, Badge } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function SuperAdminDashboard() {
  await connectDB()

  const [totalTenants, activeTenants, totalOrders, totalUsers] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ isActive: true }),
    Order.countDocuments(),
    User.countDocuments({ role: { $ne: 'superadmin' } }),
  ])

  const recentTenants = await Tenant.find().sort({ createdAt: -1 }).limit(5).lean()

  const stats = [
    { label: 'Tenants activos', value: activeTenants, total: totalTenants, icon: Store, color: 'text-primary' },
    { label: 'Total pedidos', value: totalOrders, icon: ShoppingBag, color: 'text-primary' },
    { label: 'Usuarios', value: totalUsers, icon: Users, color: 'text-primary' },
  ]

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none">Dashboard Global</h1>
          <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2" suppressHydrationWarning>
            <Calendar size={14} className="text-primary" />
            Resumen general de toda la plataforma al {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map(stat => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="bg-card border-2 border-border/60 shadow-lg hover:shadow-2xl transition-all duration-500 rounded-3xl group relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-150 group-hover:rotate-12 transition-transform duration-700">
                <Icon size={120} />
              </div>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">{stat.label}</CardTitle>
                <div className="p-3 bg-primary/10 rounded-2xl group-hover:bg-primary transition-colors duration-500">
                  <Icon size={20} className="text-primary group-hover:text-white transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-foreground text-5xl font-bold tracking-tighter tabular-nums">{stat.value}</p>
                  <TrendingUp size={20} className="text-primary/70 animate-bounce" />
                </div>
                {stat.total && (
                  <p className="text-muted-foreground text-xs mt-3 font-bold border-t border-border/50 pt-3">
                    <span className="text-primary font-bold">{stat.total}</span> total registrados en sistema
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-card border-2 border-border/60 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-xl font-bold">Tenants recientes</CardTitle>
            <Link href="/superadmin/tenants">
              <Button variant="ghost" size="sm" className="text-primary font-bold uppercase tracking-widest text-[10px] hover:bg-primary/10 rounded-full">
                Ver todos <ChevronRight size={14} className="ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/40">
            {recentTenants.map((tenant: any) => (
              <div key={tenant._id} className="flex items-center justify-between p-6 hover:bg-muted/50 transition-all group">
                <div className="flex items-center gap-5">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-lg group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    {tenant.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-foreground text-base font-bold group-hover:text-primary transition-colors">{tenant.name}</p>
                    <p className="text-muted-foreground text-xs font-mono font-bold mt-1">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <Badge className={cn(
                      "font-bold text-[10px] tracking-widest px-3 py-1 rounded-full border-2",
                      tenant.plan === 'FULL' ? "bg-primary/10 text-primary border-primary/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    )}>
                      {tenant.plan}
                    </Badge>
                    <p className="text-muted-foreground text-[10px] font-bold opacity-60">{new Date(tenant.createdAt).toLocaleDateString('es-AR')}</p>
                  </div>
                  <div className={cn(
                    "w-3 h-3 rounded-full ring-4 shadow-[0_0_10px_rgba(0,0,0,0.1)]",
                    tenant.isActive ? "bg-emerald-500 ring-emerald-500/20" : "bg-destructive ring-destructive/20"
                  )} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
