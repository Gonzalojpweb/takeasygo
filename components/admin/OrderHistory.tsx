'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  ChefHat,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const inputCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

const selectCls =
  'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

interface LocationRef {
  _id: string
  name: string
}

interface OrderSummary {
  _id: string
  orderNumber: string
  status: string
  total: number
  customer: { name: string; phone: string }
  payment: { status: string; method: string }
  printed: boolean
  createdAt: string
  locationName: string
}

interface HistoryResponse {
  orders: OrderSummary[]
  total: number
  page: number
  pages: number
  locations: LocationRef[]
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending:   { label: 'Pendiente',  icon: Clock,        color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2,  color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  preparing: { label: 'Preparando', icon: ChefHat,       color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  ready:     { label: 'Listo',      icon: CheckCircle2,  color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  delivered: { label: 'Entregado',  icon: Truck,         color: 'bg-primary/10 text-primary border-primary/20' },
  cancelled: { label: 'Cancelado',  icon: XCircle,       color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const PAYMENT_STATUS: Record<string, string> = {
  approved:  'Pagado',
  pending:   'Pendiente',
  rejected:  'Rechazado',
  cancelled: 'Cancelado',
}

export default function OrderHistory({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const [page, setPage] = useState(1)
  const [locationId, setLocationId] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(
    async (p: number, loc: string, st: string, frm: string, t: string, query: string) => {
      setLoading(true)
      try {
        const sp = new URLSearchParams({ page: String(p) })
        if (loc) sp.set('locationId', loc)
        if (st) sp.set('status', st)
        if (frm) sp.set('from', frm)
        if (t) sp.set('to', t)
        if (query) sp.set('q', query)

        const res = await fetch(`/api/${tenantSlug}/orders/history?${sp}`)
        if (!res.ok) throw new Error()
        setData(await res.json())
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    },
    [tenantSlug]
  )

  useEffect(() => {
    load(1, '', '', '', '', '')
  }, [load])

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(1)
    load(1, locationId, status, from, to, q)
  }

  const goPage = (p: number) => {
    setPage(p)
    load(p, locationId, status, from, to, q)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Buscar por número o cliente..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            className={selectCls}
          >
            <option value="">Todas las sedes</option>
            {data?.locations.map(l => (
              <option key={l._id} value={l._id}>{l.name}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className={selectCls}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
              <option key={val} value={val}>{cfg.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex gap-2 flex-1">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
              <input
                type="date"
                className={inputCls}
                value={from}
                onChange={e => setFrom(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
              <input
                type="date"
                className={inputCls}
                value={to}
                onChange={e => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={loading}>
              <Search size={16} className="mr-2" />
              Filtrar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={loading}
              onClick={() => load(page, locationId, status, from, to, q)}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Sede</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Pago</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && (!data || data.orders.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <ShoppingBag size={32} className="mx-auto mb-3 opacity-30" />
                    No se encontraron pedidos con esos filtros.
                  </td>
                </tr>
              )}
              {!loading &&
                data?.orders.map(order => {
                  const st = STATUS_CONFIG[order.status]
                  const Icon = st?.icon ?? Clock
                  return (
                    <tr
                      key={order._id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-foreground font-bold">
                        {order.orderNumber}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground leading-none">{order.customer.name}</p>
                        {order.customer.phone && (
                          <p className="text-xs text-muted-foreground mt-0.5">{order.customer.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{order.locationName}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`flex items-center gap-1 w-fit text-xs px-2 py-0.5 ${st?.color ?? ''}`}
                        >
                          <Icon size={12} />
                          {st?.label ?? order.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs px-2 py-0.5 ${
                            order.payment.status === 'approved'
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          }`}
                        >
                          {PAYMENT_STATUS[order.payment.status] ?? order.payment.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        ${order.total.toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(order.createdAt)}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary + Pagination */}
      {data && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            {data.total} pedido{data.total !== 1 ? 's' : ''} · página {data.page} de {Math.max(1, data.pages)}
          </p>
          {data.pages > 1 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => goPage(page - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pages || loading}
                onClick={() => goPage(page + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
