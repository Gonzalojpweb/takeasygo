import { Fragment } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BarChart3, Store, MapPin } from 'lucide-react'
import { toPesos } from '@takeasygo/business'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { DASHBOARD_PERIODS, loadOrgDashboard, parsePeriod, type DashboardRow } from '@/lib/organizations/dashboard'
import type { SaleChannel } from '@/lib/metrics/sales'

// Multi-marca PR 10 — /grupo/[slug]: números del grupo, solo lectura.
// Detrás de org.dashboard (apagado = 404). Alcance y rol: lib/organizations/dashboard.

export const dynamic = 'force-dynamic'

const money = (cents: number) => `$${toPesos(cents).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const CHANNEL_LABEL: Record<SaleChannel, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Delivery externo' }
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', mercadopago: 'Mercado Pago', posnet_debit: 'Débito', posnet_credit: 'Crédito',
  transfer: 'Transferencia', kripton: 'Kripton', mixed: 'Mixto', otro: 'Otro',
}
const CHANNELS: SaleChannel[] = ['salon', 'mostrador', 'app', 'delivery']

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

function RowCells({ r }: { r: DashboardRow }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{r.totals.sales}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">{money(r.totals.revenue)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{money(r.totals.avgTicket)}</td>
    </>
  )
}

export default async function GrupoDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  if ((await getOrgDashboardMode()) !== 'on') notFound()
  const { slug } = await params
  const user = await getSessionUser()
  if (!user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/grupo/${slug}`)}`)

  const period = parsePeriod((await searchParams).periodo)
  const result = await loadOrgDashboard(user.id, slug, period)
  // No confirma si la organización existe para quien no es miembro.
  if (!result.ok && result.reason === 'not_member') notFound()

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <Link href="/grupo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mis organizaciones
        </Link>

        {!result.ok ? (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
            Tu rol en esta organización no incluye los números del grupo.
          </div>
        ) : (
          <>
            <header className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                <BarChart3 className="text-primary" size={28} />
                {result.data.organization.name}
              </h1>
              <nav className="flex flex-wrap gap-2" aria-label="Período">
                {DASHBOARD_PERIODS.map(p => (
                  <Link
                    key={p.id}
                    href={`/grupo/${slug}?periodo=${p.id}`}
                    className={`rounded-full px-3 py-1 text-sm border ${p.id === period ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-muted'}`}
                  >
                    {p.label}
                  </Link>
                ))}
              </nav>
              <p className="text-xs text-muted-foreground">
                {result.data.range.from === result.data.range.to
                  ? fmtDate(result.data.range.from)
                  : `${fmtDate(result.data.range.from)} al ${fmtDate(result.data.range.to)}`}
                {' · '}Mismos números que el panel de cada marca. Anuladas y pedidos sin cobrar no cuentan.
              </p>
            </header>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Facturación" value={money(result.data.totals.revenue)} />
              <Stat label="Ventas" value={String(result.data.totals.sales)} />
              <Stat label="Ticket promedio" value={money(result.data.totals.avgTicket)} />
              <Stat
                label="Comensales en salón"
                value={String(result.data.totals.guests)}
                hint={result.data.totals.guests ? `${money(result.data.totals.perGuest)} por comensal` : undefined}
              />
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-foreground flex items-center gap-2"><Store size={16} /> Por marca y sede</h2>
              {result.data.brands.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tu rol no incluye ninguna marca todavía.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="px-3 py-2 text-left">Marca / sede</th>
                        <th className="px-3 py-2 text-right">Ventas</th>
                        <th className="px-3 py-2 text-right">Facturación</th>
                        <th className="px-3 py-2 text-right">Ticket</th>
                        <th className="px-3 py-2 text-right">Participación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.brands.map(b => (
                        <Fragment key={b.slug}>
                          <tr className="border-t border-border font-semibold text-foreground">
                            <td className="px-3 py-2">{b.name}</td>
                            <RowCells r={b} />
                            <td className="px-3 py-2 text-right tabular-nums">
                              {result.data.totals.revenue ? `${Math.round((b.totals.revenue / result.data.totals.revenue) * 100)}%` : '—'}
                            </td>
                          </tr>
                          {b.locations.length > 1 && b.locations.map(l => (
                            <tr key={`${b.slug}-${l.name}`} className="text-muted-foreground">
                              <td className="px-3 py-1.5 pl-8"><span className="inline-flex items-center gap-1"><MapPin size={12} /> {l.name}</span></td>
                              <RowCells r={l} />
                              <td />
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="grid md:grid-cols-2 gap-4">
              <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="font-semibold text-foreground">Por canal</h2>
                <ul className="divide-y divide-border text-sm">
                  {CHANNELS.filter(c => result.data.byChannel[c].sales > 0).map(c => (
                    <li key={c} className="flex justify-between py-2">
                      <span>{CHANNEL_LABEL[c]}</span>
                      <span className="tabular-nums">{result.data.byChannel[c].sales} · {money(result.data.byChannel[c].revenue)}</span>
                    </li>
                  ))}
                  {CHANNELS.every(c => result.data.byChannel[c].sales === 0) && <li className="py-2 text-muted-foreground">Sin ventas en el período.</li>}
                </ul>
              </section>
              <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="font-semibold text-foreground">Por medio de pago</h2>
                <ul className="divide-y divide-border text-sm">
                  {result.data.byPayment.map(p => (
                    <li key={p.method} className="flex justify-between py-2">
                      <span>{METHOD_LABEL[p.method] ?? p.method}</span>
                      <span className="tabular-nums">{p.count} · {money(p.amount)}</span>
                    </li>
                  ))}
                  {result.data.byPayment.length === 0 && <li className="py-2 text-muted-foreground">Sin ventas en el período.</li>}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
