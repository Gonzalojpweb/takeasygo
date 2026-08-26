'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign, Calendar, Search, CheckCircle2, Clock,
  Building2, Loader2, AlertTriangle, FileText, CreditCard,
  ArrowRightLeft, Info,
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

const STATEMENT_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  pagado: { label: 'Pagado', className: 'bg-green-100 text-green-700' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-700' },
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

interface FailedClose {
  tenantId: string
  name: string
  slug: string
  orderCount: number
  estimatedCommission: number
}

interface WeeklyStatement {
  _id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  weekStart: string
  weekEnd: string
  amount: number
  status: 'pendiente' | 'pagado' | 'vencido'
  closedAt: string
  paidAt: string | null
  paidBy: string | null
  orderCount: number
}

export default function SuperAdminComisionesPage() {
  const defaults = getDefaultDates()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [failedCloses, setFailedCloses] = useState<FailedClose[]>([])
  const [loadingFailed, setLoadingFailed] = useState(true)

  const [weeklyStatements, setWeeklyStatements] = useState<WeeklyStatement[]>([])
  const [loadingStatements, setLoadingStatements] = useState(true)
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)

  const [globalData, setGlobalData] = useState<any>(null)
  const [loadingGlobal, setLoadingGlobal] = useState(true)

  useEffect(() => {
    async function fetchGlobal() {
      try {
        const res = await fetch('/api/superadmin/dashboard/comisiones')
        const json = await res.json()
        if (res.ok) setGlobalData(json)
      } catch {} finally {
        setLoadingGlobal(false)
      }
    }
    fetchGlobal()
  }, [])

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

  useEffect(() => {
    async function fetchFailedCloses() {
      try {
        setLoadingFailed(true)
        const res = await fetch('/api/superadmin/commissions/failed-closes')
        const json = await res.json()
        if (res.ok) setFailedCloses(json.failedCloses || [])
      } catch {
        // silent
      } finally {
        setLoadingFailed(false)
      }
    }
    fetchFailedCloses()
  }, [])

  useEffect(() => {
    async function fetchWeeklyStatements() {
      try {
        setLoadingStatements(true)
        const res = await fetch('/api/superadmin/commissions/weekly-statements')
        const json = await res.json()
        if (res.ok) setWeeklyStatements(json.statements || [])
      } catch {
        // silent
      } finally {
        setLoadingStatements(false)
      }
    }
    fetchWeeklyStatements()
  }, [])

  async function handleMarkAsPaid(statementId: string, tenantName: string) {
    if (!confirm(`¿Confirmar pago de comisiones para ${tenantName}?`)) return
    try {
      setMarkingPaid(statementId)
      // Buscar el statement para obtener fechas
      const stmt = weeklyStatements.find(s => s._id === statementId)
      if (!stmt) return

      const res = await fetch('/api/superadmin/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: stmt.tenantId,
          from: stmt.weekStart,
          to: stmt.weekEnd,
          statementId,
          notes: `Pago semanal ${stmt.weekStart} — ${stmt.weekEnd}`,
        }),
      })
      if (res.ok) {
        setWeeklyStatements(prev =>
          prev.map(s => s._id === statementId ? { ...s, status: 'pagado' as const, paidAt: new Date().toISOString() } : s)
        )
        setFailedCloses(prev => prev.filter(f => f.tenantId !== stmt.tenantId))
      }
    } catch {
      // silent
    } finally {
      setMarkingPaid(null)
    }
  }

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
      {/* ── Global Summary (from dashboard API) ── */}
      {globalData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Transfer Pendiente */}
            <Card className="rounded-2xl border border-amber-200 bg-amber-50/50 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Transfer (Pendiente)</span>
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <ArrowRightLeft size={14} className="text-amber-600" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight tabular-nums text-amber-800">${fmt(globalData.transfer?.pending || 0)}</p>
              {globalData.transfer?.overdue > 0 && (
                <p className="text-[10px] text-red-600 font-medium mt-1 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  ${fmt(globalData.transfer.overdue)} vencido(s)
                </p>
              )}
            </Card>

            {/* MP Auto-split */}
            <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">MP Auto-split</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight tabular-nums text-emerald-800">${fmt(globalData.mercadopago?.autoSplit || 0)}</p>
              <p className="text-[10px] text-emerald-600 font-medium mt-1">Ya cobrado vía split</p>
            </Card>

            {/* MP Sin Split */}
            <Card className="rounded-2xl border border-amber-200 bg-amber-50/50 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">MP Sin Split</span>
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <CreditCard size={14} className="text-amber-600" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight tabular-nums text-amber-800">${fmt(globalData.mercadopago?.noSplit || 0)}</p>
              <p className="text-[10px] text-amber-600 font-medium mt-1">Cobro manual pendiente</p>
            </Card>

            {/* Total Pendiente */}
            <Card className="rounded-2xl border border-red-200 bg-red-50/50 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Total Pendiente</span>
                <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                  <DollarSign size={14} className="text-red-600" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight tabular-nums text-red-800">${fmt(globalData.combined?.grandPending || 0)}</p>
              <p className="text-[10px] text-red-600 font-medium mt-1">Transfer + MP sin split</p>
            </Card>
          </div>

          {/* MP note */}
          <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            <Info size={11} className="shrink-0 mt-0.5" />
            <span>{globalData.mercadopago?.note || 'Auto-split: cobrado vía MP split. Sin split: pendiente de cobro manual.'}</span>
          </div>
        </div>
      )}

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

      {/* ── Failed Closes Alert Banner ── */}
      {!loadingFailed && failedCloses.length > 0 && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">
                Cierres semanales fallidos detectados
              </p>
              <p className="text-xs text-red-600 mt-1">
                {failedCloses.length} comercio(s) tuvieron órdenes transfer la semana pasada pero el cierre no se ejecutó.
              </p>
              <div className="mt-2 space-y-1">
                {failedCloses.map(f => (
                  <p key={f.tenantId} className="text-xs text-red-700">
                    <span className="font-semibold">{f.name}</span> — {f.orderCount} órdenes, ~${fmt(f.estimatedCommission)} estimado
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Weekly Statements Cross-Tenant ── */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText size={16} className="text-muted-foreground" />
            Cierres Semanales
          </CardTitle>
          {!loadingStatements && (
            <Badge variant="secondary" className="text-xs font-medium">
              {weeklyStatements.length} registros
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Comercio</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Semana</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Monto</th>
                  <th className="px-5 py-3 text-center text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Estado</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Órdenes</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loadingStatements ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center">
                      <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : weeklyStatements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <FileText size={32} className="opacity-30" />
                        <p className="text-sm font-medium">Aún no hay cierres semanales</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  weeklyStatements.map((s) => {
                    const statusStyle = STATEMENT_STATUS_STYLES[s.status] || STATEMENT_STATUS_STYLES.pendiente
                    return (
                      <tr key={s._id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <p className="text-sm font-semibold text-foreground">{s.tenantName}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">{s.tenantSlug}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-medium">
                          {format(new Date(s.weekStart), 'dd/MM', { locale: es })} –{' '}
                          {format(new Date(s.weekEnd), 'dd/MM/yyyy', { locale: es })}
                        </td>
                        <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(s.amount)}</td>
                        <td className="px-5 py-4 text-center">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold', statusStyle.className)}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-muted-foreground">{s.orderCount}</td>
                        <td className="px-5 py-4 text-right">
                          {s.status !== 'pagado' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] font-bold gap-1"
                              disabled={markingPaid === s._id}
                              onClick={() => handleMarkAsPaid(s._id, s.tenantName)}
                            >
                              {markingPaid === s._id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <CreditCard size={12} />
                              )}
                              Marcar pagado
                            </Button>
                          ) : (
                            <span className="text-[10px] text-green-600 font-medium">
                              {s.paidAt ? format(new Date(s.paidAt), 'dd/MM/yy', { locale: es }) : ''}
                            </span>
                          )}
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
