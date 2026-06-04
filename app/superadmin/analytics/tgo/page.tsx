import { connectDB } from '@/lib/mongoose'
import { getTgoMetrics } from '@/lib/tgo-metrics'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, ShoppingBag, Activity, Eye, Search } from 'lucide-react'
import InfoTooltip from '@/components/ui/info-tooltip'
import AnalyticsTabBar from '@/components/superadmin/AnalyticsTabBar'

export default async function TgoAnalyticsPage() {
  await connectDB()

  const tgoMetrics = await getTgoMetrics(30)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none">Analytics Global</h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          Tráfico del Consumer App
        </p>
      </div>

      <AnalyticsTabBar />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-emerald-500/10 w-fit mb-3">
              <Eye size={18} className="text-emerald-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Sesiones únicas (30d) <InfoTooltip description="Cantidad de sessionId distintos registrados en ExploreEvent en los últimos 30 días. Cada sesión representa un usuario real." /></p>
            <p className="text-2xl font-black tabular-nums">{tgoMetrics.summary.uniqueSessions}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-emerald-500/10 w-fit mb-3">
              <Activity size={18} className="text-emerald-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Eventos totales <InfoTooltip description="Cantidad total de eventos registrados en ExploreEvent (todos los tipos: pageview, search, restaurant_view, click_menu, etc.) en los últimos 30 días. Un usuario puede generar múltiples eventos en una sesión." /></p>
            <p className="text-2xl font-black tabular-nums">{tgoMetrics.summary.totalEvents}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-emerald-500/10 w-fit mb-3">
              <Search size={18} className="text-emerald-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Vieron restaurantes <InfoTooltip description="Sesiones únicas que generaron al menos un evento restaurant_view. Mide cuántos usuarios llegaron a ver una ficha de restaurante." /></p>
            <p className="text-2xl font-black tabular-nums">{tgoMetrics.funnel.sessionsWithRestaurantView}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <div className="p-2 rounded-xl bg-emerald-500/10 w-fit mb-3">
              <ShoppingBag size={18} className="text-emerald-500" />
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">Click a menú <InfoTooltip description="Sesiones únicas que generaron al menos un evento click_menu. Usuarios que avanzaron hasta el paso final del embudo." /></p>
            <p className="text-2xl font-black tabular-nums">{tgoMetrics.funnel.sessionsWithMenuClick}</p>
            <p className="text-[10px] font-bold text-muted-foreground/70 mt-1">
              {tgoMetrics.summary.uniqueSessions > 0 ? Math.round((tgoMetrics.funnel.sessionsWithMenuClick / tgoMetrics.summary.uniqueSessions) * 100) : 0}% conv. <InfoTooltip description="Tasa de conversión: sesiones con clic a menú / sesiones únicas × 100." />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart + funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Daily sessions */}
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-3">Sesiones únicas por día <InfoTooltip description="Evolución diaria de sesiones únicas. Cada barra representa la cantidad de usuarios distintos que interactuaron en ese día." /></p>
            {tgoMetrics.dailySessions.length > 0 ? (
              <div className="space-y-1">
                {tgoMetrics.dailySessions.slice(0, 14).map((d: any) => {
                  const max = Math.max(...tgoMetrics.dailySessions.map((x: any) => x.uniqueSessions))
                  const pct = max > 0 ? (d.uniqueSessions / max) * 100 : 0
                  return (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground w-20 shrink-0">{d.date.slice(5)}</span>
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/50 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-black tabular-nums w-8 text-right">{d.uniqueSessions}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin datos todavía</p>
            )}
          </CardContent>
        </Card>

        {/* Funnel + sources */}
        <div className="space-y-4">
          <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
            <CardContent className="p-5">
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-3">Funnel de conversión <InfoTooltip description="Embudo de sesiones únicas por tipo de evento. Cada paso muestra cuántas sesiones llegaron a ese punto. Los datos están deduplicados por sessionId." /></p>
              <div className="space-y-2">
                {[
                  { label: 'Pageviews', value: tgoMetrics.funnel.sessionsWithPageview },
                  { label: 'Búsquedas', value: tgoMetrics.funnel.sessionsWithSearch },
                  { label: 'Vista restaurante', value: tgoMetrics.funnel.sessionsWithRestaurantView },
                  { label: 'Click a menú', value: tgoMetrics.funnel.sessionsWithMenuClick },
                ].map((step, i) => {
                  const pct = tgoMetrics.funnel.sessionsWithPageview > 0
                    ? Math.round((step.value / tgoMetrics.funnel.sessionsWithPageview) * 100)
                    : 0
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-bold">{step.label}</span>
                        <span className="text-xs font-black tabular-nums">{step.value} <span className="text-muted-foreground font-medium">({pct}%)</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
            <CardContent className="p-5">
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-3">Dispositivos <InfoTooltip description="Distribución de sesiones por tipo de dispositivo (mobile, desktop, tablet). Se extrae del user-agent de cada evento." /></p>
              <div className="space-y-1.5">
                {tgoMetrics.deviceBreakdown.map((d: any) => (
                  <div key={d.device} className="flex items-center gap-2">
                    <span className="text-xs capitalize font-bold w-20">{d.device}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500/40 transition-all" style={{ width: `${tgoMetrics.summary.uniqueSessions > 0 ? (d.sessions / tgoMetrics.summary.uniqueSessions) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-black tabular-nums">{d.sessions}</span>
                  </div>
                ))}
                {tgoMetrics.deviceBreakdown.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin datos</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top restaurants + searches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-3">Restaurantes más vistos <InfoTooltip description="Top restaurantes por cantidad de sesiones únicas que los visitaron. RED = restaurants de red con tenant activo. DIR = restaurants de directorio." /></p>
            {tgoMetrics.topRestaurants.length > 0 ? (
              <div className="space-y-1.5">
                {tgoMetrics.topRestaurants.map((r: any, i: number) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-xs font-bold flex-1 truncate">{r.name}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${
                      r.type === 'network'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {r.type === 'network' ? 'RED' : 'DIR'}
                    </span>
                    <span className="text-xs font-black tabular-nums">{r.uniqueSessions}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin datos todavía</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-3">Búsquedas principales <InfoTooltip description="Términos de búsqueda más usados por los usuarios, ordenados por frecuencia. Solo incluye búsquedas con texto (no filtros sin query)." /></p>
            {tgoMetrics.topSearches.length > 0 ? (
              <div className="space-y-1.5">
                {tgoMetrics.topSearches.slice(0, 10).map((s: any, i: number) => (
                  <div key={s.query} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-xs font-bold flex-1 truncate">"{s.query}"</span>
                    <span className="text-xs font-black tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin búsquedas todavía</p>
            )}
            <div className="mt-3 pt-3 border-t border-border/40 flex gap-4">
              <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/60">Con resultados <InfoTooltip description="Cantidad de búsquedas que devolvieron al menos un resultado." /></p>
                <p className="text-sm font-black tabular-nums text-emerald-500">{tgoMetrics.searchWithResults}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/60">Sin resultados <InfoTooltip description="Cantidad de búsquedas que no devolvieron ningún resultado." /></p>
                <p className="text-sm font-black tabular-nums text-destructive">{tgoMetrics.searchWithoutResults}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/60">Tasa de acierto <InfoTooltip description="Porcentaje de búsquedas que devolvieron al menos un resultado. Fórmula: con resultados / total búsquedas × 100." /></p>
                <p className="text-sm font-black tabular-nums">
                  {tgoMetrics.searchWithResults + tgoMetrics.searchWithoutResults > 0
                    ? Math.round((tgoMetrics.searchWithResults / (tgoMetrics.searchWithResults + tgoMetrics.searchWithoutResults)) * 100)
                    : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic sources */}
      <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
        <CardContent className="p-5">
          <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-3">Fuentes de tráfico <InfoTooltip description="Origen de las sesiones según el campo source del evento: qr (código QR), direct (acceso directo), explore (navegación desde el explorador), etc." /></p>
          {tgoMetrics.trafficSources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tgoMetrics.trafficSources.map((s: any) => {
                const pct = tgoMetrics.summary.uniqueSessions > 0
                  ? Math.round((s.sessions / tgoMetrics.summary.uniqueSessions) * 100)
                  : 0
                return (
                  <div key={s.source} className="bg-muted/30 rounded-xl p-3 border border-border/40">
                    <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1">{s.source}</p>
                    <p className="text-lg font-black tabular-nums">{s.sessions}</p>
                    <p className="text-[10px] text-muted-foreground/70 font-bold">{pct}% del total</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin datos todavía</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
