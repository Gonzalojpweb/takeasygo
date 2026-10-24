import Link from 'next/link'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { headers } from 'next/headers'
import type mongoose from 'mongoose'
import { notFound } from 'next/navigation'
import { Banknote, AlertTriangle, ChevronRight } from 'lucide-react'
import { getPageScope } from '@/lib/page-scope'
import { formatCents } from '@takeasygo/business'
import { summarizeCashiers, summarySince, type ClosedRegisterRow } from '@/lib/cash/cashier-summary'
import { MpPointSettings } from '@/components/cash/MpPointSettings'

// ============================================================================
// Cajas POS — cierres (reporte Z) y control de faltantes por empleado
// ============================================================================
// Auditoría POS Online V1 §6.5: el Z se generaba y guardaba inmutable al
// cerrar la caja en el POS, pero ningún panel del SaaS lo leía. Esta vista
// lista los cierres por sede (alcance de sede del usuario: getPageScope) con
// el desglose del Z tal como se guardó — nunca se recalcula.
//
// Fase 2 de caja (2026-10): resumen de los últimos 30 días y faltantes por
// quien cerró la caja (patrones de faltante recurrente). Cada cierre abre su
// reporte Z completo con impresión, PDF y link compartible.
// El shareToken NO se selecciona acá: es una credencial del link compartido.
// ============================================================================

const PAGE_SIZE = 60
const SUMMARY_DAYS = 30

interface ZSnapshot {
  salesTotal?: number
  voidCount?: number
}

export default async function CajaPosPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id features.posEnabled')
    .lean<{ _id: mongoose.Types.ObjectId; features?: { posEnabled?: boolean } }>()

  if (!tenant) notFound()

  if (!tenant.features?.posEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <AlertTriangle size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cajas POS</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            El POS no está habilitado para este comercio. Contactá al soporte para activarlo.
          </p>
        </div>
      </div>
    )
  }

  const pageScope = await getPageScope()
  const since = summarySince(SUMMARY_DAYS)
  const [locations, registers, recent] = await Promise.all([
    Location.find({ tenantId: tenant._id, ...pageScope.sedeFilter }).select('name').lean(),
    CashRegister.find({ tenantId: tenant._id, status: 'closed', ...pageScope.locationFilter })
      .select('locationId openedBy closedBy openedAt closedAt finalAmount difference zReport.salesTotal zReport.voidCount')
      .sort({ closedAt: -1 })
      .limit(PAGE_SIZE)
      .lean(),
    CashRegister.find({ tenantId: tenant._id, status: 'closed', closedAt: { $gte: since }, ...pageScope.locationFilter })
      .select('closedBy closedByUserId difference')
      .lean<ClosedRegisterRow[]>(),
  ])

  const locationName = new Map(locations.map((l) => [String(l._id), String(l.name)]))
  const summary = summarizeCashiers(recent)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Cajas POS</h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Cierres de caja del POS con su reporte Z. Los montos son los del cierre: no se recalculan. El cajero cuenta sin
          ver el saldo esperado (cierre ciego); la diferencia es la que ves acá.
        </p>
      </div>

      <MpPointSettings tenantSlug={tenantSlug ?? ''} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={`Últimos ${SUMMARY_DAYS} días`}>
        <Kpi label={`Cierres (${SUMMARY_DAYS} días)`} value={String(summary.totals.closes)} />
        <Kpi label="Con faltante" value={String(summary.totals.shortCloses)} tone={summary.totals.shortCloses > 0 ? 'bad' : undefined} />
        <Kpi label="Faltante total" value={formatCents(summary.totals.shortTotal)} tone={summary.totals.shortTotal > 0 ? 'bad' : undefined} />
        <Kpi label="Sobrante total" value={formatCents(summary.totals.overTotal)} />
      </section>

      {summary.cashiers.length > 0 && (
        <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
          <h2 className="text-sm font-black">Por quién cerró la caja · últimos {SUMMARY_DAYS} días</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Un faltante aislado puede ser un error de vuelto. Si se repite con la misma persona, conviene revisar sus
            turnos.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4">Persona</th>
                  <th className="py-2 pr-4 text-right">Cierres</th>
                  <th className="py-2 pr-4 text-right">Con faltante</th>
                  <th className="py-2 pr-4 text-right">Faltante</th>
                  <th className="py-2 text-right">Sobrante</th>
                </tr>
              </thead>
              <tbody>
                {summary.cashiers.map((c) => (
                  <tr key={c.key} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-bold">{c.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.closes}</td>
                    <td className={`py-2 pr-4 text-right tabular-nums ${c.shortCloses > 1 ? 'font-black text-red-600' : ''}`}>
                      {c.shortCloses}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCents(c.shortTotal)}</td>
                    <td className="py-2 text-right tabular-nums">{formatCents(c.overTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {registers.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-border/60 rounded-[3rem] bg-muted/10">
          <Banknote className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground font-bold">Todavía no hay cajas cerradas desde el POS.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {registers.map((reg) => {
            const z = (reg.zReport ?? {}) as ZSnapshot
            const difference = reg.difference ?? 0
            return (
              <Link
                key={String(reg._id)}
                href={`/${tenantSlug}/admin/caja-pos/${String(reg._id)}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-border/60 bg-card p-5 hover:bg-muted/40"
              >
                <div>
                  <div className="text-sm font-black">
                    {locationName.get(String(reg.locationId)) ?? 'Sede'} ·{' '}
                    {reg.closedAt ? new Date(reg.closedAt).toLocaleString('es-AR') : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Abrió {reg.openedBy} · Cerró {reg.closedBy ?? '—'}
                    {(z.voidCount ?? 0) > 0 ? ` · ${z.voidCount} anulación${z.voidCount === 1 ? '' : 'es'}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ventas</div>
                    <div className="font-bold tabular-nums">{formatCents(z.salesTotal ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Diferencia</div>
                    <div
                      className={`font-bold tabular-nums ${
                        difference === 0 ? '' : difference > 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {difference > 0 ? '+' : difference < 0 ? '−' : ''}
                      {formatCents(Math.abs(difference))}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-3xl border-2 border-border/60 bg-card p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${tone === 'bad' ? 'text-red-600' : ''}`}>{value}</div>
    </div>
  )
}
