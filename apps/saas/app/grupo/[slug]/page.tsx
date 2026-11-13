import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BarChart3, Store, TrendingDown, TrendingUp, Flame, Wallet, ShoppingBag, Receipt, Users, Percent, Ban, Columns3, UserCheck, HeartHandshake, BookOpen } from 'lucide-react'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { DASHBOARD_PERIODS, loadOrgDashboard, parseDashboardQuery, SALE_CHANNELS, type OrgDashboard } from '@/lib/organizations/dashboard'
import Delta from '@/components/grupo/Delta'
import DashboardFilters from '@/components/grupo/DashboardFilters'
import DashboardActions from '@/components/grupo/DashboardActions'
import { Suspense } from 'react'
import { Types } from 'mongoose'
import OrgMembership from '@/models/OrgMembership'
import Organization from '@/models/Organization'
import { weeklySummaryEnabled } from '@/lib/organizations/weekly-summary'
import SalesTrendChart from '@/components/grupo/SalesTrendChart'
import LocationCompareTable from '@/components/grupo/LocationCompareTable'
import { BRAND_COLORS, CHANNEL_LABEL, METHOD_LABEL, fmtDate, money, moneyShort } from '@/components/grupo/format'

// /grupo/[slug]: vista 360 del dueño — cómo viene facturando el grupo y dónde
// está la plata, sin entrar comercio por comercio. Solo lectura.
// Detrás de org.dashboard (apagado = 404). Alcance y rol: lib/organizations/dashboard.

