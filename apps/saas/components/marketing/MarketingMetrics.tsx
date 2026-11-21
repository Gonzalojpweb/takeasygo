'use client'

// ============================================================================
// Panel de métricas de marketing (CP4, 21/11/2026)
// ============================================================================
// Mismo panel para el Super Admin (todos los comercios o uno) y para cada
// comercio (solo lo suyo). Datos: lib/placements/report.ts.
// Gráfico: una sola serie por día con selector de métrica (sin doble eje),
// tooltip por barra y tabla equivalente.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Eye, MousePointerClick, Users, PlayCircle, Loader2, Info } from 'lucide-react'
import type { MarketingReport, PieceRow } from '@/lib/placements/report'

const ACTION_LABEL: Record<string, string> = { add: 'Agregar', detail: 'Ver detalle', loyalty: 'Club', link: 'Link', card: 'Tarjeta', open: 'Abrir' }
const EXIT_LABEL: Record<string, string> = { close: 'Cerró', skip: 'Saltó', swipe: 'Deslizó', background: 'Segundo plano' }
const METRICS = [
  { key: 'impressions', label: 'Impresiones' },
  { key: 'views', label: 'Vistas de stories' },
  { key: 'taps', label: 'Toques' },
] as const
type MetricKey = (typeof METRICS)[number]['key']

const fmt = (n: number) => n.toLocaleString('es-AR')
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`)

function todayAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function minusDays(day: string, n: number): string {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10)
}
function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${Number(d)}/${Number(m)}`
}

interface Props {
  /** '/api/superadmin/marketing-metrics' o '/api/{slug}/marketing-metrics'. */
  endpoint: string
  /** Super Admin: muestra el filtro por comercio. */
  tenantFilter?: boolean
}

