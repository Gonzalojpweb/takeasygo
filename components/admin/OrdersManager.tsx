'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    ShoppingBag, User, Phone, MapPin,
    Calendar, Clock, DollarSign, StickyNote,
    ChevronRight, Search, Filter
} from 'lucide-react'
import OrderStatusButton from './OrderStatusButton'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface Props {
    orders: any[]
    locationMap: Record<string, string>
    tenantSlug: string
    trialOrderCount?: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
    confirmed: { label: 'Confirmado', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: CheckCircle },
    preparing: { label: 'Preparando', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: Loader2 },
    ready: { label: 'Listo', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle2 },
    delivered: { label: 'Entregado', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', icon: ShoppingBag },
    cancelled: { label: 'Cancelado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
}

// Fallback icons if not imported
import { CheckCircle, Loader2, CheckCircle2, XCircle } from 'lucide-react'

export default function OrdersManager({ orders, locationMap, tenantSlug, trialOrderCount }: Props) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredOrders = orders.filter(order =>
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Trial milestone banner */}
            {trialOrderCount !== undefined && trialOrderCount >= 30 && (
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-violet-500/5 border-2 border-violet-500/20">
                    <span className="text-2xl shrink-0">🎉</span>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground">¡Ya tenemos suficiente información para analizar tu operación!</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Procesaste {trialOrderCount} pedidos. Tu Informe ICO de Contexto está listo.</p>
                    </div>
                    <a href="./ico" className="shrink-0 h-9 px-4 rounded-xl bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-600 transition-all flex items-center">
                        Generar Informe →
                    </a>
                </div>
            )}

            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por número o cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-muted/50 border-2 border-border/60 focus:border-primary/40 focus:bg-white rounded-2xl pl-12 pr-4 py-3 outline-none transition-all font-medium text-sm"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-4 py-1.5 border-2 border-primary/20 bg-primary/5 text-primary text-[10px] font-bold uppercase tracking-widest">
                        {filteredOrders.length} Pedidos
                    </Badge>
                </div>
            </div>

            <AnimatePresence mode="popLayout">
                {filteredOrders.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                    >
                        <Card className="border-2 border-dashed border-border/60 bg-muted/10 rounded-3xl">
                            <CardContent className="py-24 text-center">
                                <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-6">
                                    <ShoppingBag className="text-muted-foreground" size={32} />
                                </div>
                                <p className="text-foreground text-lg font-bold">No se encontraron pedidos</p>
                                <p className="text-muted-foreground text-sm mt-1">Prueba con otro término de búsqueda.</p>
                            </CardContent>
                        </Card>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {filteredOrders.map((order: any, index: number) => {
                            const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
                            const StatusIcon = status.icon

                            return (
                                <motion.div
                                    key={order._id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <Card className="bg-card border-2 border-border/60 hover:border-primary/30 shadow-md hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden group">
                                        <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-border/40">
                                            {/* Left Side: Summary & Items */}
                                            <div className="flex-1 p-8">
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shadow-inner">
                                                            {order.orderNumber.slice(-2)}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="text-xl font-bold tracking-tight text-foreground">#{order.orderNumber}</h3>
                                                                <Badge className={cn("px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border-2", status.color)}>
                                                                    {status.label}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-muted-foreground text-xs font-medium flex items-center gap-1.5 mt-1" suppressHydrationWarning>
                                                                <Calendar size={12} /> {new Date(order.createdAt).toLocaleDateString('es-AR')}
                                                                <span className="opacity-30">•</span>
                                                                <Clock size={12} /> {new Date(order.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                                                    <div className="space-y-4">
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                                                                <User size={14} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60 leading-none mb-1">Cliente</p>
                                                                <p className="text-sm font-bold text-foreground leading-tight">{order.customer.name}</p>
                                                                {order.customer.phone && (
                                                                    <p className="text-xs text-muted-foreground font-medium mt-1 inline-flex items-center gap-1">
                                                                        <Phone size={10} /> {order.customer.phone}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                                                                <MapPin size={14} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60 leading-none mb-1">Ubicación</p>
                                                                <p className="text-sm font-bold text-foreground leading-tight">
                                                                    {locationMap[order.locationId?.toString()] || 'Sede desconocida'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-muted/30 rounded-3xl p-5 border border-border/40">
                                                        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60 mb-3 block">Detalle del pedido</p>
                                                        <div className="space-y-2">
                                                            {order.items.map((item: any) => (
                                                                <div key={item._id} className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs font-bold text-foreground flex items-center gap-2">
                                                                            <span className="text-primary font-black text-[10px] tabular-nums">{item.quantity}x</span>
                                                                            <span className="truncate">{item.name}</span>
                                                                        </p>
                                                                        {item.customizations?.length > 0 && (
                                                                            <p className="text-[10px] text-muted-foreground pl-6 italic">
                                                                                {item.customizations.map((c: any) => c.name).join(', ')}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs font-bold tabular-nums text-foreground/70">${item.subtotal.toLocaleString('es-AR')}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {order.notes && (
                                                    <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl mt-4">
                                                        <StickyNote size={16} className="text-primary shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest text-primary/80 mb-1">Notas del cliente</p>
                                                            <p className="text-sm font-medium text-foreground italic">{order.notes}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Side: Total & Actions */}
                                            <div className="bg-muted/10 p-8 flex flex-col justify-between items-center lg:items-end lg:w-72 lg:shrink-0 gap-6">
                                                <div className="text-center lg:text-right w-full">
                                                    <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-2">Total</p>
                                                    <p className="text-4xl font-black tracking-tighter text-foreground tabular-nums flex items-start justify-center lg:justify-end gap-1">
                                                        <span className="text-sm font-bold opacity-30 mt-1">$</span>
                                                        {order.total.toLocaleString('es-AR')}
                                                    </p>
                                                </div>

                                                <div className="w-full space-y-3">
                                                    <OrderStatusButton
                                                        orderId={order._id.toString()}
                                                        currentStatus={order.status}
                                                        tenantSlug={tenantSlug || ''}
                                                    />
                                                    <p className="text-[10px] text-muted-foreground/40 text-center lg:text-right font-bold uppercase tracking-widest mt-4">
                                                        TakeAway — ID: {order._id.toString().slice(-6)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
