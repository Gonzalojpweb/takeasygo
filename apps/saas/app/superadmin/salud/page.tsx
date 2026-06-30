import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, AlertTriangle, CheckCircle, Clock, ShieldCheck, TrendingUp, Wifi, WifiOff, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/plans'

// ── Bandas ICO (misma lógica que en la página ICO del tenant) ─────────────────
function getIcoBand(score: number): { label: string; dot: string; text: string; bg: string } {
  if (score >= 91) return { label: 'Alta consistencia', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  if (score >= 76) return { label: 'Operación estable', dot: 'bg-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50/60 border-emerald-200' }
  if (score >= 51) return { label: 'En consolidación',  dot: 'bg-amber-400',   text: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200'   }
  return             { label: 'Ajustes necesarios',  dot: 'bg-red-400',     text: 'text-red-600',     bg: 'bg-red-50 border-red-200'     }
}

export default async function SaludPage() {
  await connectDB()

  const now = new Date()
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Todos los tenants activos con sus scores cacheados
  const tenantsRaw = await Tenant.find({ isActive: true })
    .select('name slug plan cachedScores createdAt')
    .lean<Array<{
      _id: any
      name: string
      slug: string
      plan: Plan
      cachedScores?: { icoScore: number | null; capacityScore: number | null; updatedAt: Date | null }
      createdAt: Date
    }>>()

  // Pedidos activos últimos 30d por tenant
  const orderCounts = await Order.aggregate([
    { $match: { createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
  ])
  const orderCountMap: Record<string, number> = Object.fromEntries(
    orderCounts.map((o: any) => [o._id.toString(), o.count as number])
  )

  // Enriquecer tenants
  const tenants = tenantsRaw.map(t => {
    const icoScore   = t.cachedScores?.icoScore ?? null
    const capacityScore = t.cachedScores?.capacityScore ?? null
    const orders30d  = orderCountMap[t._id.toString()] ?? 0
    return { ...t, id: t._id.toString(), icoScore, capacityScore, orders30d }
  })

  // Ordenar: primero los que tienen ICO, de menor a mayor (para destacar alertas arriba)
  const withIco    = tenants.filter(t => t.icoScore !== null).sort((a, b) => (a.icoScore!) - (b.icoScore!))
  const withoutIco = tenants.filter(t => t.icoScore === null).sort((a, b) => b.orders30d - a.orders30d)
  const sorted     = [...withIco, ...withoutIco]

  // ── KPIs de red ──────────────────────────────────────────────────────────────
  const total         = tenants.length
  const withData      = withIco.length
  const alertas       = withIco.filter(t => t.icoScore! < 51).length
  const consolidacion = withIco.filter(t => t.icoScore! >= 51 && t.icoScore! < 76).length
  const estables      = withIco.filter(t => t.icoScore! >= 76 && t.icoScore! < 91).length
  const altos         = withIco.filter(t => t.icoScore! >= 91).length
  const sinDatos      = withoutIco.length
  const avgIco        = withIco.length > 0
    ? Math.round(withIco.reduce((s, t) => s + (t.icoScore ?? 0), 0) / withIco.length)
    : null

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Salud de Red</h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Estado operativo de todos los tenants activos — basado en ICO y capacidad.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-primary/10 w-fit mb-3">
              <Wifi size={18} className="text-primary" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Tenants activos</p>
            <p className="text-3xl font-black tabular-nums">{total}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">{withData} con ICO calculado</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-emerald-500/10 w-fit mb-3">
              <TrendingUp size={18} className="text-emerald-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">ICO promedio red</p>
            <p className="text-3xl font-black tabular-nums">{avgIco !== null ? avgIco : '—'}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">{altos + estables} en banda verde</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-red-500/10 w-fit mb-3">
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Alertas ICO</p>
            <p className="text-3xl font-black tabular-nums text-red-600">{alertas}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">ICO &lt; 51 — ajustes necesarios</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-amber-500/10 w-fit mb-3">
              <Activity size={18} className="text-amber-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">En consolidación</p>
            <p className="text-3xl font-black tabular-nums text-amber-600">{consolidacion}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">ICO 51–75</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-zinc-200/60 w-fit mb-3">
              <WifiOff size={18} className="text-zinc-400" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Sin ICO aún</p>
            <p className="text-3xl font-black tabular-nums text-zinc-400">{sinDatos}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">Nunca visitaron panel ICO</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución de bandas */}
      {withData > 0 && (
        <Card className="bg-card border-2 border-border/60 rounded-3xl overflow-hidden shadow-lg">
          <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-primary" />
              <CardTitle className="text-foreground text-base font-bold">Distribución de bandas ICO</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {[
              { label: 'Alta consistencia (91–100)', count: altos,         color: 'bg-emerald-500' },
              { label: 'Operación estable (76–90)',  count: estables,       color: 'bg-emerald-400' },
              { label: 'En consolidación (51–75)',   count: consolidacion,  color: 'bg-amber-400'   },
              { label: 'Ajustes necesarios (0–50)',  count: alertas,        color: 'bg-red-400'     },
            ].map(band => {
              const pct = withData > 0 ? Math.round((band.count / withData) * 100) : 0
              return (
                <div key={band.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">{band.label}</span>
                    <span className="text-sm font-black tabular-nums">{band.count} <span className="text-muted-foreground font-medium text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', band.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Tabla de tenants */}
      <Card className="bg-card border-2 border-border/60 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
          <div className="flex items-center gap-3">
            <Activity size={18} className="text-primary" />
            <CardTitle className="text-foreground text-base font-bold">Estado por tenant</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground font-medium">Ordenado: alertas primero</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Tenant</th>
                  <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hidden md:table-cell">Plan</th>
                  <th className="text-center px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">ICO</th>
                  <th className="text-center px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hidden lg:table-cell">Capacidad</th>
                  <th className="text-center px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hidden lg:table-cell">Pedidos 30d</th>
                  <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hidden xl:table-cell">Scores act.</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-muted-foreground font-medium text-sm">
                      Sin tenants activos
                    </td>
                  </tr>
                )}
                {sorted.map(t => {
                  const band = t.icoScore !== null ? getIcoBand(t.icoScore) : null
                  const capacityPct = t.capacityScore !== null
                    ? Math.round(t.capacityScore * 100)
                    : null
                  const updatedAt = t.cachedScores?.updatedAt
                    ? new Date(t.cachedScores.updatedAt).toLocaleDateString('es-AR', {
                        day: '2-digit', month: 'short',
                      })
                    : null

                  return (
                    <tr key={t.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            band ? band.dot : 'bg-zinc-300'
                          )} />
                          <div>
                            <p className="font-bold text-foreground text-sm leading-tight">{t.name}</p>
                            <p className="text-muted-foreground text-[10px] font-mono leading-none mt-0.5">{t.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest', PLAN_COLORS[t.plan])}>
                          {PLAN_LABELS[t.plan] ?? t.plan}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {band ? (
                          <span className={cn(
                            'inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border',
                            band.bg, band.text
                          )}>
                            {t.icoScore}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 font-medium">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center hidden lg:table-cell">
                        {capacityPct !== null ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  capacityPct >= 70 ? 'bg-emerald-500' : capacityPct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                                )}
                                style={{ width: `${capacityPct}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold tabular-nums text-muted-foreground">{capacityPct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center hidden lg:table-cell">
                        <span className={cn(
                          'text-sm font-black tabular-nums',
                          t.orders30d === 0 ? 'text-muted-foreground/40' : 'text-foreground'
                        )}>
                          {t.orders30d}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden xl:table-cell">
                        {updatedAt ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                            <Clock size={10} />
                            {updatedAt}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 font-medium">
                            <XCircle size={10} />
                            Sin datos
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
