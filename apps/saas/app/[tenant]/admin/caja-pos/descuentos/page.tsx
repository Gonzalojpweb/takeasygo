import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type mongoose from 'mongoose'
import { ArrowLeft, Download, Percent, AlertTriangle } from 'lucide-react'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { formatCents } from '@takeasygo/business'
import { DISCOUNT_REASONS, DISCOUNT_REASON_IDS } from '@takeasygo/business'
import { getPageScope } from '@/lib/page-scope'
import { requireCashPageSession } from '@/lib/cash/page-guard'
import { DiscountPolicyForm } from '@/components/cash/DiscountPolicyForm'
import {
  APPROVAL_MODE_LABELS,
  PAGE_ROWS,
  SCOPE_LABELS,
  buildDiscountQuery,
  discountPeople,
  filtersToQuery,
  findDiscountEvents,
  parseDiscountFilters,
  reasonLabel,
  summarizeDiscountEvents,
} from '@/lib/pos-online/discountReport'

// ============================================================================
// Cajas POS › Descuentos y ajustes (14/11/2026)
// ============================================================================
// · Reporte: cada descuento aplicado o quitado en el POS (PosDiscountEvent),
//   con filtros por cajero, quién autorizó, motivo, período y sede. Respeta el
//   alcance de sede del usuario. Exportación CSV con los mismos filtros.
// · Política: quién descuenta, hasta cuánto sin PIN y topes (solo admin edita).
// Acceso: admin y encargado del comercio (requireCashPageSession).
// ============================================================================

type SearchParams = Record<string, string | string[] | undefined>

function arDateTime(d: Date): string {
  return new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
}

