import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type mongoose from 'mongoose'
import { ArrowLeft, BarChart3, Download, Users, Lock } from 'lucide-react'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { formatCents } from '@takeasygo/business'
import { canAccess, requiredPlanFor, PLAN_LABELS, type Plan } from '@/lib/plans'
import { getPageScope } from '@/lib/page-scope'
import { requireCashPageSession } from '@/lib/cash/page-guard'
import { getBaseUrl } from '@/lib/site-url'
import { ReservationCustomerActions } from '@/components/admin/ReservationCustomerActions'
import {
  STATUS_LABELS,
  buildReportQuery,
  contactTemplates,
  filtersQuery,
  groupCustomers,
  loadReportRows,
  parseReportFilters,
  summarize,
  whatsappNumber,
  type ReservationStatus,
} from '@/lib/reservations/report'

// ============================================================================
// Reservaciones › Reportes y clientes (14/11/2026)
// ============================================================================
// · Resumen: cuántas reservas entran (o hay para) en el período, comensales,
//   asistencia, no-shows, cancelaciones, seña cobrada, anticipación, por día,
//   día de la semana, horario, espacio y sede.
// · Clientes: quiénes reservaron, cuántas veces, si vinieron y si aceptaron
//   novedades. Contacto por WhatsApp/email; mensajes promocionales (menú,
//   delivery/take away, club, invitación) SOLO con permiso (Ley 25.326).
//   Exportación de contactos con permiso: solo administrador.
// Acceso: admin y encargado; alcance de sede del usuario.
// ============================================================================

type SearchParams = Record<string, string | string[] | undefined>
const CUSTOMER_ROWS = 300

