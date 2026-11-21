'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { ORDER_MODE_LABEL, PAYMENT_STATE_INFO, methodInfo, money, type PaymentState } from './payment-labels'

// ============================================================================
// Pedidos activos de la APP (20/11/2026)
// ============================================================================
// Solo pedidos que nacen en la app/SaaS: las ventas del POS van en «Salones».
// Cada pedido muestra cuánto se pagó, por dónde y si ya está cobrado, para no
// tener que entrar al comercio a mirarlo.
// ============================================================================

export interface ActiveOrderRow {
  orderId: string
  orderNumber: number | string
  status: string
  createdAt: string
  minutesInStatus: number
  estimatedReadyAt?: string
  isStuck: boolean
  stuckReason?: string
  totalCents?: number
  deliveryCents?: number
  orderMode?: string | null
  paymentMethod?: string | null
  paymentState?: PaymentState
  commissionCents?: number
}

interface PedidosActivosProps {
  items: Array<{
    tenantId: string
    name: string
    slug: string
    plan: string
    isOpen: boolean
    isOperational: boolean
    activeOrders: ActiveOrderRow[]
    statusCounts: Record<string, number>
    needsAttention: boolean
    attentionReasons: string[]
  }>
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'esperando pago',
  awaiting_confirmation: 'por confirmar',
  pending: 'pendiente',
  confirmed: 'confirmado',
  preparing: 'preparando',
  ready: 'listo',
  en_ruta: 'en ruta',
  arrived: 'llegó',
}

const STATUS_COLORS: Record<string, string> = {
  awaiting_payment: 'bg-red-500/10 text-red-600 border-red-500/20',
  awaiting_confirmation: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  confirmed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  preparing: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  ready: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  en_ruta: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  arrived: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
}

function OrderPaymentRow({ order }: { order: ActiveOrderRow }) {
  const method = methodInfo(order.paymentMethod)
  const state = order.paymentState ? PAYMENT_STATE_INFO[order.paymentState] : null
  return (
    <li className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-bold text-foreground">#{order.orderNumber}</span>
        <span className="shrink-0 whitespace-nowrap text-sm font-black tabular-nums text-foreground">{money(order.totalCents ?? 0)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${method.color}1a`, color: method.color }}>
          {method.emoji} {method.label}
        </span>
        {state && (
          <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', state.className)}>{state.label}</span>
        )}
        {order.orderMode && ORDER_MODE_LABEL[order.orderMode] && (
          <span className="text-[10px] text-muted-foreground">{ORDER_MODE_LABEL[order.orderMode]}</span>
        )}
        <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px] font-bold', STATUS_COLORS[order.status])}>
          {STATUS_LABELS[order.status] || order.status}
        </Badge>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground tabular-nums">
        {(order.deliveryCents ?? 0) > 0 && <span>envío {money(order.deliveryCents!)}</span>}
        {(order.commissionCents ?? 0) > 0 && <span>comisión TGO {money(order.commissionCents!)}</span>}
        {order.isStuck && order.stuckReason && <span className="font-semibold text-amber-600">⏱ {order.stuckReason}</span>}
      </div>
    </li>
  )
}

export default function PedidosActivos({ items }: PedidosActivosProps) {
  const allOrders = items.flatMap((t) => t.activeOrders)
  const paidCents = allOrders.filter((o) => o.paymentState === 'paid').reduce((s, o) => s + (o.totalCents ?? 0), 0)
  const cashCents = allOrders.filter((o) => o.paymentState === 'cash').reduce((s, o) => s + (o.totalCents ?? 0), 0)
  const waitingCents = allOrders
    .filter((o) => o.paymentState === 'awaiting' || o.paymentState === 'transfer_pending')
    .reduce((s, o) => s + (o.totalCents ?? 0), 0)

  if (items.length === 0) {
    return (
      <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
        <CardHeader className="p-4 md:p-6 pb-2">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Pedidos activos de la app</CardTitle>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">
            Pedidos activos de la app
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <Badge variant="secondary" className="text-xs font-bold">{allOrders.length} pedidos</Badge>
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700">Pagado {money(paidCents)}</span>
            {cashCents > 0 && <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700">Efectivo al entregar {money(cashCents)}</span>}
            {waitingCents > 0 && <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-700">Sin cobrar {money(waitingCents)}</span>}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Solo pedidos que entran por la app. Las ventas del POS están en «Salones (POS)».</p>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(tenant => (
            <div
              key={tenant.tenantId}
              className={cn(
                'rounded-xl border p-3 transition-all',
                tenant.needsAttention ? 'border-amber-400/40 bg-amber-500/5' : 'border-border/60 bg-background'
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {tenant.needsAttention ? (
                    <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                  )}
                  <span className="truncate text-sm font-bold text-foreground" title={tenant.name}>{tenant.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{tenant.activeOrders.length}</span>
                </div>
                <Link
                  href={`/${tenant.slug}/admin/orders`}
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  Abrir <ExternalLink size={11} />
                </Link>
              </div>

              {/* Muchos pedidos: la tarjeta no crece sin fin, la lista scrollea */}
              <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
                {tenant.activeOrders.map((order) => (
                  <OrderPaymentRow key={order.orderId} order={order} />
                ))}
              </ul>

              {tenant.needsAttention && tenant.attentionReasons.length > 0 && (
                <div className="mt-2 border-t border-amber-400/20 pt-2">
                  {tenant.attentionReasons.slice(0, 2).map((reason, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-amber-600">
                      <Clock size={10} />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
