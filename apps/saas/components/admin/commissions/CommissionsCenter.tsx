'use client'

// ============================================================================
// Comisiones — qué se debe, de qué semana, por qué, y pagar
// ============================================================================
// · Resumen: vencido · pendiente · acumulado de la semana en curso.
// · Cómo funciona (explicado con respeto, sin afirmar de más).
// · Pagar: semanas cerradas (vencidas + pendientes), o también lo acumulado.
//   El cobro va a la cuenta de MercadoPago de la plataforma.
// · Semanas con su estado y el ticket de cada pedido.
// · Historial de pagos.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Info, Loader2, Receipt, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COMMISSION_EXPLAINER, WEEK_STATUS, pesos } from '@/lib/commissions-ui'
import type { CommissionAlerts } from '@/lib/commission-weeks'

interface WeekRow {
  key: string
  weekStart: string
  weekEnd: string
  dueAt: string
  status: 'en_curso' | 'pendiente' | 'vencida' | 'pagada'
  totalCents: number
  settledCents: number
  pendingCents: number
  orderCount: number
  pendingOrderCount: number
}

interface Settlement {
  amountCollected: number
  collectedAt: string
  collectedBy: string
  orderCount: number
}

const TONE: Record<string, string> = {
  danger: 'border-red-600/40 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
  warning: 'border-amber-600/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  ok: 'border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  info: 'border-border bg-muted text-foreground',
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
/** Rango lunes → domingo (weekEnd es el lunes siguiente, exclusivo). */
const fmtRange = (w: Pick<WeekRow, 'weekStart' | 'weekEnd'>) => `${fmtDay(w.weekStart)} al ${fmtDay(new Date(new Date(w.weekEnd).getTime() - 1).toISOString())}`

export default function CommissionsCenter({ tenantSlug, canPay }: { tenantSlug: string; canPay: boolean }) {
  const params = useSearchParams()
  const returned = params?.get('pago')
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; alerts: CommissionAlerts; weeks: WeekRow[] }>({ status: 'loading' })
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [paying, setPaying] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [w, s] = await Promise.all([
        fetch(`/api/${tenantSlug}/commissions/weeks`, { cache: 'no-store' }),
        fetch(`/api/${tenantSlug}/commissions/settlements`, { cache: 'no-store' }),
      ])
      const wj = await w.json()
      if (!w.ok) throw new Error(wj?.error || 'No se pudieron cargar las comisiones')
      setState({ status: 'ready', alerts: wj.alerts, weeks: wj.weeks })
      if (s.ok) setSettlements((await s.json()).settlements ?? [])
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Sin conexión' })
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  // Al volver de MP el aviso de pago puede tardar unos segundos: se reconsulta.
  useEffect(() => {
    if (returned !== 'ok' && returned !== 'pendiente') return
    const t1 = setTimeout(load, 4000)
    const t2 = setTimeout(load, 12000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [returned, load])

  async function pay(scope: 'due' | 'all' | 'week', weekKey?: string) {
    setPaying(scope + (weekKey ?? ''))
    setPayError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/commissions/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, weekKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.initPoint) throw new Error(data?.error || 'No se pudo iniciar el pago')
      window.location.href = data.initPoint
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'No se pudo iniciar el pago')
      setPaying(null)
    }
  }

  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Cargando comisiones</span>
        {[0, 1, 2].map((i) => <div key={i} aria-hidden className="h-24 animate-pulse rounded-2xl bg-muted" />)}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border-2 border-red-600/30 bg-red-50 p-5 text-red-900 dark:bg-red-950/30 dark:text-red-100">
        <p className="font-bold">No pudimos cargar tus comisiones</p>
        <p className="text-sm">{state.message}</p>
        <button type="button" onClick={() => { setState({ status: 'loading' }); load() }} className="min-h-11 rounded-xl border-2 border-current px-4 text-sm font-bold">
          Reintentar
        </button>
      </div>
    )
  }

  const { alerts, weeks } = state
  const dueCents = alerts.overdue.cents + alerts.pending.cents
  const allCents = dueCents + alerts.accrued.cents
  const locked = alerts.transferLock?.locked ?? false

  return (
    <div className="space-y-8">
      {returned === 'ok' && (
        <div role="status" className="flex items-start gap-2 rounded-2xl border-2 border-emerald-600/30 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0" />
          ¡Gracias! Recibimos tu pago. MercadoPago lo confirma en unos segundos y las semanas pasan a «Pagada» solas.
        </div>
      )}
      {returned === 'pendiente' && (
        <div role="status" className="rounded-2xl border-2 border-amber-600/30 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          Tu pago quedó pendiente en MercadoPago. Cuando se acredite, se actualiza solo.
        </div>
      )}
      {returned === 'error' && (
        <div role="alert" className="rounded-2xl border-2 border-red-600/30 bg-red-50 p-4 text-sm font-medium text-red-900 dark:bg-red-950/30 dark:text-red-100">
          El pago no se completó. No se cobró nada: podés intentarlo de nuevo.
        </div>
      )}

      {/* Resumen */}
      <section aria-label="Resumen de comisiones" className="grid gap-3 sm:grid-cols-3">
        <Stat tone={alerts.overdue.cents > 0 ? 'danger' : 'info'} icon={<AlertTriangle size={18} aria-hidden />} label="Vencido" value={pesos(alerts.overdue.cents)} hint={alerts.overdue.weeks ? `${alerts.overdue.weeks} semana(s) fuera de plazo` : 'Nada vencido'} />
        <Stat tone={alerts.pending.cents > 0 ? 'warning' : 'info'} icon={<Clock size={18} aria-hidden />} label="Pendiente" value={pesos(alerts.pending.cents)} hint={alerts.pending.nextDueAt ? `Vence el ${fmtDay(alerts.pending.nextDueAt)}` : 'Sin semanas por pagar'} />
        <Stat tone="info" icon={<Wallet size={18} aria-hidden />} label="Acumulado esta semana" value={pesos(alerts.accrued.cents)} hint={`${alerts.accrued.orders} pedido(s) · se liquida al cerrar la semana`} />
      </section>

      {/* Transferencias apagadas por deuda (> tope) */}
      {locked && (
        <div role="alert" className={cn('space-y-1 rounded-2xl border-2 p-5', TONE.danger)}>
          <p className="flex items-center gap-2 text-base font-black">
            <AlertTriangle size={18} aria-hidden /> Transferencias desactivadas
          </p>
          <p className="text-sm">
            Tus comisiones vencidas ({pesos(alerts.transferLock.overdueCents)}) superan el tope de {pesos(alerts.transferLock.thresholdCents)}. Hasta que las pagues, tus clientes no pueden pagarte por transferencia, ni en delivery ni en take away: pueden pagar con MercadoPago. Apenas se acredita el pago, se vuelven a habilitar solas.
          </p>
        </div>
      )}

      {/* Pagar */}
      <section aria-labelledby="pay-title" className="space-y-3 rounded-2xl border-2 border-border bg-card p-5">
        <h2 id="pay-title" className="text-lg font-black">
          {dueCents > 0 ? `Total a pagar: ${pesos(dueCents)}` : 'Estás al día'}
        </h2>
        <p className="text-sm text-muted-foreground">
          El pago se hace por MercadoPago y va a la cuenta de TakeasyGO. Se acredita solo: no tenés que enviar comprobantes.
        </p>
        {payError && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{payError}</p>}
        {!canPay && dueCents > 0 && (
          <p className="text-sm font-semibold">El pago lo hace el administrador o el manager del comercio.</p>
        )}
        <div className={cn('flex flex-wrap gap-2', !canPay && 'hidden')}>
          {locked ? (
            <button type="button" onClick={() => pay('due')} disabled={paying !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
              {paying === 'due' && <Loader2 size={16} aria-hidden className="animate-spin" />} Pagar {pesos(dueCents)} y habilitar transferencias
            </button>
          ) : dueCents > 0 && (
            <button type="button" onClick={() => pay('due')} disabled={paying !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {paying === 'due' && <Loader2 size={16} aria-hidden className="animate-spin" />} Pagar {pesos(dueCents)} con MercadoPago
            </button>
          )}
          {alerts.accrued.cents > 0 && (
            <button type="button" onClick={() => pay('all')} disabled={paying !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-border px-5 text-sm font-bold disabled:opacity-60">
              {paying === 'all' && <Loader2 size={16} aria-hidden className="animate-spin" />}
              {dueCents > 0 ? `Pagar todo, incluida esta semana (${pesos(allCents)})` : `Adelantar lo de esta semana (${pesos(alerts.accrued.cents)})`}
            </button>
          )}
        </div>
      </section>

      {/* Cómo funciona */}
      <section aria-labelledby="how-title" className="space-y-2 rounded-2xl border-2 border-border bg-muted/30 p-5">
        <h2 id="how-title" className="flex items-center gap-2 text-base font-black">
          <Info size={18} aria-hidden /> Cómo funciona la comisión
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
          {COMMISSION_EXPLAINER.map((t) => <li key={t}>{t}</li>)}
          <li>Solo generan comisión para pagar los pedidos de delivery pagados por transferencia.</li>
        </ul>
      </section>

      {/* Semanas */}
      <section aria-labelledby="weeks-title" className="space-y-3">
        <h2 id="weeks-title" className="text-lg font-black">Semanas</h2>
        {weeks.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Todavía no hay pedidos de delivery pagados por transferencia: no hay comisiones para liquidar.
          </p>
        ) : (
          <ul className="space-y-2">
            {weeks.map((w) => {
              const s = WEEK_STATUS[w.status]
              return (
                <li key={w.key} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">Semana del {fmtRange(w)}</p>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold', TONE[s.tone])}>{s.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {w.orderCount} pedido(s) · comisión {pesos(w.totalCents)}
                      {w.pendingCents > 0 && w.pendingCents < w.totalCents && ` · falta ${pesos(w.pendingCents)}`}
                      {(w.status === 'pendiente' || w.status === 'vencida') && ` · vence el ${fmtDay(w.dueAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/${tenantSlug}/admin/commissions/semana/${w.key}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-border px-4 text-sm font-bold hover:bg-muted">
                      <Receipt size={16} aria-hidden /> Ver tickets <ChevronRight size={16} aria-hidden />
                    </Link>
                    {canPay && w.pendingCents > 0 && w.status !== 'en_curso' && (
                      <button type="button" onClick={() => pay('week', w.key)} disabled={paying !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
                        {paying === `week${w.key}` && <Loader2 size={16} aria-hidden className="animate-spin" />} Pagar {pesos(w.pendingCents)}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Historial */}
      {settlements.length > 0 && (
        <section aria-labelledby="history-title" className="space-y-3">
          <h2 id="history-title" className="text-lg font-black">Pagos realizados</h2>
          <ul className="divide-y divide-border rounded-2xl border-2 border-border">
            {settlements.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {new Date(s.collectedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  <span className="text-muted-foreground"> · {s.orderCount} pedido(s) · {s.collectedBy.startsWith('mp-payment') ? 'MercadoPago' : 'registrado por TakeasyGO'}</span>
                </span>
                <span className="font-bold tabular-nums">${s.amountCollected.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ tone, icon, label, value, hint }: { tone: string; icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className={cn('rounded-2xl border-2 p-4', TONE[tone])}>
      <p className="flex items-center gap-1.5 text-sm font-bold">{icon} {label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-sm opacity-90">{hint}</p>
    </div>
  )
}
