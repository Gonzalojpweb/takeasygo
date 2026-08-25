'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'

interface PedidosActivosProps {
  items: Array<{
    tenantId: string
    name: string
    slug: string
    plan: string
    isOpen: boolean
    isOperational: boolean
    activeOrders: Array<{
      orderId: string
      orderNumber: number
      status: string
      createdAt: string
      minutesInStatus: number
      estimatedReadyAt?: string
      isStuck: boolean
      stuckReason?: string
    }>
    statusCounts: Record<string, number>
    needsAttention: boolean
    attentionReasons: string[]
  }>
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'pendiente',
  confirmed: 'confirmado',
  preparing: 'preparando',
  ready: 'listo',
  en_ruta: 'en ruta',
  arrived: 'llegó',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  confirmed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  preparing: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  ready: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  en_ruta: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  arrived: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
}

export default function PedidosActivos({ items }: PedidosActivosProps) {
  if (items.length === 0) {
    return (
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
        <CardHeader className="p-4 md:p-6 pb-2">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Pedidos Activos</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <p className="text-sm text-muted-foreground py-6 text-center">No hay pedidos activos en este momento</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">
            Pedidos Activos
          </CardTitle>
          <Badge variant="secondary" className="text-xs font-bold">
            {items.reduce((sum, t) => sum + t.activeOrders.length, 0)} pedidos
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(tenant => (
            <Link
              key={tenant.tenantId}
              href={`/${tenant.slug}/admin/orders`}
              className={cn(
                'block rounded-xl border p-4 transition-all hover:shadow-md',
                tenant.needsAttention
                  ? 'border-amber-400/40 bg-amber-500/5'
                  : 'border-border/60 bg-background hover:border-primary/30'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {tenant.needsAttention ? (
                    <AlertTriangle size={14} className="text-amber-500" />
                  ) : (
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  )}
                  <span className="text-sm font-bold text-foreground truncate">{tenant.name}</span>
                </div>
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  tenant.isOpen ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                )} />
              </div>

              {/* Status line */}
              <div className="flex items-center gap-2 mb-3">
                <span className={cn(
                  'text-xs font-medium',
                  tenant.needsAttention ? 'text-amber-600' : tenant.isOpen ? 'text-emerald-600' : 'text-muted-foreground'
                )}>
                  {tenant.needsAttention ? 'Requiere atención' : tenant.isOpen ? 'Operando' : 'Cerrado'}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground">
                  {tenant.activeOrders.length} activo{tenant.activeOrders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Status breakdown */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Object.entries(tenant.statusCounts).map(([status, count]) => (
                  <Badge
                    key={status}
                    variant="outline"
                    className={cn('text-[10px] font-bold px-1.5 py-0', STATUS_COLORS[status])}
                  >
                    {count} {STATUS_LABELS[status] || status}
                  </Badge>
                ))}
              </div>

              {/* Attention reasons */}
              {tenant.needsAttention && (
                <div className="mt-2 pt-2 border-t border-amber-400/20">
                  {tenant.attentionReasons.slice(0, 2).map((reason, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-amber-600">
                      <Clock size={10} />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
