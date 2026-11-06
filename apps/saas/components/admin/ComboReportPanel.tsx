'use client'

import { Fragment, useEffect, useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'

// ============================================================================
// Rendimiento de los combos (piloto 06/11/2026)
// ============================================================================
// Embudo por combo: vistas → aperturas → agregados → vendidos, con
// facturación, ticket y conversión. Al abrir un combo: ventas por canal,
// platos más elegidos y serie por día. Datos de GET /combos/report.
// ============================================================================

type Channel = 'salon' | 'mostrador' | 'app' | 'delivery'
interface Row {
  comboId: string
  name: string
  isActive: boolean
  impressions: number
  uniqueViewers: number
  opens: number
  addsToCart: number
  orders: number
  units: number
  revenue: number
  avgTicket: number
  byChannel: Record<Channel, { units: number; revenue: number }>
  openRate: number | null
  addRate: number | null
  checkoutRate: number | null
  conversionRate: number | null
  topComponents: { name: string; quantity: number }[]
  byDay: { date: string; units: number; revenue: number }[]
}
interface Report {
  range: { from: string; to: string }
  totals: { impressions: number; opens: number; addsToCart: number; units: number; revenue: number; orders: number }
  combos: Row[]
}

const CHANNEL_LABEL: Record<Channel, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'Online', delivery: 'Delivery' }
const money = (cents: number) => `$${toPesos(cents).toLocaleString('es-AR')}`
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA')
}

const PRESETS = [
  { id: '7', label: 'Últimos 7 días', from: () => isoDaysAgo(6) },
  { id: '30', label: 'Últimos 30 días', from: () => isoDaysAgo(29) },
  { id: '90', label: 'Últimos 90 días', from: () => isoDaysAgo(89) },
] as const

export default function ComboReportPanel({ tenantSlug, locationId }: { tenantSlug: string; locationId: string }) {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('30')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!locationId) return
    const from = PRESETS.find((p) => p.id === preset)!.from()
    const to = isoDaysAgo(0)
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/${tenantSlug}/combos/report?locationId=${encodeURIComponent(locationId)}&from=${from}&to=${to}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el reporte')
        if (!cancelled) setReport(data as Report)
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tenantSlug, locationId, preset])

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-labelledby="combo-report-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="combo-report-title" className="flex items-center gap-2 text-lg font-bold"><BarChart3 size={18} aria-hidden /> Rendimiento de los combos</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${preset === p.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Cargando…</p>}
      {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

      {report && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Vistas', report.totals.impressions.toLocaleString('es-AR')],
              ['Aperturas', report.totals.opens.toLocaleString('es-AR')],
              ['Al carrito', report.totals.addsToCart.toLocaleString('es-AR')],
              ['Vendidos', report.totals.units.toLocaleString('es-AR')],
              ['Facturación', money(report.totals.revenue)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                <p className="text-xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {report.combos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay combos en esta sede.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">Combo</th>
                    <th className="py-2 pr-2 text-right" title="Veces que la tarjeta estuvo a la vista (una por sesión)">Vistas</th>
                    <th className="py-2 pr-2 text-right" title="Lo tocaron / vistas">Aperturas</th>
                    <th className="py-2 pr-2 text-right" title="Lo agregaron / aperturas">Al carrito</th>
                    <th className="py-2 pr-2 text-right">Vendidos</th>
                    <th className="py-2 pr-2 text-right">Facturación</th>
                    <th className="py-2 pr-2 text-right">Ticket</th>
                    <th className="py-2 pr-2 text-right" title="Compras online / vistas únicas">Conversión</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {report.combos.map((c) => {
                    const expanded = open === c.comboId
                    const maxDay = Math.max(1, ...c.byDay.map((d) => d.units))
                    return (
                      <Fragment key={c.comboId}>
                        <tr className="border-b border-border/60">
                          <td className="py-2 pr-2 font-semibold">{c.name}{!c.isActive && <span className="ml-2 text-xs text-muted-foreground">PAUSADO</span>}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{c.impressions}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{c.opens} <span className="text-xs text-muted-foreground">{pct(c.openRate)}</span></td>
                          <td className="py-2 pr-2 text-right tabular-nums">{c.addsToCart} <span className="text-xs text-muted-foreground">{pct(c.addRate)}</span></td>
                          <td className="py-2 pr-2 text-right font-semibold tabular-nums">{c.units}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{money(c.revenue)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{c.units > 0 ? money(c.avgTicket) : '—'}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{pct(c.conversionRate)}</td>
                          <td className="py-2 text-right">
                            <button type="button" className="rounded-lg p-1.5" aria-expanded={expanded} aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalle de ${c.name}`} onClick={() => setOpen(expanded ? null : c.comboId)}>
                              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-border/60 bg-muted/30">
                            <td colSpan={9} className="p-4">
                              <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                  <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Por canal</p>
                                  {(Object.keys(CHANNEL_LABEL) as Channel[]).filter((ch) => c.byChannel[ch].units > 0).map((ch) => (
                                    <p key={ch} className="flex justify-between text-sm"><span>{CHANNEL_LABEL[ch]}</span><span className="tabular-nums">{c.byChannel[ch].units} · {money(c.byChannel[ch].revenue)}</span></p>
                                  ))}
                                  {c.units === 0 && <p className="text-sm text-muted-foreground">Sin ventas en el período</p>}
                                  <p className="mt-2 text-xs text-muted-foreground">Carrito → compra online: {pct(c.checkoutRate)} · {c.orders} pedidos</p>
                                </div>
                                <div>
                                  <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Platos más elegidos</p>
                                  {c.topComponents.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : c.topComponents.map((p) => (
                                    <p key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span className="tabular-nums">{p.quantity}</span></p>
                                  ))}
                                </div>
                                <div>
                                  <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Vendidos por día</p>
                                  {c.byDay.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
                                    <ul className="space-y-1">
                                      {c.byDay.slice(-14).map((d) => (
                                        <li key={d.date} className="flex items-center gap-2 text-xs">
                                          <span className="w-12 tabular-nums text-muted-foreground">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
                                          <span className="h-2 rounded-full bg-primary" style={{ width: `${(d.units / maxDay) * 100}%`, minWidth: 4 }} aria-hidden />
                                          <span className="tabular-nums">{d.units}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Vistas, aperturas y carrito miden el menú online (sin datos personales). Vendidos y facturación suman todos los canales, incluido el POS.
          </p>
        </>
      )}
    </section>
  )
}