export default function MarketingMetrics({ endpoint, tenantFilter }: Props) {
  const [to, setTo] = useState(todayAR)
  const [from, setFrom] = useState(() => minusDays(todayAR(), 29))
  const [tenantId, setTenantId] = useState('')
  const [tenants, setTenants] = useState<Array<{ _id: string; name: string }>>([])
  const [data, setData] = useState<MarketingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<MetricKey>('impressions')

  useEffect(() => {
    if (!tenantFilter) return
    fetch('/api/superadmin/tenants')
      .then((r) => (r.ok ? r.json() : { tenants: [] }))
      .then((d) => setTenants((d.tenants || []).map((t: { _id: unknown; name: string }) => ({ _id: String(t._id), name: t.name }))))
      .catch(() => {})
  }, [tenantFilter])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ from, to, ...(tenantId ? { tenantId } : {}) })
      const res = await fetch(`${endpoint}?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error')
      setData(json)
    } catch (e) {
      setError((e as Error).message || 'No se pudieron cargar las métricas')
    } finally {
      setLoading(false)
    }
  }, [endpoint, from, to, tenantId])

  useEffect(() => { load() }, [load])

  const setPreset = (days: number) => { const t = todayAR(); setTo(t); setFrom(minusDays(t, days - 1)) }

  return (
    <div className="space-y-5 min-w-0">
      {/* Filtros: una fila arriba de todo */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&>*]:shrink-0">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setPreset(d)}
              className="min-h-[40px] rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted">
              Últimos {d} días
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Desde
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-base sm:text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Hasta
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-base sm:text-sm text-foreground" />
          </label>
          {tenantFilter && (
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground sm:min-w-[220px]">
              Comercio
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-base sm:text-sm text-foreground">
                <option value="">Todos (incluye TakeasyGO)</option>
                {tenants.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Cargando métricas…</div>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>
      ) : data && (data.pieces.length > 0 || data.entries.length > 0) ? (
        <Report data={data} metric={metric} setMetric={setMetric} loading={loading} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todavía no hay datos en este período. Las métricas se registran desde el 21/11/2026.
        </div>
      )}
    </div>
  )
}

function Report({ data, metric, setMetric, loading }: { data: MarketingReport; metric: MetricKey; setMetric: (m: MetricKey) => void; loading: boolean }) {
  const t = data.totals
  const stories = data.pieces.filter((p) => p.views > 0 || p.placement === 'menu_story' || p.placement === 'menu_promo_story' || p.placement === 'app_story')
  const cards = data.pieces.filter((p) => !stories.includes(p))

  return (
    <div className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={<Eye size={15} />} label="Impresiones" value={fmt(t.impressions)} hint="Tarjeta o círculo visible al 50 % durante 1 s" />
        <Stat icon={<Users size={15} />} label="Alcance" value={fmt(t.reach)} hint="Suma de sesiones únicas por día" />
        <Stat icon={<PlayCircle size={15} />} label="Vistas de stories" value={fmt(t.views)} hint="Story en pantalla 1 s o más" />
        <Stat icon={<BarChart3 size={15} />} label="Completadas" value={pct(t.completionRate)} hint={`${fmt(t.completes)} stories vistas hasta el final`} />
        <Stat icon={<MousePointerClick size={15} />} label="Toques" value={fmt(t.taps)} hint={`${fmt(t.tapsUnique)} únicos por sesión y día`} />
      </dl>

      <DailyChart data={data.daily} metric={metric} setMetric={setMetric} />

      {data.entries.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="font-bold">Círculos de stories en el menú</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Cuánta gente ve el círculo y cuánta lo abre.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.entries.map((e) => (
              <div key={e.placement} className="rounded-xl border border-border p-3">
                <p className="text-sm font-semibold">{e.placementLabel}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Lo vieron" value={fmt(e.reach)} />
                  <MiniStat label="Lo abrieron" value={fmt(e.opens)} />
                  <MiniStat label="Apertura" value={pct(e.openRate)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stories.length > 0 && <PiecesTable title="Stories" subtitle="Vistas, cuántas se ven completas y cuántas terminan en un toque." rows={stories} kind="story" />}
      {cards.length > 0 && <PiecesTable title="Tarjetas de promociones" subtitle="Impresiones, alcance y toques (CTR = toques únicos / alcance)." rows={cards} kind="card" />}

      {data.dropOff.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="font-bold">¿En qué story se va la gente?</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Salidas del visor según la posición de la story (1 = la primera).</p>
          <div className="mt-3 space-y-4">
            {data.dropOff.map((d) => {
              const max = Math.max(1, ...d.byIndex.map((b) => b.exits))
              return (
                <div key={d.placement}>
                  <p className="mb-2 text-sm font-semibold">{d.placementLabel}</p>
                  <ul className="space-y-1.5">
                    {d.byIndex.map((b) => (
                      <li key={b.index} className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Story {b.index + 1}</span>
                        <span className="h-3 rounded-r-[4px] bg-primary/80" style={{ width: `${Math.max(2, (b.exits / max) * 100)}%` }} />
                        <span className="text-right tabular-nums">{fmt(b.exits)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        Sin datos personales: solo contadores por día. El alcance suma las sesiones únicas de cada día (quien vuelve otro día cuenta de nuevo).
      </p>
    </div>
  )
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4" title={hint}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className="mt-1 text-xl sm:text-2xl font-black tabular-nums">{value}</dd>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function DailyChart({ data, metric, setMetric }: { data: MarketingReport['daily']; metric: MetricKey; setMetric: (m: MetricKey) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const values = useMemo(() => data.map((d) => d[metric]), [data, metric])
  const max = Math.max(1, ...values)
  const label = METRICS.find((m) => m.key === metric)!.label
  const h = hover !== null ? data[hover] : null

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-bold">{label} por día</h3>
        <div role="tablist" aria-label="Métrica" className="flex gap-1 rounded-xl bg-muted p-1 overflow-x-auto [scrollbar-width:none]">
          {METRICS.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}
              className={`shrink-0 min-h-[36px] rounded-lg px-3 text-xs font-semibold ${metric === m.key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en el período.</p>
      ) : (
        <>
          <div className="relative mt-4">
            {/* Tooltip */}
            <div className="pointer-events-none mb-2 h-5 text-xs text-muted-foreground" aria-live="polite">
              {h ? <span><b className="text-foreground">{shortDay(h.day)}</b> · {fmt(h[metric])} {label.toLowerCase()}</span> : <span>Máximo del período: {fmt(max)}</span>}
            </div>
            <div className="flex h-40 items-end gap-[2px] border-b border-border" onMouseLeave={() => setHover(null)}>
              {data.map((d, i) => (
                <button
                  key={d.day}
                  type="button"
                  aria-label={`${shortDay(d.day)}: ${fmt(d[metric])} ${label.toLowerCase()}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                  className="group relative flex h-full flex-1 items-end"
                >
                  <span
                    className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-primary' : 'bg-primary/70'}`}
                    style={{ height: `${d[metric] > 0 ? Math.max(2, (d[metric] / max) * 100) : 0}%` }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{shortDay(data[0].day)}</span>
              {data.length > 2 && <span>{shortDay(data[Math.floor(data.length / 2)].day)}</span>}
              <span>{shortDay(data[data.length - 1].day)}</span>
            </div>
          </div>
          <button type="button" onClick={() => setShowTable((v) => !v)} className="mt-3 text-xs font-semibold text-muted-foreground underline">
            {showTable ? 'Ocultar tabla' : 'Ver como tabla'}
          </button>
          {showTable && (
            <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr><th className="px-3 py-2">Día</th><th className="px-3 py-2 text-right">Impresiones</th><th className="px-3 py-2 text-right">Vistas</th><th className="px-3 py-2 text-right">Toques</th></tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.day} className="border-t border-border">
                      <td className="px-3 py-1.5">{shortDay(d.day)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.impressions)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.views)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.taps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function breakdown(map: Record<string, number>, labels: Record<string, string>): string {
  const entries = Object.entries(map)
  return entries.length ? entries.map(([k, v]) => `${labels[k] ?? k} ${fmt(v)}`).join(' · ') : '—'
}

function PiecesTable({ title, subtitle, rows, kind }: { title: string; subtitle: string; rows: PieceRow[]; kind: 'story' | 'card' }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>

      {/* Mobile: tarjetas */}
      <ul className="mt-3 space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={`${r.placement}-${r.pieceId}`} className="rounded-xl border border-border p-3">
            <p className="font-semibold break-words">{r.name}</p>
            <p className="text-[11px] text-muted-foreground">{r.placementLabel}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {kind === 'story' ? (
                <>
                  <MiniStat label="Vistas" value={fmt(r.views)} />
                  <MiniStat label="Completas" value={pct(r.completionRate)} />
                  <MiniStat label="Toques" value={fmt(r.taps)} />
                </>
              ) : (
                <>
                  <MiniStat label="Impresiones" value={fmt(r.impressions)} />
                  <MiniStat label="Alcance" value={fmt(r.reach)} />
                  <MiniStat label="CTR" value={pct(r.ctr)} />
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground break-words">
              {kind === 'story' ? `Salidas: ${breakdown(r.exitsBy, EXIT_LABEL)}` : `Toques: ${breakdown(r.tapsBy, ACTION_LABEL)}`}
            </p>
          </li>
        ))}
      </ul>

      {/* Desde tablet: tabla */}
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">{kind === 'story' ? 'Story' : 'Promoción'}</th>
              <th className="py-2 pr-3 font-medium">Dónde</th>
              {kind === 'story' ? (
                <>
                  <th className="py-2 pr-3 text-right font-medium">Vistas</th>
                  <th className="py-2 pr-3 text-right font-medium">Completas</th>
                  <th className="py-2 pr-3 text-right font-medium">Toques</th>
                  <th className="py-2 pr-3 text-right font-medium">CTR</th>
                  <th className="py-2 font-medium">Salidas</th>
                </>
              ) : (
                <>
                  <th className="py-2 pr-3 text-right font-medium">Impresiones</th>
                  <th className="py-2 pr-3 text-right font-medium">Alcance</th>
                  <th className="py-2 pr-3 text-right font-medium">Toques</th>
                  <th className="py-2 pr-3 text-right font-medium">CTR</th>
                  <th className="py-2 font-medium">Por acción</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.placement}-${r.pieceId}`} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3 font-semibold">{r.name}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">{r.placementLabel}</td>
                {kind === 'story' ? (
                  <>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.views)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(r.completionRate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.taps)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(r.ctr)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{breakdown(r.exitsBy, EXIT_LABEL)}</td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.impressions)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.reach)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.taps)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(r.ctr)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{breakdown(r.tapsBy, ACTION_LABEL)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
