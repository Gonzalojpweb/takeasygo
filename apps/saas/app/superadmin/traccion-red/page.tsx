import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MousePointerClick, Smartphone, Store, UserPlus } from 'lucide-react'
import { getRoleSession } from '@/lib/tenant-access'
import { getNetworkTraction, TRACTION_PERIODS, type TractionPeriod } from '@/lib/network-traction'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('es-AR')

export default async function TraccionRedPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const session = await getRoleSession('superadmin')
  if (!session) redirect('/login')

  const { dias } = await searchParams
  const days = (TRACTION_PERIODS as readonly number[]).includes(Number(dias)) ? (Number(dias) as TractionPeriod) : 30
  const { totals, rows } = await getNetworkTraction(days)

  const kpis = [
    { label: 'Clics en «Descargá la App»', value: totals.appClicks, sub: `${fmt(totals.appPeople)} personas`, icon: Smartphone },
    { label: 'Clics en «Sumá tu comercio»', value: totals.registerClicks, sub: `${fmt(totals.registerPeople)} personas`, icon: Store },
    { label: 'Comercios que se registraron', value: totals.signups, sub: `${fmt(totals.signupsCompleted)} completaron el alta`, icon: UserPlus },
  ]

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MousePointerClick size={24} className="text-primary" />
            Tracción de la red
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Clics en la sección TakeasyGO al final del menú de cada comercio y comercios nuevos que se registraron desde ahí.
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1" aria-label="Período">
          {TRACTION_PERIODS.map(p => (
            <Link
              key={p}
              href={`/superadmin/traccion-red?dias=${p}`}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                p === days ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={p === days ? 'page' : undefined}
            >
              {p} días
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <k.icon size={14} className="text-primary" />
              {k.label}
            </div>
            <p className="mt-2 text-3xl font-black tabular-nums text-foreground">{fmt(k.value)}</p>
            <p className="text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">#</th>
                <th className="px-4 py-3 text-left font-semibold">Comercio</th>
                <th className="px-4 py-3 text-right font-semibold">App · clics</th>
                <th className="px-4 py-3 text-right font-semibold">App · personas</th>
                <th className="px-4 py-3 text-right font-semibold">Sumá tu comercio · clics</th>
                <th className="px-4 py-3 text-right font-semibold">Sumá tu comercio · personas</th>
                <th className="px-4 py-3 text-right font-semibold">Altas desde su menú</th>
                <th className="px-4 py-3 text-right font-semibold">Total clics</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Todavía no hay clics en los últimos {days} días. Los clics se registran desde que se publicó esta función.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.tenantId} className="border-t border-border/60">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/superadmin/tenants/${r.tenantId}`} className="font-semibold text-foreground hover:text-primary">{r.name}</Link>
                      <p className="text-xs text-muted-foreground">/{r.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(r.appClicks)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.appPeople)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(r.registerClicks)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.registerPeople)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmt(r.signups)}
                      {r.signups > 0 && <span className="block text-xs text-muted-foreground">{fmt(r.signupsCompleted)} completas</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{fmt(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground max-w-3xl">
        «Personas» son visitantes anónimos distintos del menú de ese comercio (por sesión del navegador, sin datos personales).
        «Altas desde su menú» cuenta los comercios que entraron a /empezar desde ese menú y crearon su cuenta; «completas» son los que verificaron el email y terminaron el alta.
      </p>
    </div>
  )
}