export default async function ReservasReportesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireCashPageSession(['admin', 'manager'])
  const params = await searchParams
  const h = await headers()
  const tenantSlug = h.get('x-tenant-slug') ?? ''
  const host = h.get('x-forwarded-host') ?? h.get('host')
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name plan features.reservations')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; plan?: Plan; features?: { reservations?: boolean } }>()
  if (!tenant) notFound()
  const plan: Plan = tenant.plan ?? 'try'
  if (!canAccess(plan, 'reservations') || !tenant.features?.reservations) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Lock size={32} className="text-muted-foreground" />
        <p className="text-muted-foreground">
          {canAccess(plan, 'reservations') ? 'El módulo de reservas no está activo.' : `Disponible en el plan ${PLAN_LABELS[requiredPlanFor('reservations')]}.`}
        </p>
      </div>
    )
  }

  const tab = params.tab === 'clientes' ? 'clientes' : 'resumen'
  const base = `/${tenantSlug}/admin/reservas/reportes`
  const scope = await getPageScope()
  const filters = parseReportFilters(params)
  const [locations, { rows, truncated }] = await Promise.all([
    Location.find({ tenantId: tenant._id, ...scope.sedeFilter })
      .select('name spaces._id spaces.name')
      .sort({ name: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; name?: string; spaces?: { _id: mongoose.Types.ObjectId; name: string }[] }[]>(),
    loadReportRows(buildReportQuery(String(tenant._id), filters, scope.locationIds)),
  ])
  const locName = new Map(locations.map((l) => [String(l._id), l.name ?? 'Sede']))
  const spaceName = new Map(locations.flatMap((l) => (l.spaces ?? []).map((s) => [String(s._id), s.name] as const)))
  const summary = summarize(rows, filters)
  const isAdmin = session.role === 'admin' || session.role === 'superadmin'
  const select = 'rounded-xl border-2 border-border/60 bg-background px-3 py-2 text-sm'

  const header = (
    <div>
      <Link href={`/${tenantSlug}/admin/reservas`} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Reservaciones
      </Link>
      <h1 className="mt-2 flex items-center gap-3 text-4xl font-bold tracking-tight text-foreground">
        <BarChart3 size={30} className="text-primary" /> Reportes de reservas
      </h1>
      <p className="mt-2 font-medium text-muted-foreground">Cómo se mueven las reservas y quiénes reservan, para volver a invitarlos.</p>
      <nav className="mt-4 flex gap-2" aria-label="Secciones">
        {[{ id: 'resumen', label: 'Resumen' }, { id: 'clientes', label: `Clientes (${summary.customers})` }].map((t) => (
          <Link
            key={t.id}
            href={`${base}?${filtersQuery(filters, t.id === 'clientes' ? { tab: 'clientes' } : {})}`}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`rounded-2xl px-4 py-2 text-sm font-black ${tab === t.id ? 'bg-primary text-primary-foreground' : 'border-2 border-border/60 text-muted-foreground'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )

  const filterForm = (
    <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-3xl border-2 border-border/60 bg-card p-4">
      {tab === 'clientes' && <input type="hidden" name="tab" value="clientes" />}
      <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Período
        <select name="preset" defaultValue={filters.preset} className={select}>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="90d">Últimos 90 días</option>
          <option value="365d">Último año</option>
          <option value="custom">Personalizado</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desde
        <input type="date" name="from" defaultValue={filters.from} className={select} />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hasta
        <input type="date" name="to" defaultValue={filters.to} className={select} />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contar por
        <select name="basis" defaultValue={filters.basis} className={select}>
          <option value="created">Cuándo reservaron</option>
          <option value="date">Fecha de la reserva</option>
        </select>
      </label>
      {locations.length > 1 && (
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sede
          <select name="location" defaultValue={filters.locationId ?? ''} className={select}>
            <option value="">Todas</option>
            {locations.map((l) => <option key={String(l._id)} value={String(l._id)}>{l.name ?? 'Sede'}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado
        <select name="status" defaultValue={filters.status ?? ''} className={select}>
          <option value="">Todos</option>
          {(Object.keys(STATUS_LABELS) as ReservationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      {spaceName.size > 0 && (
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Espacio
          <select name="space" defaultValue={filters.spaceId ?? ''} className={select}>
            <option value="">Todos</option>
            {Array.from(spaceName.entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      )}
      {tab === 'clientes' && (
        <label className="flex items-center gap-2 pb-2 text-sm font-bold">
          <input type="checkbox" name="optin" value="1" defaultChecked={filters.optInOnly} className="h-4 w-4" /> Solo con permiso para promos
        </label>
      )}
      <button type="submit" className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground">Ver</button>
      <span className="text-xs text-muted-foreground">El período elegido en «Período» manda salvo «Personalizado».</span>
    </form>
  )

  if (tab === 'clientes') {
    const all = groupCustomers(rows)
    const list = filters.optInOnly ? all.filter((c) => c.optIn) : all
    // Links absolutos en los mensajes: URL configurada o, si falta, el dominio de la petición.
    const origin = getBaseUrl() || (host && /^[a-z0-9.:-]+$/i.test(host) ? `https://${host}` : '')
    const menuUrl = `${origin}/${tenantSlug}/menu`
    const firstLocation = filters.locationId ?? (locations.length === 1 ? String(locations[0]._id) : null)
    const reserveUrl = firstLocation ? `${origin}/${tenantSlug}/reservas/${firstLocation}` : null
    return (
      <div className="space-y-6 pb-10">
        {header}
        {filterForm}
        <div className="flex flex-wrap items-center gap-3">
          <Kpi label="Clientes" value={String(all.length)} />
          <Kpi label="Con permiso para promos" value={String(summary.optInCustomers)} />
          {isAdmin && (
            <a href={`/api/${tenantSlug}/reservas/contacts/export?${filtersQuery(filters)}`} className="ml-auto inline-flex items-center gap-2 rounded-2xl border-2 border-border/60 px-4 py-2.5 text-sm font-bold">
              <Download size={16} /> Exportar contactos con permiso (CSV)
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Los mensajes de promos, menú o club solo se ofrecen a quienes aceptaron recibir novedades al reservar. Al resto
          se lo contacta solo por su reserva. Las reservas anteriores al 14/11/2026 no tienen ese permiso registrado.
        </p>
        {list.length === 0 ? (
          <Empty text="No hay clientes con esos filtros." />
        ) : (
          <section className="overflow-x-auto rounded-3xl border-2 border-border/60 bg-card p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Contacto</th>
                  <th className="py-2 pr-3 text-right">Reservas</th>
                  <th className="py-2 pr-3 text-right">Comensales</th>
                  <th className="py-2 pr-3 text-right">Vino / No vino</th>
                  <th className="py-2 pr-3">Última</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, CUSTOMER_ROWS).map((c) => {
                  const wa = whatsappNumber(c.phone)
                  const templates = contactTemplates({ tenantName: tenant.name, firstName: c.name.split(' ')[0] ?? '', menuUrl, reserveUrl, clubUrl: menuUrl })
                  return (
                    <tr key={c.key} className="border-t border-border/60 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-bold">{c.name || '—'}</div>
                        {c.optIn ? <span className="text-[10px] font-bold text-emerald-700">Acepta novedades</span> : <span className="text-[10px] text-muted-foreground">Sin permiso para promos</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <div className="tabular-nums">{c.phone}</div>
                        {c.email && <div className="text-muted-foreground">{c.email}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.reservations}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.guests}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.seated} / <span className={c.noShows > 0 ? 'font-bold text-red-600' : ''}>{c.noShows}</span></td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{c.lastDate}</td>
                      <td className="py-2">
                        <ReservationCustomerActions
                          tenantSlug={tenantSlug}
                          customerKey={c.key}
                          optIn={c.optIn}
                          mailto={c.email ? `mailto:${encodeURIComponent(c.email)}` : null}
                          whatsapp={templates.map((t) => ({ id: t.id, label: t.label, promotional: t.promotional, href: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t.text)}` : null }))}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {list.length > CUSTOMER_ROWS && <p className="mt-3 text-xs text-muted-foreground">Mostrando {CUSTOMER_ROWS} de {list.length}. Acotá el período o exportá.</p>}
          </section>
        )}
      </div>
    )
  }

  const s = summary
  return (
    <div className="space-y-6 pb-10">
      {header}
      {filterForm}
      {truncated && <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Hay más de 20.000 reservas en el período: se muestran las más recientes. Acotá el período.</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumen del período">
        <Kpi label="Reservas" value={String(s.total)} />
        <Kpi label="Comensales" value={String(s.guests)} hint={s.avgParty !== null ? `${s.avgParty} por reserva` : undefined} />
        <Kpi label="Asistencia" value={s.showRate !== null ? `${s.showRate} %` : '—'} hint={`${s.byStatus.seated} vinieron · ${s.byStatus.no_show} no`} />
        <Kpi label="Canceladas" value={s.cancelRate !== null ? `${s.cancelRate} %` : '—'} hint={`${s.byStatus.cancelled} reservas`} />
        <Kpi label="Seña cobrada" value={formatCents(s.depositCents)} />
        <Kpi label="Anticipación" value={s.avgLeadDays !== null ? `${s.avgLeadDays} días` : '—'} hint="entre que reservan y la fecha" />
        <Kpi label="Clientes" value={String(s.customers)} />
        <Kpi label="Aceptan novedades" value={String(s.optInCustomers)} />
      </section>

      <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
        <h2 className="text-sm font-black">Estados</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {(Object.keys(STATUS_LABELS) as ReservationStatus[]).map((st) => (
            <span key={st} className="rounded-xl bg-muted/40 px-3 py-1.5"><span className="text-muted-foreground">{STATUS_LABELS[st]}:</span> <strong className="tabular-nums">{s.byStatus[st]}</strong></span>
          ))}
        </div>
      </section>

      <Bars title={filters.basis === 'date' ? 'Reservas por fecha de la reserva' : 'Reservas recibidas por día'} data={s.byDay.map((d) => ({ label: d.day.slice(5), full: d.day, value: d.count, extra: `${d.guests} comensales` }))} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Por día de la semana" data={s.byWeekday.map((d) => ({ label: d.label, full: d.label, value: d.count }))} />
        <Bars title="Por horario" data={s.byHour.map((d) => ({ label: d.label, full: d.label, value: d.count }))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Por espacio" rows={s.bySpace.map((x) => ({ key: x.spaceId ?? 'none', name: x.spaceId ? spaceName.get(x.spaceId) ?? 'Espacio borrado' : 'Sin espacio', count: x.count, guests: x.guests }))} />
        {locations.length > 1 && <Breakdown title="Por sede" rows={s.byLocation.map((x) => ({ key: x.locationId, name: locName.get(x.locationId) ?? 'Sede', count: x.count, guests: x.guests }))} />}
      </div>
      <p className="text-xs text-muted-foreground">
        Período {filters.from} al {filters.to}. «Cuándo reservaron» cuenta las reservas recibidas; «Fecha de la reserva», las que eran para esos días.
      </p>
      <Link href={`${base}?${filtersQuery(filters, { tab: 'clientes' })}`} className="inline-flex items-center gap-2 rounded-2xl border-2 border-border/60 px-4 py-2.5 text-sm font-bold">
        <Users size={16} /> Ver clientes del período
      </Link>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border-2 border-border/60 bg-card p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[3rem] border-2 border-dashed border-border/60 bg-muted/10 py-16 text-center">
      <p className="font-bold text-muted-foreground">{text}</p>
    </div>
  )
}

/**
 * Barras de una sola serie (un tono, el primario). Valor al pasar el mouse
 * (title) y el máximo rotulado; la tabla debajo da los números exactos.
 */
function Bars({ title, data }: { title: string; data: { label: string; full: string; value: number; extra?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0] ?? { label: '', full: '', value: 0 })
  const dense = data.length > 16
  return (
    <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-black">{title}</h2>
        {total > 0 && peak.value > 0 && <span className="text-xs text-muted-foreground">Pico: {peak.full} ({peak.value})</span>}
      </div>
      {total === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Sin reservas en el período.</p>
      ) : (
        <>
          <div className="mt-4 flex h-40 items-end gap-[2px] border-b border-border/60" role="img" aria-label={`${title}: ${data.map((d) => `${d.full} ${d.value}`).join(', ')}`}>
            {data.map((d) => (
              <div key={d.full} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.full}: ${d.value}${d.extra ? ` · ${d.extra}` : ''}`}>
                <div className="w-full rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
            {data.map((d, i) => (
              <span key={d.full} className="flex-1 truncate text-center">{!dense || i % Math.ceil(data.length / 8) === 0 ? d.label : ''}</span>
            ))}
          </div>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-bold text-muted-foreground">Ver en tabla</summary>
            <table className="mt-2 w-full">
              <tbody>
                {data.filter((d) => d.value > 0).map((d) => (
                  <tr key={d.full} className="border-t border-border/40">
                    <td className="py-1 pr-3">{d.full}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{d.value}</td>
                    <td className="py-1 text-muted-foreground">{d.extra ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  )
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; name: string; count: number; guests: number }[] }) {
  return (
    <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
      <h2 className="text-sm font-black">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Sin datos</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3">
              <span className="truncate font-bold">{r.name}</span>
              <span className="tabular-nums text-muted-foreground">{r.count} reservas · {r.guests} comensales</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
