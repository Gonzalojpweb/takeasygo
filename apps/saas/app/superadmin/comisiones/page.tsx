'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign, Calendar, Search, CheckCircle2, Clock,
  Building2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function getDefaultDates() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

function fmt(n: number) {
  return toPesos(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', colors[status])}>
      {status === 'paid' ? 'Pagado' : status}
    </Badge>
  )
}

interface TenantResult {
  tenantId: string
  name: string
  slug: string
  total: number
  pending: number
  settled: number
  breakdown: { transfer: number; mercadopago: number; kripton: number }
  settledAmount: number
}

interface Settlement {
  _id: string
  tenantId: string
  from: string
  to: string
  amountCollected: number
  collectedAt: string
  collectedBy: string
  notes: string
  status: string
}

interface TenantInfo {
  _id: string
  name: string
  slug: string
}

interface ApiResponse {
  tenantResults: TenantResult[]
  settlements: Settlement[]
  tenants: TenantInfo[]
  summary: { grandTotal: number; grandSettled: number; grandPending: number }
  error?: string
}

export default function SuperAdminComisionesPage() {
  const defaults = getDefaultDates()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchComisiones() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ from, to })
        const res = await fetch(`/api/superadmin/comisiones?${params}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error al cargar comisiones')
        setData(json)
      } catch (err: any) {
        setError(err.message || 'Error al cargar comisiones')
      } finally {
        setLoading(false)
      }
    }
    fetchComisiones()
  }, [from, to])

  const tenantResults = data?.tenantResults || []
  const settlements = data?.settlements || []
  const tenants = data?.tenants || []
  const grandTotal = data?.summary.grandTotal || 0
  const grandSettled = data?.summary.grandSettled || 0
  const grandPending = data?.summary.grandPending || 0

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Comisiones por Tenant</h1>
        <Card className="rounded-2xl border shadow-sm p-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => setFrom(from)}>
            Reintentar
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comisiones por Tenant</h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Acumulado de comisión de plataforma (MP split + transferencia) pendiente de cobro
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted-foreground" />
            <Input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-36 h-9 text-sm"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-36 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── Global Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Comisión Total</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign size={16} className="text-primary" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums">${fmt(grandTotal)}</p>
        </Card>
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Saldado</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums">${fmt(grandSettled)}</p>
        </Card>
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pendiente de Cobro</span>
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Clock size={16} className="text-destructive" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums text-destructive">${fmt(grandPending)}</p>
        </Card>
      </div>

      {/* ── Tenants Table ── */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Comisiones por Comercio</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-medium">
              {tenantResults.length} comercios
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Comercio</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Total Comisión</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Saldado</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 text-destructive">Pendiente</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">MP Split</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Transfer</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Kripton</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {tenantResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Building2 size={32} className="opacity-30" />
                        <p className="text-sm font-medium">No hay comercios con comisiones en este período</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  tenantResults.map((tenant, i) => (
                    <tr key={tenant.tenantId} className={cn('transition-colors hover:bg-muted/40', i % 2 === 0 ? 'bg-white' : 'bg-muted/20')}>
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <p className="text-sm font-semibold text-foreground">{tenant.name}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{tenant.slug}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(tenant.total)}</td>
                      <td className="px-5 py-4 text-right font-medium text-emerald-600">${fmt(tenant.settled)}</td>
                      <td className="px-5 py-4 text-right font-black tabular-nums text-destructive">${fmt(tenant.pending)}</td>
                      <td className="px-5 py-4 text-right font-medium text-primary">${fmt(tenant.breakdown.mercadopago)}</td>
                      <td className="px-5 py-4 text-right font-medium text-amber-500">${fmt(tenant.breakdown.transfer)}</td>
                      <td className="px-5 py-4 text-right font-medium text-purple-500">${fmt(tenant.breakdown.kripton)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <StatusBadge status="paid" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              alert(`Ver detalle de saldos para ${tenant.name}`)
                            }}
                          >
                            <Search size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Settlements History ── */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Historial de Saldos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Período</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Comercio</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Monto</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Cobrado por</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Fecha</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Clock size={32} className="opacity-30" />
                        <p className="text-sm font-medium">No hay saldos registrados en este período</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  settlements
                    .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())
                    .map((s) => {
                      const tenant = tenants.find((t) => t._id === s.tenantId)
                      return (
                        <tr key={s._id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-5 py-4 text-sm font-medium">
                            {format(new Date(s.from), 'dd/MM/yyyy', { locale: es })} –{' '}
                            {format(new Date(s.to), 'dd/MM/yyyy', { locale: es })}
                          </td>
                          <td className="px-5 py-4 text-sm font-medium">{tenant?.name || s.tenantId}</td>
                          <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(s.amountCollected)}</td>
                          <td className="px-5 py-4 text-sm">{s.collectedBy}</td>
                          <td className="px-5 py-4 text-sm text-muted-foreground">
                            {format(new Date(s.collectedAt), 'dd/MM/yyyy HH:mm', { locale: es })}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={s.status} />
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
