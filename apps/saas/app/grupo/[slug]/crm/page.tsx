import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, HeartHandshake, Lock } from 'lucide-react'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { loadGroupCrm } from '@/lib/organizations/group-crm'
import { money } from '@/components/grupo/format'

// CRM del grupo (F7 nivel 1): clientes que compran en más de una marca.
// Números para los roles de la vista 360; la lista con nombre (y últimos 4
// dígitos del teléfono) solo para propietario y administrador general.
// Filtros por formulario GET: funciona sin JavaScript.

export const dynamic = 'force-dynamic'

const DAYS = [30, 60, 90, 180, 365]

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default async function GrupoCrmPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if ((await getOrgDashboardMode()) !== 'on') notFound()
  const { slug } = await params
  const user = await getSessionUser()
  if (!user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/grupo/${slug}/crm`)}`)

  const sp = await searchParams
  const result = await loadGroupCrm(user.id, slug, (k) => sp[k])
  if (!result.ok && result.reason === 'not_member') notFound()

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        <Link href={`/grupo/${slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Volver a los números del grupo
        </Link>

        {!result.ok ? (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">Tu rol en esta organización no incluye los clientes del grupo.</div>
        ) : (() => {
          const d = result.data
          const s = d.stats
          const many = d.brands.length > 1
          const brandName = (id: string) => d.brands.find((b) => b.tenantId === id)?.name ?? '—'
          const filtered = d.filter.went.length + d.filter.notWent.length > 0 || d.filter.minBrands > 1 || d.filter.activeDays !== null
          return (
            <>
              <header>
                <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  <HeartHandshake className="text-primary" size={28} /> Clientes del grupo
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {d.organization.name} · clientes identificados por teléfono en el CRM de cada marca, de siempre. Cada marca sigue con su club y sus puntos.
                </p>
              </header>

              {s.customers === 0 ? (
                <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">Todavía no hay clientes identificados en las marcas que cubre tu rol.</div>
              ) : (
                <>
                  <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Clientes" value={s.customers.toLocaleString('es-AR')} />
                    <Stat label="Compran en 2 o más marcas" value={`${(s.byBrandCount[1] + s.byBrandCount[2]).toLocaleString('es-AR')}`} hint={`${s.multiBrandPct.toLocaleString('es-AR')}% del total`} />
                    <Stat label="Gasto promedio · una marca" value={money(s.single.avgSpent)} hint={`${s.single.avgOrders.toLocaleString('es-AR')} pedidos en promedio`} />
                    <Stat label="Gasto promedio · varias marcas" value={money(s.multi.avgSpent)} hint={`${s.multi.avgOrders.toLocaleString('es-AR')} pedidos en promedio`} />
                  </section>

                  {many && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
                        <h2 className="font-semibold text-foreground">Por marca</h2>
                        <table className="w-full text-sm">
                          <thead className="text-xs text-muted-foreground">
                            <tr>
                              <th scope="col" className="py-1 text-left font-medium">Marca</th>
                              <th scope="col" className="py-1 text-right font-medium">Clientes</th>
                              <th scope="col" className="py-1 text-right font-medium">Solo esta</th>
                              <th scope="col" className="py-1 text-right font-medium">También otra</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.brands.map((b) => (
                              <tr key={b.tenantId} className="border-t border-border">
                                <th scope="row" className="py-2 text-left font-medium text-foreground">{brandName(b.tenantId)}</th>
                                <td className="py-2 text-right tabular-nums">{b.customers.toLocaleString('es-AR')}</td>
                                <td className="py-2 text-right tabular-nums">{b.exclusive.toLocaleString('es-AR')}</td>
                                <td className="py-2 text-right tabular-nums">{b.shared.toLocaleString('es-AR')} <span className="text-xs text-muted-foreground">({b.sharedPct.toLocaleString('es-AR')}%)</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>
                      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
                        <h2 className="font-semibold text-foreground">Clientes en común</h2>
                        <div className="-mx-4 overflow-x-auto sm:mx-0">
                          <table className="w-full min-w-[320px] text-sm">
                            <caption className="sr-only">Clientes que compraron en las dos marcas de cada cruce</caption>
                            <thead className="text-xs text-muted-foreground">
                              <tr>
                                <th scope="col" className="px-2 py-1 text-left font-medium"><span className="sr-only">Marca</span></th>
                                {d.brands.map((b) => <th key={b.tenantId} scope="col" className="px-2 py-1 text-right font-medium">{b.name}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {d.brands.map((row, i) => (
                                <tr key={row.tenantId} className="border-t border-border">
                                  <th scope="row" className="px-2 py-2 text-left font-medium text-foreground">{row.name}</th>
                                  {d.brands.map((col, j) => (
                                    <td key={col.tenantId} className="px-2 py-2 text-right tabular-nums">{i === j ? <span className="text-muted-foreground">—</span> : s.overlap[i][j].toLocaleString('es-AR')}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground">Cada celda: clientes que compraron en las dos marcas. Con 3 o más marcas hay {s.byBrandCount[2].toLocaleString('es-AR')}.</p>
                      </section>
                    </div>
                  )}

                  <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="segmento">
                    <h2 id="segmento" className="font-semibold text-foreground">Armar un grupo de clientes</h2>
                    <form method="get" className="space-y-4">
                      {many && (
                        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <legend className="mb-2 text-sm text-muted-foreground">Por marca: «fue» tiene que haber comprado ahí; «no fue», nunca.</legend>
                          {d.brands.map((b) => {
                            const v = d.filter.went.includes(b.tenantId) ? 'si' : d.filter.notWent.includes(b.tenantId) ? 'no' : ''
                            return (
                              <label key={b.tenantId} className="flex flex-col gap-1 text-sm">
                                <span className="font-medium text-foreground">{b.name}</span>
                                <select name={`m_${b.slug}`} defaultValue={v} className="min-h-10 rounded-lg border border-border bg-background px-3">
                                  <option value="">Da igual</option>
                                  <option value="si">Fue</option>
                                  <option value="no">No fue</option>
                                </select>
                              </label>
                            )
                          })}
                        </fieldset>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {many && (
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-foreground">Cantidad de marcas</span>
                            <select name="minimo" defaultValue={String(d.filter.minBrands)} className="min-h-10 rounded-lg border border-border bg-background px-3">
                              <option value="1">Cualquiera</option>
                              <option value="2">2 o más</option>
                              <option value="3">3 o más</option>
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-1 text-sm">
                          <span className="font-medium text-foreground">Última compra</span>
                          <select name="dias" defaultValue={d.filter.activeDays ? String(d.filter.activeDays) : ''} className="min-h-10 rounded-lg border border-border bg-background px-3">
                            <option value="">Cuando sea</option>
                            {DAYS.map((n) => <option key={n} value={n}>En los últimos {n} días</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Ver grupo</button>
                        {filtered && <Link href={`/grupo/${slug}/crm`} className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">Limpiar</Link>}
                      </div>
                    </form>

                    <div className="rounded-xl bg-muted/50 p-4">
                      <p className="text-2xl font-bold tabular-nums text-foreground">{s.segment.count.toLocaleString('es-AR')} <span className="text-base font-medium text-muted-foreground">clientes</span></p>
                      <p className="text-sm text-muted-foreground">
                        Gastaron {money(s.segment.spent)} en {s.segment.orders.toLocaleString('es-AR')} pedidos
                        {s.segment.count ? ` · ${money(Math.round(s.segment.spent / s.segment.count))} cada uno en promedio` : ''}
                      </p>
                    </div>

                    {d.list === null ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock size={14} /> La lista con nombres la ven el propietario y el administrador general del grupo.</p>
                    ) : d.list.length === 0 ? null : (
                      <div className="-mx-4 overflow-x-auto sm:mx-0">
                        <table className="w-full min-w-[640px] text-sm">
                          <caption className="sr-only">Clientes del grupo armado, de los que más gastaron a los que menos</caption>
                          <thead className="text-xs text-muted-foreground">
                            <tr>
                              <th scope="col" className="px-2 py-1 text-left font-medium">Cliente</th>
                              <th scope="col" className="px-2 py-1 text-left font-medium">Marcas</th>
                              <th scope="col" className="px-2 py-1 text-right font-medium">Pedidos</th>
                              <th scope="col" className="px-2 py-1 text-right font-medium">Gastó</th>
                              <th scope="col" className="px-2 py-1 text-right font-medium">Última compra</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.list.map((c, i) => (
                              <tr key={i} className="border-t border-border">
                                <td className="px-2 py-2">
                                  <span className="block font-medium text-foreground">{c.name}</span>
                                  {c.phone && <span className="block text-xs tabular-nums text-muted-foreground">{c.phone}</span>}
                                </td>
                                <td className="px-2 py-2 text-xs text-muted-foreground">{c.brands.map((b) => `${b.name} (${b.orders})`).join(' · ')}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{c.orders}</td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums">{money(c.spent)}</td>
                                <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                                  {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {d.listTruncated && <p className="mt-2 text-xs text-muted-foreground">Se muestran los 100 que más gastaron. Achicá el grupo con los filtros para ver otros.</p>}
                      </div>
                    )}
                  </section>
                </>
              )}

              <p className="text-xs text-muted-foreground">
                Sale del CRM de cada marca (clientes con teléfono). El teléfono completo no se muestra en ningún lado; para contactar a un cliente, hacelo desde el CRM de la marca.
              </p>
            </>
          )
        })()}
      </div>
    </main>
  )
}
