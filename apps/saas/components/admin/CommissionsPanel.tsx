'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign, Calendar, Clock, CheckCircle2, AlertTriangle,
  CreditCard, Loader2, ArrowRight,
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

/* ── Status endpoint ── */
interface CommissionStatus {
  balance: number
  threshold: number | null
  overThreshold: boolean
}

/* ── Commissions endpoint ── */
interface CommissionBreakdown {
  method: string
  amount: number
  count: number
}

interface CommissionData {
  from: string
  to: string
  total: number
  settled: number
  pending: number
  breakdown: CommissionBreakdown[]
}

/* ── Settlements endpoint ── */
interface Settlement {
  from: string
  to: string
  amountCollected: number
  collectedBy: string
  collectedAt: string
  notes: string
}

const METHOD_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  kripton: 'Kripton',
}

const METHOD_COLORS: Record<string, string> = {
  transfer: 'text-amber-500',
  mercadopago: 'text-primary',
  kripton: 'text-purple-500',
}

export default function CommissionsPanel({ tenantSlug }: { tenantSlug: string }) {
  const defaults = getDefaultDates()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)

  const [status, setStatus] = useState<CommissionStatus | null>(null)
  const [data, setData] = useState<CommissionData | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])

  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingData, setLoadingData] = useState(true)
  const [loadingSettlements, setLoadingSettlements] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── Fetch status (balance + threshold) ── */
  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true)
      const res = await fetch(`/api/${tenantSlug}/commissions/status`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStatus(json)
    } catch {
      // silent — badge will just not show
    } finally {
      setLoadingStatus(false)
    }
  }, [tenantSlug])

  /* ── Fetch commissions for period ── */
  const fetchData = useCallback(async () => {
    try {
      setLoadingData(true)
      setError(null)
      const params = new URLSearchParams({ from, to })
      const res = await fetch(`/api/${tenantSlug}/commissions?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar comisiones')
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Error al cargar comisiones')
    } finally {
      setLoadingData(false)
    }
  }, [tenantSlug, from, to])

  /* ── Fetch settlements history ── */
  const fetchSettlements = useCallback(async () => {
    try {
      setLoadingSettlements(true)
      const res = await fetch(`/api/${tenantSlug}/commissions/settlements`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSettlements(json.settlements || [])
    } catch {
      // silent
    } finally {
      setLoadingSettlements(false)
    }
  }, [tenantSlug])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSettlements() }, [fetchSettlements])

  /* ── Pay handler ── */
  async function handlePay() {
    try {
      setPaying(true)
      const res = await fetch(`/api/${tenantSlug}/commissions/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al crear pago')
      if (json.initPoint) {
        window.location.href = json.initPoint
      }
    } catch (err: any) {
      alert(err.message || 'Error al procesar el pago')
    } finally {
      setPaying(false)
    }
  }

  const balance = status?.balance ?? 0
  const overThreshold = status?.overThreshold ?? false
  const pendingAmount = data?.pending ?? 0

  return (
    <div className="space-y-6">
      {/* ── Threshold alert banner ── */}
      {overThreshold && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-800">
          <AlertTriangle size={18} className="shrink-0 text-amber-500" />
          <p className="font-medium">
            Tu balance de comisiones superó el umbral configurado. Considerá realizar el pago.
          </p>
        </div>
      )}

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Balance Acumulado</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign size={16} className="text-primary" />
            </div>
          </div>
          {loadingStatus ? (
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums">${fmt(balance)}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">Total histórico (centavos / 100)</p>
        </Card>

        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pendiente Período</span>
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Clock size={16} className="text-destructive" />
            </div>
          </div>
          {loadingData ? (
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums text-destructive">
              ${fmt(pendingAmount)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            {format(new Date(from), 'dd/MM/yyyy', { locale: es })} – {format(new Date(to), 'dd/MM/yyyy', { locale: es })}
          </p>
        </Card>
      </div>

      {/* ── Period selector + Pay button ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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

        {pendingAmount > 0 && (
          <Button
            onClick={handlePay}
            disabled={paying}
            className="gap-2"
          >
            {paying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CreditCard size={16} />
            )}
            Pagar comisiones
            <ArrowRight size={14} />
          </Button>
        )}
      </div>

      {error && (
        <Card className="rounded-2xl border shadow-sm p-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchData}>
            Reintentar
          </Button>
        </Card>
      )}

      {/* ── Breakdown by method ── */}
      {!error && (
        <Card className="rounded-2xl border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Desglose por Método de Pago</CardTitle>
            {data?.breakdown && (
              <Badge variant="secondary" className="text-xs font-medium">
                {data.breakdown.length} métodos
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Método</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Monto</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Órdenes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loadingData ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center">
                        <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : !data?.breakdown || data.breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <DollarSign size={32} className="opacity-30" />
                          <p className="text-sm font-medium">No hay comisiones en este período</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    data.breakdown.map((b) => (
                      <tr key={b.method} className="hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-4">
                          <span className={cn('text-sm font-semibold', METHOD_COLORS[b.method] || '')}>
                            {METHOD_LABELS[b.method] || b.method}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(b.amount)}</td>
                        <td className="px-5 py-4 text-right text-sm text-muted-foreground">{b.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Settlements history ── */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Historial de Saldos</CardTitle>
          {!loadingSettlements && (
            <Badge variant="secondary" className="text-xs font-medium">
              {settlements.length} registros
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Período</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Monto</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Saldado por</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Fecha</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loadingSettlements ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center">
                      <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <CheckCircle2 size={32} className="opacity-30" />
                        <p className="text-sm font-medium">Aún no se saldaron comisiones</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  settlements.map((s, i) => (
                    <tr key={i} className="hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-4 text-sm font-medium">
                        {format(new Date(s.from), 'dd/MM/yyyy', { locale: es })} –{' '}
                        {format(new Date(s.to), 'dd/MM/yyyy', { locale: es })}
                      </td>
                      <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(s.amountCollected)}</td>
                      <td className="px-5 py-4 text-sm">{s.collectedBy}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {format(new Date(s.collectedAt), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{s.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
