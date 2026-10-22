'use client'

// ============================================================================
// Detalle de una semana: el ticket explicado de cada pedido
// ============================================================================
// Por pedido: lo que transfirió el cliente, qué parte es tuya (productos a
// precio de carta y tu recargo), el envío, la comisión de TakeasyGO y quién
// la pagó. Imprimible (o guardable como PDF desde el navegador).
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WEEK_STATUS, originMessage, pesos } from '@/lib/commissions-ui'
import type { WeekTickets, CommissionTicket } from '@/lib/commission-tickets'

type Detail = WeekTickets & { tenantName: string; status: string; pendingCents: number; autoCollected?: { cents: number; orders: number } }

const TZ = 'America/Argentina/Buenos_Aires'
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ })

const TONE: Record<string, string> = {
  ok: 'border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
  warning: 'border-amber-600/30 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
  info: 'border-border bg-muted/50 text-foreground',
  danger: 'border-red-600/30 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100',
}

export default function CommissionWeekDetail({ tenantSlug, weekKey, canPay }: { tenantSlug: string; weekKey: string; canPay: boolean }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Detail }>({ status: 'loading' })
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/commissions/weeks/${weekKey}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudo cargar la semana')
      setState({ status: 'ready', data })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Sin conexión' })
    }
  }, [tenantSlug, weekKey])

  useEffect(() => {
    load()
  }, [load])

  async function pay() {
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/commissions/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'week', weekKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.initPoint) throw new Error(data?.error || 'No se pudo iniciar el pago')
      window.location.href = data.initPoint
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'No se pudo iniciar el pago')
      setPaying(false)
    }
  }

  const back = (
    <Link href={`/${tenantSlug}/admin/commissions`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold print:hidden">
      <ArrowLeft size={16} aria-hidden /> Volver a Comisiones
    </Link>
  )

  if (state.status === 'loading') {
    return (
      <div className="space-y-4">
        {back}
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">Cargando la semana</span>
          {[0, 1, 2].map((i) => <div key={i} aria-hidden className="h-40 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        {back}
        <div role="alert" className="space-y-3 rounded-2xl border-2 border-red-600/30 bg-red-50 p-5 text-red-900 dark:bg-red-950/30 dark:text-red-100">
          <p className="font-bold">No pudimos cargar la semana</p>
          <p className="text-sm">{state.message}</p>
          <button type="button" onClick={() => { setState({ status: 'loading' }); load() }} className="min-h-11 rounded-xl border-2 border-current px-4 text-sm font-bold">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const d = state.data
  const t = d.totals
  const s = WEEK_STATUS[d.status] ?? WEEK_STATUS.en_curso
  const lastDay = new Date(new Date(d.weekEnd).getTime() - 1).toISOString()

  return (
    <div className="space-y-6">
      {back}
      <header className="space-y-2">
        <p className="text-sm font-bold text-muted-foreground print:block">{d.tenantName} · Liquidación de comisiones TakeasyGO</p>
        <h1 className="text-2xl font-black tracking-tight">Semana del {fmtDay(d.weekStart)} al {fmtDay(lastDay)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold', TONE[s.tone])}>{s.label}</span>
          {(d.status === 'pendiente' || d.status === 'vencida') && <span className="text-sm text-muted-foreground">Vence el {fmtDay(d.dueAt)}</span>}
        </div>
      </header>

      {/* Resumen de la semana */}
      <section aria-label="Resumen de la semana" className="space-y-3 rounded-2xl border-2 border-border bg-card p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Pedidos por transferencia (delivery)" value={String(t.orders)} />
          <Row label="Total que te transfirieron los clientes" value={pesos(t.totalPaidCents)} />
          <Row label="Tus productos (precio de carta)" value={pesos(t.productsCents)} strong />
          <Row label="Envíos" value={pesos(t.deliveryCents)} />
          <Row label="Comisión TakeasyGO de la semana" value={pesos(t.commissionCents)} strong />
          {t.paidByCustomerCents > 0 && <Row label="…de la cual pagaron los clientes (cargo por usar la app)" value={pesos(t.paidByCustomerCents)} />}
          {t.paidByRestaurantCents > 0 && <Row label="…de la cual salió del total de los pedidos" value={pesos(t.paidByRestaurantCents)} />}
          {t.unknownOriginCents > 0 && <Row label="…de pedidos anteriores al desglose" value={pesos(t.unknownOriginCents)} />}
          {d.autoCollected && d.autoCollected.cents > 0 && (
            <Row label={`MercadoPago (${d.autoCollected.orders} pedido/s): cobrada automáticamente`} value={pesos(d.autoCollected.cents)} />
          )}
        </dl>
        {t.paidByCustomerCents > 0 && t.paidByRestaurantCents === 0 && t.unknownOriginCents === 0 && (
          <p className={cn('rounded-xl border-2 p-3 text-sm', TONE.ok)}>
            Toda la comisión de esta semana la pagaron tus clientes como cargo por usar la app. Tus productos se cobraron a precio de carta: esta comisión no sale de tu margen.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1 print:hidden">
          {canPay && d.pendingCents > 0 && d.status !== 'en_curso' && (
            <button type="button" onClick={pay} disabled={paying} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {paying && <Loader2 size={16} aria-hidden className="animate-spin" />} Pagar {pesos(d.pendingCents)} con MercadoPago
            </button>
          )}
          {d.status === 'pagada' && <p className={cn('rounded-xl border-2 px-3 py-2 text-sm font-bold', TONE.ok)}>Semana pagada. ¡Gracias!</p>}
          {d.status === 'en_curso' && <p className="text-sm text-muted-foreground">La semana sigue abierta: se liquida al cerrar el domingo.</p>}
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-border px-4 text-sm font-bold hover:bg-muted">
            <Printer size={16} aria-hidden /> Imprimir o guardar PDF
          </button>
        </div>
        {payError && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{payError}</p>}
      </section>

      {/* Tickets */}
      <section aria-labelledby="tickets-title" className="space-y-3">
        <h2 id="tickets-title" className="text-lg font-black">Ticket de cada pedido</h2>
        {d.tickets.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hubo pedidos con comisión esta semana.</p>
        ) : (
          <ol className="grid gap-4 lg:grid-cols-2">
            {d.tickets.map((tk) => <Ticket key={tk.orderId} t={tk} />)}
          </ol>
        )}
      </section>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-black' : 'font-semibold')}>{value}</dd>
    </div>
  )
}

function Ticket({ t }: { t: CommissionTicket }) {
  const msg = originMessage(t.origin, { commissionCents: t.commissionCents, byCustomerCents: t.paidByCustomerCents, byRestaurantCents: t.paidByRestaurantCents })
  const ownSurcharge = t.merchantSurchargeCents ?? 0
  return (
    <li className="break-inside-avoid space-y-3 rounded-2xl border-2 border-border bg-card p-4 font-mono text-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-border pb-2 font-sans">
        <p className="font-black">Pedido {t.orderNumber}</p>
        <p className="text-xs text-muted-foreground">
          {fmtDateTime(t.createdAt)} · {t.settled ? 'Pagado' : 'Pendiente'}
        </p>
      </div>
      {t.items.length > 0 && (
        <ul className="space-y-0.5">
          {t.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-2">
              <span className="truncate">{i.quantity} × {i.name}</span>
              <span className="tabular-nums">{pesos(i.totalCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-0.5 border-t border-dashed border-border pt-2">
        <Line label="Tus productos (precio de carta)" value={pesos(t.productsCents)} />
        {ownSurcharge > 0 && <Line label="Tu recargo por transferencia" value={pesos(ownSurcharge)} />}
        {t.deliveryCents > 0 && <Line label="Envío" value={pesos(t.deliveryCents)} />}
        {t.paidByCustomerCents !== null && t.paidByCustomerCents > 0 && <Line label="Cargo por usar la app (lo pagó el cliente)" value={pesos(t.paidByCustomerCents)} />}
        <Line label="Total que te transfirió el cliente" value={pesos(t.totalPaidCents)} strong />
      </dl>
      <dl className="space-y-0.5 border-t border-dashed border-border pt-2">
        <Line label="Comisión TakeasyGO" value={pesos(t.commissionCents)} strong />
        <Line label="Te queda" value={pesos(t.restaurantKeepsCents)} />
      </dl>
      <div className={cn('rounded-xl border-2 p-3 font-sans', TONE[msg.tone])}>
        <p className="font-bold">{msg.title}</p>
        <p className="mt-1">{msg.body}</p>
      </div>
    </li>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className={cn('tabular-nums', strong && 'font-bold')}>{value}</dd>
    </div>
  )
}
