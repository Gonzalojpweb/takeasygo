import Location from '@/models/Location'
import { loadSalesMetrics, mergeChannelTotals, type SaleChannel } from '@/lib/metrics/sales'
import { getPageScope } from '@/lib/page-scope'
import { toPesos } from '@takeasygo/business'

// ============================================================================
// «Hoy por canal» — dashboard del SaaS (Fase G/H, 2026-10)
// ============================================================================
// Mismos números que el Resumen del POS (lib/metrics/sales). Separa siempre
// el canal App TakeasyGO (SaaS) de Salón y Mostrador (POS):
//   · comercio con POS → Salón y Mostrador (con comensales) + App.
//   · comercio solo SaaS → solo App (no se muestran canales que no tiene).
//   · Delivery externo → solo si hubo ventas por ese canal.
// Ingresos solo para admin y encargado; el resto ve cantidades.
// Alcance: las sedes del usuario.
// ============================================================================

const LABEL: Record<SaleChannel, string> = { salon: 'Salón', mostrador: 'Mostrador', app: 'App TakeasyGO', delivery: 'Delivery externo' }

const money = (cents: number) => `$${toPesos(cents).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

export default async function TodayByChannel({ tenantId, posEnabled, showRevenue }: { tenantId: string; posEnabled: boolean; showRevenue: boolean }) {
  const scope = await getPageScope()
  const locations = await Location.find({ tenantId, isActive: true, ...scope.sedeFilter }).select('_id').lean<{ _id: unknown }[]>()
  if (locations.length === 0) return null
  const results = await Promise.all(locations.map((l) => loadSalesMetrics(tenantId, String(l._id), {}).then((r) => r.metrics)))
  const m = mergeChannelTotals(results)
  const channels: SaleChannel[] = [
    ...(posEnabled ? (['salon', 'mostrador'] as SaleChannel[]) : []),
    'app',
    ...(m.byChannel.delivery.sales > 0 ? (['delivery'] as SaleChannel[]) : []),
  ]

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5" aria-label="Ventas de hoy por canal">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold">Hoy por canal</h3>
        <p className="text-xs text-muted-foreground">
          {m.totals.sales} ventas{showRevenue ? ` · ${money(m.totals.revenue)}` : ''} · ticket {money(m.totals.avgTicket)}
          {posEnabled ? ` · ${m.totals.guests} comensales` : ''}
        </p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${channels.length}, minmax(0, 1fr))` }}>
        {channels.map((c) => {
          const v = m.byChannel[c]
          return (
            <div key={c} className="rounded-xl bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{LABEL[c]}</p>
              <p className="text-xl font-bold tabular-nums mt-1">{showRevenue ? money(v.revenue) : `${v.sales} ventas`}</p>
              <p className="text-xs text-muted-foreground">
                {showRevenue ? `${v.sales} ventas · ` : ''}ticket {money(v.avgTicket)}{c === 'salon' ? ` · ${v.guests} comensales` : ''}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