export default async function DescuentosPosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCashPageSession()
  const params = await searchParams
  const tenantSlug = (await headers()).get('x-tenant-slug') ?? ''

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id features.posEnabled')
    .lean<{ _id: mongoose.Types.ObjectId; features?: { posEnabled?: boolean } }>()
  if (!tenant) notFound()
  const tenantId = String(tenant._id)
  const base = `/${tenantSlug}/admin/caja-pos/descuentos`
  const tab = params.tab === 'politica' ? 'politica' : 'reporte'

  if (!tenant.features?.posEnabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <AlertTriangle size={32} className="text-muted-foreground" />
        <p className="text-muted-foreground">El POS no está habilitado para este comercio.</p>
      </div>
    )
  }

  const header = (
    <div>
      <Link href={`/${tenantSlug}/admin/caja-pos`} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Cajas POS
      </Link>
      <h1 className="mt-2 flex items-center gap-3 text-4xl font-bold tracking-tight text-foreground">
        <Percent size={30} className="text-primary" /> Descuentos y ajustes
      </h1>
      <p className="mt-2 font-medium text-muted-foreground">
        Cada descuento del POS queda registrado con el importe original, lo descontado, el importe final, quién lo hizo,
        quién lo autorizó y por qué. Los precios del menú nunca cambian.
      </p>
      <nav className="mt-4 flex gap-2" aria-label="Secciones">
        {[{ id: 'reporte', label: 'Reporte' }, { id: 'politica', label: 'Política' }].map((t) => (
          <Link
            key={t.id}
            href={t.id === 'reporte' ? base : `${base}?tab=politica`}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`rounded-2xl px-4 py-2 text-sm font-black ${tab === t.id ? 'bg-primary text-primary-foreground' : 'border-2 border-border/60 text-muted-foreground'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )

  if (tab === 'politica') {
    return (
      <div className="space-y-8 pb-10">
        {header}
        <DiscountPolicyForm tenantSlug={tenantSlug} />
      </div>
    )
  }

  const scope = await getPageScope()
  const filters = parseDiscountFilters(params)
  const query = buildDiscountQuery(tenantId, filters, scope.locationIds)
  const [locations, rows, summary, people] = await Promise.all([
    Location.find({ tenantId: tenant._id, ...scope.sedeFilter }).select('name').sort({ name: 1 }).lean<{ _id: mongoose.Types.ObjectId; name?: string }[]>(),
    findDiscountEvents(query, PAGE_ROWS),
    summarizeDiscountEvents(query),
    discountPeople(tenantId, scope.locationIds),
  ])
  const locName = new Map(locations.map((l) => [String(l._id), l.name ?? 'Sede']))
  const select = 'rounded-xl border-2 border-border/60 bg-background px-3 py-2 text-sm'

  return (
    <div className="space-y-8 pb-10">
      {header}

      <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-3xl border-2 border-border/60 bg-card p-4">
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desde
          <input type="date" name="from" defaultValue={filters.from} className={select} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hasta
          <input type="date" name="to" defaultValue={filters.to} className={select} />
        </label>
        {locations.length > 1 && (
          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sede
            <select name="location" defaultValue={filters.locationId ?? ''} className={select}>
              <option value="">Todas</option>
              {locations.map((l) => <option key={String(l._id)} value={String(l._id)}>{l.name ?? 'Sede'}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Realizó
          <select name="by" defaultValue={filters.byUserId ?? ''} className={select}>
            <option value="">Todos</option>
            {people.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Autorizó
          <select name="approver" defaultValue={filters.approverId ?? ''} className={select}>
            <option value="">Todos</option>
            {people.approvers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Motivo
          <select name="reason" defaultValue={filters.reason ?? ''} className={select}>
            <option value="">Todos</option>
            {DISCOUNT_REASON_IDS.map((id) => <option key={id} value={id}>{DISCOUNT_REASONS[id]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Operación
          <select name="action" defaultValue={filters.action ?? ''} className={select}>
            <option value="">Todas</option>
            <option value="apply">Aplicados</option>
            <option value="remove">Quitados</option>
          </select>
        </label>
        <button type="submit" className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground">Filtrar</button>
        <a href={`/api/${tenantSlug}/pos-discounts/export?${filtersToQuery(filters)}`} className="ml-auto inline-flex items-center gap-2 rounded-2xl border-2 border-border/60 px-4 py-2.5 text-sm font-bold">
          <Download size={16} /> Exportar CSV
        </a>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumen del período">
        <Kpi label="Descuento neto" value={formatCents(summary.netDiscountCents)} />
        <Kpi label="Operaciones" value={String(summary.operations)} />
        <Kpi label="Con PIN de encargado" value={String(summary.withApproval)} />
        <Kpi label="Hechas sin internet" value={String(summary.offline)} />
      </section>

      {(summary.byReason.length > 0 || summary.byUser.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Por motivo" rows={summary.byReason.map((r) => ({ key: r.reason, name: r.label, count: r.count, cents: r.cents }))} />
          <Breakdown title="Por quién lo hizo" rows={summary.byUser.map((u) => ({ key: u.userId, name: u.name, count: u.count, cents: u.cents, extra: u.approvals ? `${u.approvals} con PIN` : undefined }))} />
          <Breakdown title="Por quién autorizó" rows={summary.byApprover.map((u) => ({ key: u.userId, name: u.name, count: u.count, cents: u.cents }))} />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-[3rem] border-2 border-dashed border-border/60 bg-muted/10 py-20 text-center">
          <p className="font-bold text-muted-foreground">No hay descuentos en este período con esos filtros.</p>
        </div>
      ) : (
        <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
          <h2 className="text-sm font-black">Detalle {rows.length === PAGE_ROWS ? `(últimas ${PAGE_ROWS}; exportá el CSV para ver todo)` : ''}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Dónde</th>
                  <th className="py-2 pr-3 text-right">Original</th>
                  <th className="py-2 pr-3 text-right">Descuento</th>
                  <th className="py-2 pr-3 text-right">Final</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3">Realizó</th>
                  <th className="py-2">Autorizó</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r._id)} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {arDateTime(r.occurredAt)}
                      {r.offline && <div className="text-[10px] font-bold text-amber-600">sin internet</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-bold">{r.tableNumber !== null ? `Mesa ${r.tableNumber}` : 'Mostrador'} · {SCOPE_LABELS[r.scope]}{r.lineName ? `: ${r.lineName}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{locations.length > 1 ? `${locName.get(String(r.locationId)) ?? 'Sede'} · ` : ''}#{r.orderPosId.slice(0, 8)}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCents(r.totalBeforeCents)}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums font-bold ${r.discountDeltaCents > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {r.discountDeltaCents > 0 ? '−' : '+'}{formatCents(Math.abs(r.discountDeltaCents))}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {r.action === 'remove' ? 'quitado' : r.requestedFinalCents !== null ? 'importe final' : r.kind === 'percent' ? `${r.value} %` : 'monto'}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-bold">{formatCents(r.totalAfterCents)}</td>
                    <td className="py-2 pr-3">
                      {reasonLabel(r.reason)}
                      {r.note && <div className="max-w-[16rem] text-xs text-muted-foreground">«{r.note}»</div>}
                    </td>
                    <td className="py-2 pr-3">{r.byName ?? r.byUserId}</td>
                    <td className="py-2">
                      {r.approverName ?? (r.approvedByUserId ? r.approvedByUserId : '—')}
                      <div className="text-[10px] text-muted-foreground">{APPROVAL_MODE_LABELS[r.approvalMode]}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border-2 border-border/60 bg-card p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; name: string; count: number; cents: number; extra?: string }[] }) {
  return (
    <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
      <h2 className="text-sm font-black">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Sin datos</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {rows.slice(0, 10).map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3">
              <span className="truncate">
                <span className="font-bold">{r.name}</span> <span className="text-xs text-muted-foreground">({r.count}{r.extra ? ` · ${r.extra}` : ''})</span>
              </span>
              <span className="tabular-nums">{formatCents(r.cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
