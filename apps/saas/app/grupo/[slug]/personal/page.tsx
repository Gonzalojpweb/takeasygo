import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ChevronDown, UserCheck } from 'lucide-react'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { DASHBOARD_PERIODS, parseDashboardQuery } from '@/lib/organizations/dashboard'
import { loadStaffActivity, type StaffCounters, type StaffFlag } from '@/lib/organizations/staff-activity'
import DashboardFilters from '@/components/grupo/DashboardFilters'
import Delta from '@/components/grupo/Delta'
import { fmtDate, money } from '@/components/grupo/format'

// Actividad del personal (F6): qué hizo cada persona en las sedes del grupo
// que tu rol cubre — cobros, anulaciones, cajas y movimientos de caja.
// Mismo alcance y mismos filtros que la vista 360.

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', manager: 'Encargado', operations_manager: 'Jefe de operaciones', kitchen_lead: 'Jefe de cocina',
  cashier: 'Cajero', waiter: 'Mozo', staff: 'Personal', host: 'Recepción', auditor: 'Auditor', seller: 'Vendedor', member: 'Miembro del grupo',
}

const FLAG_LABEL: Record<StaffFlag, string> = {
  many_voids: 'Anula muchas ventas',
  many_item_voids: 'Anula muchos platos',
  cash_difference: 'Cierres con diferencia',
}

function signedMoney(cents: number): string {
  if (cents === 0) return money(0)
  return `${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}`
}

function CountersGrid({ c }: { c: StaffCounters }) {
  const cells: { label: string; value: string; hint?: string; warn?: boolean }[] = [
    { label: 'Cobró', value: money(c.payments.amount), hint: `${c.payments.count} ${c.payments.count === 1 ? 'venta' : 'ventas'}` },
    { label: 'Ventas anuladas', value: `${c.voidsRequested.count}`, hint: c.voidsRequested.count ? money(c.voidsRequested.amount) : undefined, warn: c.voidsRequested.count > 0 },
    { label: 'Anulaciones que aprobó', value: `${c.voidsApproved}`, hint: 'De otras personas' },
    { label: 'Platos anulados', value: `${c.itemVoids.count}`, hint: c.itemVoids.count ? `${money(c.itemVoids.amount)}${c.itemVoids.wasted ? ` · ${c.itemVoids.wasted} a merma` : ''}` : undefined, warn: c.itemVoids.count > 0 },
    { label: 'Cajas', value: `${c.registersOpened} abiertas · ${c.registersClosed} cerradas` },
    { label: 'Diferencia de caja', value: signedMoney(c.cashDifference), hint: c.closesWithDifference ? `${c.closesWithDifference} ${c.closesWithDifference === 1 ? 'cierre' : 'cierres'} con diferencia` : 'Sin diferencias', warn: c.closesWithDifference > 0 },
    { label: 'Gastos', value: money(c.expenses.amount), hint: `${c.expenses.count} movimientos` },
    { label: 'Retiros e ingresos', value: `${money(c.withdrawals.amount)} · ${money(c.deposits.amount)}`, hint: `${c.withdrawals.count} retiros · ${c.deposits.count} ingresos` },
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {cells.map(x => (
        <div key={x.label}>
          <dt className="text-xs text-muted-foreground">{x.label}</dt>
          <dd className={`text-sm font-semibold tabular-nums ${x.warn ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}`}>{x.value}</dd>
          {x.hint && <dd className="text-xs text-muted-foreground">{x.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

export default async function GrupoPersonalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if ((await getOrgDashboardMode()) !== 'on') notFound()
  const { slug } = await params
  const user = await getSessionUser()
  if (!user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/grupo/${slug}/personal`)}`)

  const sp = await searchParams
  const { period, options } = parseDashboardQuery(k => sp[k])
  const result = await loadStaffActivity(user.id, slug, period, options)
  if (!result.ok && result.reason === 'not_member') notFound()

  const back = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string')).toString()

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        <Link href={`/grupo/${slug}${back ? `?${back}` : ''}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Volver a los números del grupo
        </Link>

        {!result.ok ? (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
            Tu rol en esta organización no incluye la actividad del personal.
          </div>
        ) : (() => {
          const d = result.data
          const rangeText = d.range.from === d.range.to ? fmtDate(d.range.from) : `${fmtDate(d.range.from)} al ${fmtDate(d.range.to)}`
          const flagged = d.people.filter(p => p.flags.length > 0)
          return (
            <>
              <header className="space-y-4">
                <div>
                  <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    <UserCheck className="text-primary" size={28} /> Actividad del personal
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{d.organization.name} · {rangeText} · variación {d.compare.label}</p>
                </div>
                <DashboardFilters periods={DASHBOARD_PERIODS} period={d.period} range={d.range} available={d.filters.available} brands={d.filters.brands} locations={d.filters.locations} />
              </header>

              {flagged.length > 0 && (
                <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30" aria-labelledby="revisar">
                  <h2 id="revisar" className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle size={16} /> Para mirar</h2>
                  <ul className="mt-2 space-y-1 text-amber-900 dark:text-amber-100">
                    {flagged.map(p => <li key={p.userId}><span className="font-medium">{p.name}</span>: {p.flags.map(f => FLAG_LABEL[f]).join(' · ')}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">No significa que haya un problema: son cosas que conviene revisar con la persona o en el cierre de caja.</p>
                </section>
              )}

              {d.people.length === 0 ? (
                <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
                  Nadie cobró, anuló ni abrió una caja en el período y las sedes elegidas.
                </div>
              ) : (
                <ul className="space-y-3" aria-label="Personas">
                  {d.people.map(p => (
                    <li key={p.userId} className="rounded-2xl border border-border bg-card">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-foreground">{p.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {p.role ? ROLE_LABEL[p.role] ?? p.role : 'Rol desconocido'} · {p.locations.length === 1 ? p.locations[0].locationName : `${p.locations.length} sedes`}
                            </span>
                            {p.flags.length > 0 && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {p.flags.map(f => <span key={f} className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">{FLAG_LABEL[f]}</span>)}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-semibold tabular-nums">{money(p.totals.payments.amount)}</span>
                            <span className="block text-xs text-muted-foreground">{p.totals.payments.count} ventas <Delta cur={p.totals.payments.amount} prev={p.prevTotals.payments.amount} /></span>
                          </span>
                          <ChevronDown size={18} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="space-y-4 border-t border-border p-4">
                          <CountersGrid c={p.totals} />
                          {p.locations.length > 1 && (
                            <div className="space-y-3">
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por sede</h3>
                              {p.locations.map(l => (
                                <div key={l.locationId} className="rounded-xl border border-border p-3">
                                  <p className="mb-2 text-sm font-medium text-foreground">{l.locationName} <span className="text-xs font-normal text-muted-foreground">· {l.brandName}</span></p>
                                  <CountersGrid c={l} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}

              {d.truncated && <p className="text-xs text-muted-foreground">Se muestran las {d.people.length} personas con más cobros. Filtrá por marca o sede para ver el resto.</p>}
              <p className="text-xs text-muted-foreground">
                Sale de lo registrado en el POS: cobros (sin ventas anuladas), anulaciones, aperturas y cierres de caja, gastos, retiros e ingresos.
                La diferencia de caja es la del arqueo al cerrar: positivo sobró, negativo faltó.
              </p>
            </>
          )
        })()}
      </div>
    </main>
  )
}
