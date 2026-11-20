'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Truck, Info } from 'lucide-react'
import type { RapiboyBreakdown, RapiboyBreakdownRow } from '@/lib/rapiboy/breakdown'

// Desglose de envíos Rapiboy (superadmin): qué pagó el cliente, qué es de
// Rapiboy, qué es comisión de TakeasyGO y cómo se cobra. Datos: /api/superadmin/rapiboy-envios.

const money = (cents: number) => `${cents < 0 ? '−' : ''}$${Math.abs(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const METHOD_LABEL: Record<string, string> = { mercadopago: 'Mercado Pago', kripton: 'Kripton', transfer: 'Transferencia', cash: 'Efectivo' }
const COLLECTION_LABEL: Record<RapiboyBreakdownRow['collection'], { label: string; cls: string }> = {
  mp_split: { label: 'Automático (split)', cls: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  weekly_balance: { label: 'Saldo semanal del comercio', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  not_collected: { label: 'No se cobra (sin pago o cancelado)', cls: 'bg-muted text-muted-foreground' },
}

function todayAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

type Data = RapiboyBreakdown & { truncated: boolean }

export default function RapiboyDeliveryBreakdown() {
  const [from, setFrom] = useState(() => `${todayAR().slice(0, 8)}01`)
  const [to, setTo] = useState(todayAR)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/rapiboy-envios?from=${from}&to=${to}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error')
      setData(json)
    } catch (e) {
      setError((e as Error).message || 'No se pudo cargar')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const t = data?.totals

  return (
    <section aria-labelledby="rapiboy-breakdown-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="rapiboy-breakdown-title" className="flex items-center gap-2 text-xl font-bold">
            <Truck size={20} className="text-primary" aria-hidden /> Envíos Rapiboy: desglose
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Qué se le paga a Rapiboy y qué comisión recibe TakeasyGO, pedido por pedido.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5" />
          </label>
        </div>
      </div>

      <details className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Info size={14} aria-hidden /> Cómo se arma cada envío</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><b>Envío cobrado al cliente</b> = costo de Rapiboy (cotizado en el checkout) + <b>comisión de envío TakeasyGO</b> (el % de la sede) + colchón (solo transferencia).</li>
          <li><b>Comisión TakeasyGO del pedido</b> = el % normal sobre productos + envío (Mercado Pago y transferencia por igual).</li>
          <li>La comisión total (pedido + envío) se cobra <b>sola en el split</b> de Mercado Pago, o entra en el <b>saldo semanal</b> que el comercio paga en transferencia y efectivo.</li>
          <li>Rapiboy le factura al comercio. El <b>costo real</b> se conoce al pedir el repartidor: si baja o sobra colchón, la diferencia queda al comercio; si sube, la absorbe el comercio (o el cliente si acepta el precio nuevo). La comisión de TakeasyGO no cambia.</li>
        </ul>
      </details>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…</div>
      ) : error ? (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
      ) : !data || !t || t.orders === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hubo envíos Rapiboy en este período.</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Envíos" value={String(t.orders)} />
            <Stat label="Cobrado por envíos" value={money(t.deliveryChargedCents)} />
            <Stat label="Para Rapiboy (lo paga el comercio)" value={money(t.rapiboyCents)} />
            <Stat label="Comisión de envío TakeasyGO" value={money(t.deliveryFeeCents)} strong />
            <Stat label="Comisión TakeasyGO sobre los pedidos" value={money(t.orderFeeCents)} />
            <Stat label="Comisión TakeasyGO total" value={money(t.totalFeeCents)} strong />
            <Stat label="…cobrada sola en el split" value={money(t.viaMpSplitCents)} />
            <Stat label="…en saldo semanal de comercios" value={money(t.viaWeeklyBalanceCents)} />
            <Stat label="Colchones de transferencia" value={money(t.bufferCents)} />
            <Stat label="Resultado del envío para los comercios" value={money(t.merchantDeliveryResultCents)} />
            {t.notCollectedCents > 0 && <Stat label="Sin cobrar (sin pago o cancelados)" value={money(t.notCollectedCents)} />}
          </dl>
          {data.truncated && <p className="text-xs text-muted-foreground">Se muestran los 1000 pedidos más recientes; acotá el período para ver todo.</p>}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Comercio</th>
                  <th className="px-3 py-2">Medio</th>
                  <th className="px-3 py-2 text-right">Envío cobrado</th>
                  <th className="px-3 py-2 text-right">Rapiboy (checkout → real)</th>
                  <th className="px-3 py-2 text-right">Colchón</th>
                  <th className="px-3 py-2 text-right">Comisión envío</th>
                  <th className="px-3 py-2 text-right">Comisión pedido</th>
                  <th className="px-3 py-2 text-right">Total TakeasyGO</th>
                  <th className="px-3 py-2 text-right">Resultado comercio</th>
                  <th className="px-3 py-2">Cobro</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.orderId} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.orderNumber}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · {r.orderStatus}</div>
                    </td>
                    <td className="px-3 py-2">{r.tenantName}</td>
                    <td className="px-3 py-2">{METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.deliveryChargedCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(r.rapiboyQuotedCents)}
                      <div className="text-xs text-muted-foreground">{r.rapiboyActualCents === null ? 'viaje sin pedir' : `real ${money(r.rapiboyActualCents)}`}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.bufferCents > 0 ? money(r.bufferCents) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(r.deliveryFeeCents)}
                      {r.deliveryFeePercent > 0 && <div className="text-xs text-muted-foreground">{r.deliveryFeePercent}%</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.orderFeeCents)}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{money(r.totalFeeCents)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.merchantDeliveryResultCents < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>{money(r.merchantDeliveryResultCents)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${COLLECTION_LABEL[r.collection].cls}`}>{COLLECTION_LABEL[r.collection].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 tabular-nums ${strong ? 'text-lg font-black' : 'font-semibold'}`}>{value}</dd>
    </div>
  )
}