export const dynamic = 'force-dynamic'

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function Kpi({ icon: Icon, label, value, cur, prev, hint, inverse }: { icon: typeof Wallet; label: string; value: string; cur: number; prev: number; hint?: string; inverse?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Icon size={13} /> {label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <Delta cur={cur} prev={prev} inverse={inverse} />
        {hint && <span>{hint}</span>}
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children, aside }: { title: string; icon?: typeof Wallet; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">{Icon && <Icon size={16} />} {title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Bar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  return <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted"><span className={`block h-full ${color}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></span>
}

/** Frase de lectura rápida: quién empuja y dónde cae. */
function Highlights({ d }: { d: OrgDashboard }) {
  const moves = d.locations.map(l => ({ ...l, diff: l.revenue - l.prevRevenue })).filter(l => l.prevRevenue > 0 || l.revenue > 0)
  const up = [...moves].sort((a, b) => b.diff - a.diff)[0]
  const down = [...moves].sort((a, b) => a.diff - b.diff)[0]
  const silent = d.locations.filter(l => l.revenue === 0 && l.prevRevenue > 0)
  const many = d.locations.length > 1
  const label = (l: { brandName: string; name: string }) => (d.brands.length > 1 ? `${l.brandName} · ${l.name}` : l.name)
  if (!many) return null
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {up && up.diff > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><TrendingUp size={14} /> Quién empuja</p>
          <p className="mt-1 font-semibold text-foreground">{label(up)}</p>
          <p className="text-sm text-muted-foreground">+{money(up.diff)} <Delta cur={up.revenue} prev={up.prevRevenue} /></p>
        </div>
      )}
      {down && down.diff < 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400"><TrendingDown size={14} /> Dónde cae más</p>
          <p className="mt-1 font-semibold text-foreground">{label(down)}</p>
          <p className="text-sm text-muted-foreground">−{money(-down.diff)} <Delta cur={down.revenue} prev={down.prevRevenue} /></p>
        </div>
      )}
      {silent.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"><Ban size={14} /> Sin ventas en el período</p>
          <p className="mt-1 text-sm text-foreground">{silent.slice(0, 4).map(label).join(' · ')}{silent.length > 4 ? ` y ${silent.length - 4} más` : ''}</p>
          <p className="text-xs text-muted-foreground">En el período anterior sí vendieron.</p>
        </div>
      )}
    </div>
  )
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(0, ...grid.flat())
  if (!max) return <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
  const hours = Array.from({ length: 24 }, (_, h) => h).filter(h => WEEK_ORDER.some(d => grid[d][h] > 0))
  const from = Math.min(...hours), to = Math.max(...hours)
  const shown = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const peak = WEEK_ORDER.flatMap(d => shown.map(h => ({ d, h, v: grid[d][h] }))).sort((a, b) => b.v - a.v)[0]
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px]">
          <thead>
            <tr><th />{shown.map(h => <th key={h} className="w-7 font-normal text-muted-foreground">{h}</th>)}</tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map(d => (
              <tr key={d}>
                <th className="pr-1 text-right font-medium text-muted-foreground">{WEEKDAYS[d]}</th>
                {shown.map(h => {
                  const v = grid[d][h]
                  const a = v ? 0.12 + 0.88 * (v / max) : 0
                  return <td key={h} title={`${WEEKDAYS[d]} ${h}:00 · ${money(v)}`} className="h-6 w-7 rounded-sm bg-muted" style={a ? { backgroundColor: `rgba(37, 99, 235, ${a.toFixed(2)})` } : undefined} />
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {peak && <p className="text-xs text-muted-foreground">Pico: <span className="font-semibold text-foreground">{WEEKDAYS[peak.d]} de {peak.h} a {peak.h + 1} h</span> ({money(peak.v)} en el período).</p>}
    </div>
  )
}

/** Pasa período, fechas, marcas y sedes a la pantalla de personal. */
function personalQuery(sp: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const k of ['periodo', 'desde', 'hasta', 'marcas', 'sedes']) if (sp[k]) q.set(k, sp[k]!)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export default async function GrupoDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; marcas?: string; sedes?: string }>
}) {
  if ((await getOrgDashboardMode()) !== 'on') notFound()
  const { slug } = await params
  const user = await getSessionUser()
  if (!user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/grupo/${slug}`)}`)

  const sp = await searchParams
  const { period, options } = parseDashboardQuery(k => (sp as Record<string, string | undefined>)[k])
  const result = await loadOrgDashboard(user.id, slug, period, options)
  // No confirma si la organización existe para quien no es miembro.
  if (!result.ok && result.reason === 'not_member') notFound()

  // Resumen de los lunes: estado de la membresía de quien mira.
  let summaryOn = true
  if (result.ok && Types.ObjectId.isValid(String(user.id))) {
    const org = await Organization.findOne({ slug }).select('_id').lean<{ _id: Types.ObjectId }>()
    const m = org ? await OrgMembership.findOne({ organizationId: org._id, userId: new Types.ObjectId(String(user.id)), status: 'active' }).select('weeklySummary').lean<{ weeklySummary?: { enabled?: boolean | null } | null }>() : null
    summaryOn = m ? weeklySummaryEnabled(m) : false
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        <Link href="/grupo?lista=1" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mis organizaciones
        </Link>

        {!result.ok ? (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
            Tu rol en esta organización no incluye los números del grupo.
          </div>
        ) : (() => {
          const d = result.data
          const t = d.totals, p = d.compare.totals
          const rangeText = d.range.from === d.range.to ? fmtDate(d.range.from) : `${fmtDate(d.range.from)} al ${fmtDate(d.range.to)}`
          const maxLoc = Math.max(0, ...d.locations.map(l => l.revenue))
          const moves = d.products.map(x => ({ ...x, diff: x.revenue - x.prevRevenue }))
          const rising = moves.filter(x => x.diff > 0 && x.prevRevenue > 0).sort((a, b) => b.diff - a.diff).slice(0, 5)
          const falling = moves.filter(x => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5)
          const maxCat = Math.max(0, ...d.categories.map(c => c.revenue))
          const showBrandCol = d.brands.length > 1
          return (
            <>
              <header className="space-y-4">
                <div>
                  <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    <BarChart3 className="text-primary" size={28} /> {d.organization.name}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{rangeText} · {d.compare.label} ({d.compare.range.from === d.compare.range.to ? fmtDate(d.compare.range.from) : `${fmtDate(d.compare.range.from)} al ${fmtDate(d.compare.range.to)}`})</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Suspense fallback={null}><DashboardActions slug={slug} summaryEnabled={summaryOn} /></Suspense>
                  <Link href={`/grupo/${slug}/personal${personalQuery(sp)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted">
                    <UserCheck size={15} /> Actividad del personal
                  </Link>
                  <Link href={`/grupo/${slug}/crm`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted">
                    <HeartHandshake size={15} /> Clientes del grupo
                  </Link>
                  {(d.orgRole === 'owner' || d.orgRole === 'org_admin' || d.orgRole === 'brand_manager') && (
                    <Link href={`/grupo/${slug}/catalogo`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted">
                      <BookOpen size={15} /> Carta del grupo
                    </Link>
                  )}
                </div>
                <DashboardFilters periods={DASHBOARD_PERIODS} period={d.period} range={d.range} available={d.filters.available} brands={d.filters.brands} locations={d.filters.locations} />
              </header>

              {/* ── Etapa 1: cómo vengo ─────────────────────────────────── */}
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Wallet} label="Facturación" value={money(t.revenue)} cur={t.revenue} prev={p.revenue} hint={`antes ${moneyShort(p.revenue)}`} />
                <Kpi icon={Receipt} label="Ventas" value={t.sales.toLocaleString('es-AR')} cur={t.sales} prev={p.sales} hint={`antes ${p.sales.toLocaleString('es-AR')}`} />
                <Kpi icon={ShoppingBag} label="Ticket promedio" value={money(t.avgTicket)} cur={t.avgTicket} prev={p.avgTicket} />
                <Kpi icon={Users} label="Comensales en salón" value={t.guests.toLocaleString('es-AR')} cur={t.guests} prev={p.guests} hint={t.guests ? `${money(t.perGuest)} c/u` : undefined} />
              </section>

              <Highlights d={d} />

              <Section title={d.series.unit === 'hour' ? 'Facturación por hora' : 'Facturación por día'} icon={TrendingUp}>
                <SalesTrendChart unit={d.series.unit} labels={d.series.labels} prevTotal={d.series.prevTotal} byBrand={d.series.byBrand} compareLabel={d.compare.label} />
              </Section>

              <Section title="Ranking de sedes" icon={Store} aside={<span className="text-xs text-muted-foreground">{d.locations.length} {d.locations.length === 1 ? 'sede' : 'sedes'}</span>}>
                {d.locations.length === 0 ? <p className="text-sm text-muted-foreground">Tu rol no incluye ninguna marca todavía.</p> : (
                  <div className="-mx-4 overflow-x-auto sm:mx-0">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">Sede</th>
                          <th className="px-3 py-2 text-right font-medium">Facturación</th>
                          <th className="px-3 py-2 text-right font-medium">Variación</th>
                          <th className="px-3 py-2 text-right font-medium">Ventas</th>
                          <th className="px-3 py-2 text-right font-medium">Ticket</th>
                          <th className="w-32 px-3 py-2 text-right font-medium">Del total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.locations.map((l, i) => (
                          <tr key={l.locationId} className="border-t border-border">
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2">
                              <span className="font-medium text-foreground">{l.name}</span>
                              {showBrandCol && <span className="block text-xs text-muted-foreground">{l.brandName}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(l.revenue)}</td>
                            <td className="px-3 py-2 text-right"><Delta cur={l.revenue} prev={l.prevRevenue} /></td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.sales}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(l.avgTicket)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2"><Bar value={l.revenue} max={maxLoc} /><span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{l.share}%</span></div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {d.locations.filter(l => l.revenue > 0 || l.prevRevenue > 0).length > 1 && (
                <Section title="Comparar sedes" icon={Columns3} aside={<span className="text-xs text-muted-foreground">Mismo período, lado a lado</span>}>
                  <LocationCompareTable locations={d.locations} showBrand={showBrandCol} />
                </Section>
              )}

              {showBrandCol && (
                <Section title="Por marca">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {d.brands.map(b => {
                      const color = BRAND_COLORS[d.series.byBrand.findIndex(x => x.slug === b.slug) % BRAND_COLORS.length]
                      return (
                        <div key={b.slug} className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 font-semibold text-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{b.name}</p>
                            <Link href={`/${b.slug}/admin`} className="text-xs text-primary hover:underline">Ir al panel</Link>
                          </div>
                          <p className="mt-2 text-xl font-bold tabular-nums">{money(b.totals.revenue)}</p>
                          <p className="text-xs text-muted-foreground"><Delta cur={b.totals.revenue} prev={b.prevTotals.revenue} /> · {b.totals.sales} ventas · ticket {money(b.totals.avgTicket)}</p>
                          {b.margin ? (
                            <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Margen {b.margin.marginPct.toLocaleString('es-AR')}%</span> sobre el {b.margin.coveragePct}% de las ventas con receta cargada</p>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">Margen: cargá recetas en Inventario para verlo.</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}

              {/* ── Etapa 2: dónde está la plata ─────────────────────────── */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Productos que más facturan" icon={Flame}>
                  {d.products.length === 0 ? <p className="text-sm text-muted-foreground">Sin ventas en el período.</p> : (
                    <ol className="space-y-2">
                      {d.products.filter(x => x.revenue > 0).slice(0, 10).map((x, i) => (
                        <li key={x.name} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0"><span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span><span className="font-medium text-foreground">{x.name}</span>
                            {showBrandCol && <span className="block truncate pl-6 text-xs text-muted-foreground">{x.brands.join(' · ')} · {x.quantity} u.</span>}
                          </span>
                          <span className="shrink-0 text-right"><span className="block font-semibold tabular-nums">{money(x.revenue)}</span><Delta cur={x.revenue} prev={x.prevRevenue} /></span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>

                <Section title="Lo que más se movió">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><TrendingUp size={13} /> Suben</p>
                      {rising.length === 0 ? <p className="text-xs text-muted-foreground">Nada sube contra el período anterior.</p> : (
                        <ul className="space-y-1.5 text-sm">{rising.map(x => <li key={x.name} className="flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="shrink-0 tabular-nums text-emerald-700 dark:text-emerald-400">+{moneyShort(x.diff)}</span></li>)}</ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400"><TrendingDown size={13} /> Bajan</p>
                      {falling.length === 0 ? <p className="text-xs text-muted-foreground">Nada baja contra el período anterior.</p> : (
                        <ul className="space-y-1.5 text-sm">{falling.map(x => <li key={x.name} className="flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="shrink-0 tabular-nums text-rose-700 dark:text-rose-400">−{moneyShort(-x.diff)}</span></li>)}</ul>
                      )}
                    </div>
                  </div>
                </Section>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Categorías">
                  {d.categories.filter(c => c.revenue > 0).length === 0 ? <p className="text-sm text-muted-foreground">Sin ventas en el período.</p> : (
                    <ul className="space-y-2.5">
                      {d.categories.filter(c => c.revenue > 0).slice(0, 12).map(c => (
                        <li key={c.category} className="space-y-1 text-sm">
                          <div className="flex items-center justify-between gap-2"><span className="font-medium text-foreground">{c.category}</span><span className="flex items-center gap-2"><span className="tabular-nums">{money(c.revenue)}</span><Delta cur={c.revenue} prev={c.prevRevenue} /></span></div>
                          <Bar value={c.revenue} max={maxCat} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Horas pico" aside={<span className="text-xs text-muted-foreground">Facturación por día y hora</span>}>
                  <Heatmap grid={d.heatmap} />
                </Section>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Section title="Por canal">
                  <table className="w-full text-sm">
                    <tbody>
                      {SALE_CHANNELS.filter(c => d.byChannel[c].sales > 0 || d.prevByChannel[c].sales > 0).map(c => (
                        <tr key={c} className="border-t border-border first:border-0">
                          <td className="py-2">{CHANNEL_LABEL[c]}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{d.byChannel[c].sales}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{money(d.byChannel[c].revenue)}</td>
                          <td className="py-2 pl-2 text-right"><Delta cur={d.byChannel[c].revenue} prev={d.prevByChannel[c].revenue} /></td>
                        </tr>
                      ))}
                      {SALE_CHANNELS.every(c => d.byChannel[c].sales === 0 && d.prevByChannel[c].sales === 0) && <tr><td className="py-2 text-muted-foreground">Sin ventas en el período.</td></tr>}
                    </tbody>
                  </table>
                </Section>
                <Section title="Por medio de pago">
                  <table className="w-full text-sm">
                    <tbody>
                      {d.byPayment.map(m => (
                        <tr key={m.method} className="border-t border-border first:border-0">
                          <td className="py-2">{METHOD_LABEL[m.method] ?? m.method}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{m.count}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{money(m.amount)}</td>
                          <td className="py-2 pl-2 text-right"><Delta cur={m.amount} prev={m.prevAmount} /></td>
                        </tr>
                      ))}
                      {d.byPayment.length === 0 && <tr><td className="py-2 text-muted-foreground">Sin ventas en el período.</td></tr>}
                    </tbody>
                  </table>
                </Section>
              </div>

              <Section title="Descuentos y anulaciones" icon={Percent}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Descuentos dados</p><p className="text-lg font-semibold tabular-nums">{money(d.extras.discounts)}</p><Delta cur={d.extras.discounts} prev={d.compare.extras.discounts} inverse /></div>
                  <div><p className="text-xs text-muted-foreground">Ventas anuladas</p><p className="text-lg font-semibold tabular-nums">{d.extras.voided.count} · {money(d.extras.voided.amount)}</p><Delta cur={d.extras.voided.amount} prev={d.compare.extras.voided.amount} inverse /></div>
                  <div><p className="text-xs text-muted-foreground">Platos anulados</p><p className="text-lg font-semibold tabular-nums">{d.extras.itemVoids.count} · {money(d.extras.itemVoids.amount)}</p><Delta cur={d.extras.itemVoids.amount} prev={d.compare.extras.itemVoids.amount} inverse /></div>
                </div>
              </Section>

              <p className="text-xs text-muted-foreground">Mismos números que el panel de cada marca. Las ventas anuladas y los pedidos sin cobrar no cuentan. El margen es teórico: sale de las recetas y los costos cargados en Inventario.</p>
            </>
          )
        })()}
      </div>
    </main>
  )
}
