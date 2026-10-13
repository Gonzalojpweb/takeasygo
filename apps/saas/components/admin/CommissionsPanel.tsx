'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign, Calendar, Clock, CheckCircle2, AlertTriangle,
  CreditCard, Loader2, ArrowRight, FileText, Info, Scale, ArrowDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

/** Formatea una Date local como "YYYY-MM-DD" sin pasar por UTC (evita el off-by-one). */
function localDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDefaultDates() {
  const now = new Date()
  return {
    from: localDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

/** Parsea "YYYY-MM-DD" como fecha LOCAL (no UTC) para que format() no muestre el día anterior. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function fmtPeriod(fromStr: string, toStr: string) {
  return `${format(parseLocalDate(fromStr), "dd 'de' MMMM yyyy", { locale: es })} – ${format(parseLocalDate(toStr), "dd 'de' MMMM yyyy", { locale: es })}`
}

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ── Status endpoint ── */
interface CommissionStatus {
  balance: number
  threshold: number | null
  overThreshold: boolean
}

/* ── Commissions endpoint ── */
interface MethodBreakdown {
  method: string
  amount: number
  settled: number
  pending: number
  count: number
}

interface CommissionData {
  from: string
  to: string
  total: number
  settled: number
  pending: number
  orderCount: number
  settledOrderCount: number
  breakdown: MethodBreakdown[]
  transfer: { total: number; settled: number; pending: number; orderCount: number }
  unattributedSettled: number
}

/* ── Settlements endpoint ── */
interface Settlement {
  from: string
  to: string
  amountCollected: number
  collectedBy: string
  collectedAt: string
  notes: string
  orderCount: number
}

/* ── Weekly Statements endpoint ── */
interface WeeklyStatement {
  weekStart: string
  weekEnd: string
  amount: number
  status: 'pendiente' | 'pagado' | 'vencido'
  closedAt: string
  paidAt: string | null
  orderCount: number
}

const METHOD_INFO: Record<string, { label: string; desc: string; className: string }> = {
  transfer: {
    label: 'Transferencia',
    desc: 'Delivery pagado por transferencia bancaria. Se acumula en tu balance y lo abonás desde este panel cuando quieras.',
    className: 'text-amber-600',
  },
  mercadopago: {
    label: 'MercadoPago',
    desc: 'Comisión cobrada automáticamente con cada pago aprobado de MercadoPago.',
    className: 'text-primary',
  },
  kripton: {
    label: 'Kripton',
    desc: 'Comisión cobrada automáticamente con cada pago aprobado con Kripton.',
    className: 'text-purple-500',
  },
  cash: {
    label: 'Efectivo',
    desc: 'Los pagos en efectivo no generan comisión de TakeasyGO.',
    className: 'text-emerald-600',
  },
}

function methodInfo(method: string) {
  return METHOD_INFO[method] ?? { label: method, desc: 'Medio de pago no identificado.', className: '' }
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  pagado: { label: 'Pagado', className: 'bg-green-100 text-green-700' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-700' },
}

export default function CommissionsPanel({ tenantSlug }: { tenantSlug: string }) {
  const defaults = getDefaultDates()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)

  const [status, setStatus] = useState<CommissionStatus | null>(null)
  const [data, setData] = useState<CommissionData | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [weeklyStatements, setWeeklyStatements] = useState<WeeklyStatement[]>([])

  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingData, setLoadingData] = useState(true)
  const [loadingSettlements, setLoadingSettlements] = useState(true)
  const [loadingStatements, setLoadingStatements] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El inicio nunca puede ser posterior al fin: si se pisa, se corrige el otro.
  function handleFromChange(value: string) {
    setFrom(value)
    if (value && to && value > to) setTo(value)
  }
  function handleToChange(value: string) {
    setTo(value)
    if (value && from && value < from) setFrom(value)
  }

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar comisiones')
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

  /* ── Fetch weekly statements ── */
  const fetchWeeklyStatements = useCallback(async () => {
    try {
      setLoadingStatements(true)
      const res = await fetch(`/api/${tenantSlug}/commissions/weekly-statements`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setWeeklyStatements(json.statements || [])
    } catch {
      // silent
    } finally {
      setLoadingStatements(false)
    }
  }, [tenantSlug])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSettlements() }, [fetchSettlements])
  useEffect(() => { fetchWeeklyStatements() }, [fetchWeeklyStatements])

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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al procesar el pago')
    } finally {
      setPaying(false)
    }
  }

  const balance = status?.balance ?? 0
  const threshold = status?.threshold ?? null
  const overThreshold = status?.overThreshold ?? false
  const transferPending = data?.transfer?.pending ?? 0

  return (
    <div className="space-y-6">
      {/* ── Explicación general ── */}
      <Card className="rounded-2xl border shadow-sm bg-muted/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Info size={16} className="text-primary" />
            </div>
            <div className="text-sm space-y-1.5 text-muted-foreground">
              <p className="font-semibold text-foreground">¿Cómo funcionan las comisiones?</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Cada orden aprobada genera una <b className="text-foreground">comisión de TakeasyGO</b> (un porcentaje según el medio de pago). <b className="text-foreground">Efectivo no genera comisión.</b></li>
                <li><b className="text-foreground">MercadoPago y Kripton</b>: la comisión se cobra automáticamente con cada pago; no tenés que hacer nada.</li>
                <li><b className="text-foreground">Transferencia</b> (solo delivery): la comisión se acumula y la abonás cuando quieras desde este panel con el botón «Pagar».</li>
                <li>Cada pago que registrás (o que TakeasyGO registra) <b className="text-foreground">cubre órdenes concretas</b>, por eso los montos se reparten entre «Pagado» y «Pendiente» por período y por método.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Avisos ── */}
      {overThreshold && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-800">
          <AlertTriangle size={18} className="shrink-0 text-amber-500" />
          <p className="font-medium">
            Tu balance histórico de comisiones por transferencia superó el umbral configurado
            {threshold != null ? ` ($${fmt(threshold)})` : ''}. Considerá realizar el pago.
          </p>
        </div>
      )}
      {balance < 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-3.5 text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 text-red-500" />
          <p>
            <b className="font-semibold">Tu balance histórico está en negativo ($${fmt(balance)}).</b>{' '}
            Significa que se registraron pagos de comisiones por más dinero del que acumulaste
            (por ejemplo, ajustes manuales del equipo TakeasyGO). No es un saldo que debas pagar.
            Si creés que hay un error, contactanos.
          </p>
        </div>
      )}

      {/* ── Selector de período ── */}
      <Card className="rounded-2xl border shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Período</span>
            <Input
              type="date"
              value={from}
              onChange={e => handleFromChange(e.target.value)}
              className="w-36 h-9 text-sm"
            />
            <span className="text-xs text-muted-foreground">al</span>
            <Input
              type="date"
              value={to}
              onChange={e => handleToChange(e.target.value)}
              className="w-36 h-9 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Todos los montos de esta página corresponden a este rango ({fmtPeriod(from, to)}).
            Por defecto es el mes actual. Para pagar meses anteriores, cambialo acá.
          </p>
        </div>
      </Card>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Lo que se paga */}
        <Card className="rounded-2xl border shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Transferencias sin pagar</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock size={16} className="text-amber-600" />
            </div>
          </div>
          {loadingData ? (
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums text-amber-600">
              ${fmt(transferPending)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2 flex-1">
            Comisiones de pedidos delivery pagados por <b>transferencia</b> en el período, menos lo
            que ya pagaste. Es el monto exacto que cobra el botón «Pagar».
          </p>
          {transferPending > 0 && (
            <Button onClick={handlePay} disabled={paying} className="gap-2 mt-4 w-full">
              {paying ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CreditCard size={16} />
              )}
              Pagar ${fmt(transferPending)}
              <ArrowRight size={14} />
            </Button>
          )}
        </Card>

        {/* 2. Total del período */}
        <Card className="rounded-2xl border shadow-sm p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Comisiones del período</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign size={16} className="text-primary" />
            </div>
          </div>
          {loadingData ? (
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums">
              ${fmt(data?.total ?? 0)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Suma de comisiones de TakeasyGO de las <b>{data?.orderCount ?? 0} órdenes</b> aprobadas
            en el período, <b>todos</b> los medios de pago. Detalle por método más abajo.
          </p>
        </Card>

        {/* 3. Ya pagado */}
        <Card className="rounded-2xl border shadow-sm p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Ya pagado en el período</span>
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
          </div>
          {loadingData ? (
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-3xl font-bold tracking-tight mt-3 tabular-nums text-green-600">
              ${fmt(data?.settled ?? 0)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Parte de esas comisiones que ya saldaste: cubre las órdenes de{' '}
            <b>{data?.settledOrderCount ?? 0}</b> pagos registrados que caen dentro del período.
            Ver «Pagos registrados» más abajo.
          </p>
        </Card>
      </div>

      {/* ── Balance histórico (transferencias) ── */}
      <Card className="rounded-2xl border shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center justify-between sm:flex-1">
            <div className="flex items-center gap-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', balance < 0 ? 'bg-red-100' : 'bg-primary/10')}>
                <DollarSign size={16} className={balance < 0 ? 'text-red-600' : 'text-primary'} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Balance histórico de transferencias</p>
                <p className="text-2xl font-bold tabular-nums mt-0.5">
                  {loadingStatus ? '…' : `$${fmt(balance)}`}
                </p>
              </div>
            </div>
            {threshold != null && (
              <Badge variant="outline" className="text-xs">
                Umbral de aviso: ${fmt(threshold)}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground sm:max-w-md">
            Comisiones por transferencia acumuladas <b>desde siempre</b> que todavía no se saldaron.
            Sube cuando se confirma una orden por transferencia; baja cuando pagás (el botón «Pagar»
            o un pago registrado por TakeasyGO) y cuando se cancela una orden. Es un contador
            distinto del período de arriba: no cambia al mover las fechas.
          </p>
        </div>
      </Card>

      {error && (
        <Card className="rounded-2xl border shadow-sm p-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchData}>
            Reintentar
          </Button>
        </Card>
      )}

      {/* ── Cómo cierra la cuenta ── */}
      {!error && data && (
        <Card className="rounded-2xl border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border/40 p-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Scale size={16} className="text-muted-foreground" />
              Cómo cierra la cuenta del período
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Esta es la cuenta exacta de {fmtPeriod(from, to)}. Todo cierra: total = pagado + pendiente.
            </p>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Comisiones generadas en el período (todos los métodos)</span>
              <span className="font-semibold tabular-nums">${fmt(data.total)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">− Ya pagado (pagos registrados que cubren órdenes del período)</span>
              <span className="font-semibold tabular-nums text-green-600">${fmt(data.settled)}</span>
            </div>
            <div className="border-t border-border/40 pt-2 flex items-center justify-between text-sm font-bold">
              <span>= Pendiente del período</span>
              <span className="tabular-nums">${fmt(data.pending)}</span>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="font-semibold text-amber-800 flex items-center gap-2">
                <ArrowDown size={14} className="text-amber-600" />
                De ese pendiente, lo que se paga con transferencia
              </span>
              <span className="font-black tabular-nums text-amber-700">${fmt(data.transfer.pending)}</span>
            </div>
            {data.unattributedSettled > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                * Incluye un ajuste de ${fmt(data.unattributedSettled)} por pagos antiguos registrados
                sin detalle de órdenes.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Breakdown by method ── */}
      {!error && (
        <Card className="rounded-2xl border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Detalle por método de pago</CardTitle>
              <p className="text-xs text-muted-foreground font-normal mt-1">
                Qué se cobra, cómo se cobra y cuánto falta de cada medio de pago en el período.
              </p>
            </div>
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
                    <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Órdenes</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Comisión del período</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Ya pagado</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loadingData ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center">
                        <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : !data?.breakdown || data.breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <DollarSign size={32} className="opacity-30" />
                          <p className="text-sm font-medium">No hay comisiones en este período</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {data.breakdown.map((b) => {
                        const info = methodInfo(b.method)
                        return (
                          <tr key={b.method} className="hover:bg-muted/40 transition-colors align-top">
                            <td className="px-5 py-4">
                              <span className={cn('text-sm font-semibold', info.className)}>
                                {info.label}
                              </span>
                              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">{info.desc}</p>
                            </td>
                            <td className="px-5 py-4 text-right text-sm text-muted-foreground tabular-nums">{b.count}</td>
                            <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(b.amount)}</td>
                            <td className="px-5 py-4 text-right text-sm tabular-nums text-green-600">${fmt(b.settled)}</td>
                            <td className="px-5 py-4 text-right font-black tabular-nums">${fmt(b.pending)}</td>
                          </tr>
                        )
                      })}
                      <tr className="bg-muted/40 font-bold">
                        <td className="px-5 py-3 text-sm">Total</td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums">{data.orderCount}</td>
                        <td className="px-5 py-3 text-right tabular-nums">${fmt(data.total)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-green-600">${fmt(data.settled)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">${fmt(data.pending)}</td>
                      </tr>
                    </>
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
          <div>
            <CardTitle className="text-base font-semibold">Pagos registrados</CardTitle>
            <p className="text-xs text-muted-foreground font-normal mt-1">
              Pagos de comisiones ya hechos (vía MercadoPago desde este panel, o registrados por el
              equipo TakeasyGO). Cada pago cubre las órdenes indicadas: por eso reducen el «Pendiente».
            </p>
          </div>
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
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Período que cubre</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Monto</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Órdenes</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Registrado por</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Fecha</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loadingSettlements ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center">
                      <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <CheckCircle2 size={32} className="opacity-30" />
                        <p className="text-sm font-medium">Todavía no registraste pagos de comisiones</p>
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
                      <td className="px-5 py-4 text-right text-sm text-muted-foreground tabular-nums">{s.orderCount || '—'}</td>
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

      {/* ── Weekly Statements ── */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText size={16} className="text-muted-foreground" />
              Cierres semanales (informativo)
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal mt-1">
              Resumen automático de cada semana (se genera los lunes) con las comisiones de
              transferencia de esa semana. Es solo un recordatorio: no es un cobro adicional —
              lo que se paga es lo del botón «Pagar».
            </p>
          </div>
          {!loadingStatements && (
            <Badge variant="secondary" className="text-xs font-medium">
              {weeklyStatements.length} semanas
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Semana</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Monto</th>
                  <th className="px-5 py-3 text-center text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Estado</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Órdenes</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Cerrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loadingStatements ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center">
                      <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : weeklyStatements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <FileText size={32} className="opacity-30" />
                        <p className="text-sm font-medium">Aún no hay cierres semanales</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  weeklyStatements.map((s, i) => {
                    const statusStyle = STATUS_STYLES[s.status] || STATUS_STYLES.pendiente
                    return (
                      <tr key={i} className="hover:bg-muted/40 transition-colors">
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
                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {format(new Date(s.closedAt), 'dd/MM/yyyy HH:mm', { locale: es })}
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
