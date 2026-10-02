'use client'

import { useState, useCallback, useEffect } from 'react'
import { toPesos } from '@takeasygo/business/browser'
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
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAdminLocation } from '@/contexts/AdminLocationContext'

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
  locationId: string
  locationName: string
  orderMode?: string
  deliveryAddress?: {
    street: string
    number: string
    apt?: string
    city: string
  }
}

interface PrinterOption {
  _id: string
  name: string
  roles: string[]
  isActive: boolean
}

function roleLabel(role: string): string {
  if (role === 'kitchen') return 'Cocina'
  if (role === 'bar') return 'Barra'
  if (role === 'cashier') return 'Caja'
  return role
}

function roleIcon(role: string): React.ElementType {
  return role === 'cashier' ? ShoppingBag : ChefHat
}

interface HistoryResponse {
  orders: OrderSummary[]
  total: number
  page: number
  pages: number
  locations: LocationRef[]
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  awaiting_confirmation: { label: 'Transferencia', icon: Clock, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
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

export default function OrderHistory({
  tenantSlug,
  locations = [],
  userAssignedLocations = [],
  userRole = '',
}: {
  tenantSlug: string
  locations?: { _id: string; name: string }[]
  userAssignedLocations?: string[]
  userRole?: string
}) {
  const { activeLocationId, locations: contextLocations } = useAdminLocation()
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const isAdmin = userRole === 'admin' || userRole === 'superadmin'
  const availableLocations = (contextLocations.length > 0 ? contextLocations : locations).map(l => ({
    _id: l._id,
    name: l.name,
  }))

  const [page, setPage] = useState(1)
  const [locationId, setLocationId] = useState(activeLocationId ?? '')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')

  // ── Reimpresión con selección de impresora ──────────────────────────────
  const [reprintOrder, setReprintOrder] = useState<OrderSummary | null>(null)
  const [reprintPrinters, setReprintPrinters] = useState<PrinterOption[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  const [selectedPrinterId, setSelectedPrinterId] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const openReprint = async (order: OrderSummary) => {
    if (!order.locationId) {
      toast.error('Este pedido no tiene sede asignada')
      return
    }
    setReprintOrder(order)
    setSelectedPrinterId('')
    setSelectedRole('')
    setReprintPrinters([])
    setPrintersLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/printers?locationId=${order.locationId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const active: PrinterOption[] = (data.printers ?? [])
        .filter((p: PrinterOption) => p.isActive !== false)
        .map((p: PrinterOption) => ({ _id: p._id, name: p.name, roles: p.roles ?? [], isActive: p.isActive }))
      setReprintPrinters(active)
      // Autoseleccionar si hay una sola impresora con un solo tipo de ticket
      if (active.length === 1 && active[0].roles.length === 1) {
        setSelectedPrinterId(active[0]._id)
        setSelectedRole(active[0].roles[0])
      }
    } catch {
      toast.error('No se pudieron cargar las impresoras')
    } finally {
      setPrintersLoading(false)
    }
  }

  const closeReprint = () => {
    if (submitting) return
    setReprintOrder(null)
  }

  const selectPrinter = (printer: PrinterOption) => {
    setSelectedPrinterId(printer._id)
    setSelectedRole(printer.roles.length === 1 ? printer.roles[0] : '')
  }

  const submitReprint = async () => {
    if (!reprintOrder || !selectedPrinterId || !selectedRole || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${reprintOrder._id}/reprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: selectedPrinterId, role: selectedRole }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || 'Error al reimprimir')
        return
      }
      const printerName = reprintPrinters.find(p => p._id === selectedPrinterId)?.name
      toast.success(`Reimprimiendo en ${printerName} (${roleLabel(selectedRole)})...`)
      setReprintOrder(null)
    } catch {
      toast.error('Error al reimprimir')
    } finally {
      setSubmitting(false)
    }
  }

  // Sync with context
  useEffect(() => {
    setLocationId(activeLocationId ?? '')
  }, [activeLocationId])

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
            {isAdmin && <option value="">Todas las sedes</option>}
            {availableLocations.map(l => (
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
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Dirección</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Pago</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && (!data || data.orders.length === 0) && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
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
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">
                        {order.orderMode === 'delivery' && order.deliveryAddress
                          ? `${order.deliveryAddress.street} ${order.deliveryAddress.number}${order.deliveryAddress.apt ? `, ${order.deliveryAddress.apt}` : ''}${order.deliveryAddress.city ? `, ${order.deliveryAddress.city}` : ''}`
                          : '—'}
                      </td>
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
                        ${toPesos(order.total).toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Reimprimir ticket"
                          onClick={() => openReprint(order)}
                        >
                          <Printer size={15} />
                        </Button>
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

      {/* ── Dialog de reimpresión: elegir impresora + tipo de ticket ────── */}
      <Dialog open={!!reprintOrder} onOpenChange={open => !open && closeReprint()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer size={18} />
              Reimprimir pedido #{reprintOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Elegí la impresora y el tipo de ticket para reimprimir. La sede del pedido es{' '}
              <span className="font-medium text-foreground">{reprintOrder?.locationName}</span>.
            </DialogDescription>
          </DialogHeader>

          {printersLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
              Cargando impresoras...
            </div>
          )}

          {!printersLoading && reprintPrinters.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Printer size={28} className="mx-auto mb-2 opacity-30" />
              Esta sede no tiene impresoras activas.
            </div>
          )}

          {!printersLoading && reprintPrinters.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Impresora
              </p>
              <div className="grid gap-2">
                {reprintPrinters.map(printer => {
                  const isSelected = selectedPrinterId === printer._id
                  const SingleRoleIcon =
                    printer.roles.length === 1 ? roleIcon(printer.roles[0]) : ChefHat
                  return (
                    <div
                      key={printer._id}
                      className={`rounded-xl border p-3 transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectPrinter(printer)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            isSelected ? 'border-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                        <span className="text-sm font-medium text-foreground">{printer.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {printer.roles.map(roleLabel).join(' · ')}
                        </span>
                      </button>

                      {isSelected && printer.roles.length > 1 && (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                          <span className="w-full text-xs text-muted-foreground">Tipo de ticket:</span>
                          {printer.roles.map(role => {
                            const RoleTypeIcon = roleIcon(role)
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => setSelectedRole(role)}
                                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  selectedRole === role
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border/60 text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <RoleTypeIcon size={13} />
                                {roleLabel(role)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {isSelected && printer.roles.length === 1 && (
                        <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                          <SingleRoleIcon size={13} />
                          Tipo de ticket: {roleLabel(printer.roles[0])}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeReprint} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={submitReprint}
              disabled={submitting || printersLoading || !selectedPrinterId || !selectedRole}
            >
              {submitting ? (
                <RefreshCw size={15} className="mr-2 animate-spin" />
              ) : (
                <Printer size={15} className="mr-2" />
              )}
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
