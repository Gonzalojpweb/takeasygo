'use client'

import { useState, useEffect } from 'react'
import { Search, ShoppingBag, Building2, Clock, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { fmt } from '@/lib/utils'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  awaiting_payment: { label: 'Esperando pago', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  pending: { label: 'Pendiente', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  confirmed: { label: 'Confirmado', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  preparing: { label: 'Preparando', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  ready: { label: 'Listo', className: 'bg-primary/10 text-primary border-primary/20' },
  delivered: { label: 'Entregado', className: 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20' },
  cancelled: { label: 'Cancelado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash_mp: 'Contado MP',
  deferred: 'Diferido',
  mixed: 'Mixto',
}

interface Order {
  _id: string
  orderNumber: string
  status: string
  total: number
  paymentModeSnapshot: string | null
  companyName: string
  corporateAccountId: string | null
  customer: { name: string }
  items: any[]
  createdAt: string
}

interface Props {
  tenantSlug: string
}

export default function BusinessOrdersClient({ tenantSlug }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams()
        if (statusFilter) params.set('status', statusFilter)
        const res = await fetch(`/api/${tenantSlug}/business/orders?${params}`)
        const data = await res.json()
        setOrders(data.orders || [])
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tenantSlug, statusFilter])

  const filtered = search
    ? orders.filter(o =>
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.companyName.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.name.toLowerCase().includes(search.toLowerCase())
      )
    : orders

  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Buscar por nro de orden, empresa o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={cn(inputCls, "pl-10")}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={cn(inputCls, "max-w-[180px]")}
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmado</option>
          <option value="preparing">Preparando</option>
          <option value="ready">Listo</option>
          <option value="delivered">Entregado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center mb-4">
            <ShoppingBag size={28} className="text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground font-medium">No hay órdenes corporativas</p>
          <p className="text-sm text-muted-foreground/50 mt-1">Las órdenes aparecerán aquí cuando los clientes business realicen pedidos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order._id} className="p-5 bg-card border-2 border-border/60 rounded-[2rem] shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <ShoppingBag size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">#{order.orderNumber}</span>
                      <Badge className={cn('text-[10px] font-bold px-2 py-0.5 border', STATUS_LABELS[order.status]?.className)}>
                        {STATUS_LABELS[order.status]?.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 size={12} /> {order.companyName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {new Date(order.createdAt).toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black">${fmt(order.total)}</p>
                  {order.paymentModeSnapshot && (
                    <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 justify-end mt-0.5">
                      <CreditCard size={10} /> {PAYMENT_MODE_LABELS[order.paymentModeSnapshot] || order.paymentModeSnapshot}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{order.customer.name}</span> &middot; {order.items.length} ítem(s)
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
