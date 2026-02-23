'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DollarSign, ShoppingBag, TrendingUp, Users,
    ChevronUp, ChevronDown, Package, History,
    ArrowUpRight, ArrowDownRight, Award
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    stats: {
        revenue: number
        orders: number
        avgTicket: number
        growth: string
        lastMonthRevenue: number
        lastMonthOrders: number
    }
    topItems: any[]
    recentOrders: any[]
}

export default function ReportsDashboard({ stats, topItems, recentOrders }: Props) {
    const isPositive = Number(stats.growth) >= 0

    return (
        <div className="space-y-10 pb-10">
            {/* Primary Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Ventas del Mes"
                    value={`$${stats.revenue.toLocaleString('es-AR')}`}
                    desc={`${isPositive ? '+' : ''}${stats.growth}% vs mes anterior`}
                    icon={<DollarSign size={20} />}
                    trend={isPositive ? 'up' : 'down'}
                    color="bg-primary/10 text-primary"
                    index={0}
                />
                <StatCard
                    title="Pedidos Totales"
                    value={stats.orders.toString()}
                    desc={`${stats.lastMonthOrders} el mes pasado`}
                    icon={<ShoppingBag size={20} />}
                    color="bg-blue-500/10 text-blue-500"
                    index={1}
                />
                <StatCard
                    title="Ticket Promedio"
                    value={`$${stats.avgTicket.toLocaleString('es-AR')}`}
                    desc="Basado en pedidos confirmados"
                    icon={<TrendingUp size={20} />}
                    color="bg-amber-500/10 text-amber-500"
                    index={2}
                />
                <StatCard
                    title="Mes Anterior"
                    value={`$${stats.lastMonthRevenue.toLocaleString('es-AR')}`}
                    desc={`${stats.lastMonthOrders} pedidos`}
                    icon={<History size={20} />}
                    color="bg-purple-500/10 text-purple-500"
                    index={3}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
                {/* Top Product Rankings */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden h-full">
                        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                    <Award size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold tracking-tight">Items más Vendidos</CardTitle>
                                    <p className="text-xs text-muted-foreground font-medium">Top 5 productos con mayor rotación</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8">
                            {topItems.length === 0 ? (
                                <div className="py-20 text-center opacity-50">
                                    <Package className="mx-auto mb-4 text-muted-foreground" size={40} />
                                    <p className="font-bold">Sin datos de ventas</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {topItems.map((item: any, index: number) => (
                                        <div key={item._id} className="flex items-center justify-between group transition-all">
                                            <div className="flex items-center gap-5">
                                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-sm font-black text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground group-hover:translate-x-1 transition-transform">{item._id}</p>
                                                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                                                        ID: {item._id.slice(0, 8)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-black tracking-tighter text-foreground tabular-nums">{item.total}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground/70">${item.revenue.toLocaleString('es-AR')}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Recent Activity Feed */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
                        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                    <History size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold tracking-tight">Actividad Reciente</CardTitle>
                                    <p className="text-xs text-muted-foreground font-medium">Últimas 10 órdenes procesadas</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="space-y-6">
                                {recentOrders.map((order: any) => (
                                    <div key={order._id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0 pb-4 last:pb-0">
                                        <div>
                                            <p className="text-sm font-bold text-foreground">#{order.orderNumber}</p>
                                            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                <Users size={10} /> {order.customer.name}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black tabular-nums text-foreground">${order.total.toLocaleString('es-AR')}</p>
                                            <p className="text-[10px] font-bold text-primary/70 uppercase tracking-tighter">Completado</p>
                                        </div>
                                    </div>
                                ))}
                                {recentOrders.length === 0 && (
                                    <p className="text-center text-muted-foreground text-sm py-10">No hay pedidos recientes</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    )
}

function StatCard({ title, value, desc, icon, trend, color, index }: any) {
    const IconComponent = icon.type
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
        >
            <Card className="bg-card border-2 border-border/60 shadow-lg hover:shadow-2xl hover:border-primary/30 transition-all duration-500 rounded-[2rem] overflow-hidden group relative">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-150 group-hover:rotate-12 transition-transform duration-700 pointer-events-none">
                    {icon}
                </div>
                <CardContent className="p-7">
                    <div className="flex items-center justify-between mb-5">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center group-hover:bg-primary transition-all duration-500 shadow-sm", color)}>
                            <div className="group-hover:text-white transition-colors">
                                {icon}
                            </div>
                        </div>
                        {trend && (
                            <div className={cn(
                                "flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border-2",
                                trend === 'up' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                            )}>
                                {trend === 'up' ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />}
                                {trend === 'up' ? 'Creciendo' : 'Bajando'}
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-1">{title}</p>
                        <h3 className="text-3xl font-black tracking-tighter text-foreground tabular-nums mb-1">{value}</h3>
                        <p className="text-xs font-bold text-muted-foreground/70">{desc}</p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
