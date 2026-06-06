import { connectDB } from '@/lib/mongoose'
import Feedback from '@/models/Feedback'
import Tenant from '@/models/Tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MessageSquare, ThumbsUp, ThumbsDown, Meh, AlertTriangle,
  ShoppingBag, Star, MapPin, Gift, Calendar, ArrowUpRight,
  Clock, Hash, ExternalLink, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const VARIANT_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  checkout_success:  { label: 'Checkout exitoso',    icon: ShoppingBag, color: 'text-emerald-600' },
  checkout_error:    { label: 'Error en checkout',   icon: AlertTriangle, color: 'text-red-600' },
  club_registered:   { label: 'Registro club',       icon: Star, color: 'text-amber-600' },
  redeem_completed:  { label: 'Canje completado',    icon: Gift, color: 'text-violet-600' },
  geofence_notified: { label: 'Notificados (geo)',   icon: MapPin, color: 'text-cyan-600' },
}

const ERROR_LABELS: Record<string, string> = {
  pago_rechazado: 'Pago rechazado',
  pantalla_trabada: 'Pantalla trabada',
  precio_incorrecto: 'Precio incorrecto',
  metodo_pago_no_encontrado: 'Método de pago no encontrado',
  otro: 'Otro',
}

function formatTimestamp(date: Date | string | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const now = Date.now()
  const diff = now - d.getTime()

  if (diff < 60_000) return 'hace segundos'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatFullTimestamp(date: Date | string | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleString('es-AR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export const dynamic = 'force-dynamic'

export default async function SuperAdminFeedbackPage() {
  await connectDB()

  const events = await Feedback.find().sort({ createdAt: -1 }).limit(500).lean()

  const tenants = await Tenant.find({ _id: { $in: [...new Set(events.map(e => e.tenantId.toString()))] } })
    .select('slug name plan')
    .lean()

  const tenantMap = Object.fromEntries(tenants.map(t => [t._id.toString(), t]))

  const byEvent: Record<string, {
    total: number; positive: number; negative: number; samples: any[]
  }> = {}
  const errorBreakdown: Record<string, number> = {}
  const errorByTenant: Record<string, { tenantName: string; count: number }[]> = {}
  let errorCount = 0

  for (const e of events) {
    const ev = e.event || 'unknown'
    if (!byEvent[ev]) byEvent[ev] = { total: 0, positive: 0, negative: 0, samples: [] }
    byEvent[ev].total++
    if (byEvent[ev].samples.length < 25) byEvent[ev].samples.push(e)

    if (ev === 'checkout_success' && e.satisfaction) {
      if (e.satisfaction === 'excelente' || e.satisfaction === 'buena') byEvent[ev].positive++
      else byEvent[ev].negative++
    }
    if (ev === 'club_registered' && e.understoodPoints !== undefined) {
      if (e.understoodPoints) byEvent[ev].positive++
      else byEvent[ev].negative++
    }
    if (ev === 'redeem_completed' && e.wasEasy !== undefined) {
      if (e.wasEasy) byEvent[ev].positive++
      else byEvent[ev].negative++
    }
    if (ev === 'checkout_error' && e.errorType) {
      errorCount++
      errorBreakdown[e.errorType] = (errorBreakdown[e.errorType] || 0) + 1

      const tid = e.tenantId.toString()
      const tn = tenantMap[tid]?.name || tid.slice(-6)
      if (!errorByTenant[e.errorType]) errorByTenant[e.errorType] = []
      const entry = errorByTenant[e.errorType].find(x => x.tenantName === tn)
      if (entry) entry.count++
      else errorByTenant[e.errorType].push({ tenantName: tn, count: 1 })
    }
  }

  const totalFeedback = events.length
  const last7d = events.filter(
    e => e.createdAt && new Date(e.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  ).length

  const errorAlertTypes = Object.entries(errorBreakdown)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Feedback UX</h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <MessageSquare size={14} className="text-primary" />
          Respuestas de usuarios en todos los tenants — últimas 500
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <p className="text-xs font-medium text-muted-foreground">Total respuestas</p>
          <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums">{totalFeedback}</p>
        </Card>
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <p className="text-xs font-medium text-muted-foreground">Últimos 7 días</p>
          <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums">{last7d}</p>
        </Card>
        <Card className="rounded-2xl border shadow-sm p-5 bg-card">
          <p className="text-xs font-medium text-muted-foreground">Errores reportados</p>
          <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums">{errorCount}</p>
        </Card>
        <Card className="rounded-2xl border-2 border-emerald-200 p-5 bg-emerald-50">
          <p className="text-xs font-medium text-emerald-700">Eventos trackeados</p>
          <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums text-emerald-800">
            {Object.keys(byEvent).length}
          </p>
        </Card>
      </div>

      {/* Alerts: error thresholds with tenant breakdown */}
      {errorAlertTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Alertas — errores recurrentes
          </p>
          {errorAlertTypes.map(([type, count]) => (
            <div key={type} className="flex flex-col gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
              <div className="flex items-center gap-3 text-sm font-medium">
                <AlertTriangle size={16} className="text-red-500 shrink-0" />
                <span className="flex-1 text-red-800">
                  <span className="font-bold">{count}x</span> {ERROR_LABELS[type] || type}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                  supera umbral
                </span>
              </div>
              {errorByTenant[type] && (
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {errorByTenant[type].map(t => (
                    <span key={t.tenantName} className="text-[10px] bg-red-100/80 text-red-700 px-2 py-0.5 rounded-full">
                      {t.tenantName} ({t.count})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* By variant */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(byEvent).map(([ev, data]) => {
          const meta = VARIANT_LABELS[ev] || { label: ev, icon: MessageSquare, color: 'text-muted-foreground' }
          const Icon = meta.icon
          const positiveCount = data.positive + data.negative
          const positiveRate = positiveCount > 0
            ? Math.round((data.positive / positiveCount) * 100)
            : null

          return (
            <Card key={ev} className="rounded-2xl border shadow-sm overflow-hidden">
              <CardHeader className="border-b border-border/40 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon size={18} className={meta.color} />
                    <CardTitle className="text-sm font-bold">{meta.label}</CardTitle>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {data.total} respuestas
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                {positiveRate !== null && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          positiveRate >= 70 ? 'bg-emerald-500'
                            : positiveRate >= 40 ? 'bg-amber-500'
                            : 'bg-red-500'
                        )}
                        style={{ width: `${positiveRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      {data.positive}/{positiveCount} positivo
                    </span>
                  </div>
                )}

                {/* Sample detail rows */}
                {data.samples.length > 0 && (
                  <div className="border-t border-border/40 pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Últimas {data.samples.length} respuestas
                    </p>
                    {data.samples.map((s, i) => {
                      const tenant = tenantMap[s.tenantId?.toString()]
                      return (
                        <details key={i} className="group text-xs">
                          <summary className="flex items-center gap-2 cursor-pointer rounded-lg p-2 hover:bg-muted/50 transition-colors list-none">
                            <ChevronRight size={12} className="shrink-0 text-muted-foreground group-open:rotate-90 transition-transform" />
                            {/* Tenant badge */}
                            <span className={cn(
                              'shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider',
                              tenant ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                            )}>
                              {tenant?.slug || s.tenantId?.toString().slice(-6)}
                            </span>

                            {/* Main content */}
                            <span className="flex-1 truncate text-muted-foreground">
                              {s.satisfaction && `😊 ${s.satisfaction}`}
                              {s.understoodPoints !== undefined && (s.understoodPoints ? '✅ Entiende' : '❌ No entiende')}
                              {s.wasEasy !== undefined && (s.wasEasy ? '✅ Fácil' : '❌ Difícil')}
                              {s.errorType && `⚠️ ${ERROR_LABELS[s.errorType] || s.errorType}`}
                              {s.wasUseful !== undefined && (s.wasUseful === 'no_recuerda' ? '🤷 No recuerda' : s.wasUseful ? '✅ Útil' : '❌ No útil')}
                              {!s.satisfaction && s.understoodPoints === undefined && s.wasEasy === undefined && !s.errorType && s.wasUseful === undefined && (
                                <span className="italic">Sin detalle estructurado</span>
                              )}
                            </span>

                            {/* Timestamp */}
                            <span className="shrink-0 text-muted-foreground/60 tabular-nums" title={formatFullTimestamp(s.createdAt)}>
                              {formatTimestamp(s.createdAt)}
                            </span>
                          </summary>

                          {/* Expandable detail */}
                          <div className="ml-5 pl-4 border-l-2 border-border/40 space-y-1.5 pb-2">
                            {/* Tenant info */}
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Hash size={10} />
                              <span className="font-semibold text-foreground">{tenant?.name || 'Desconocido'}</span>
                              <span className="text-muted-foreground/60">({tenant?.slug || '—'})</span>
                              {tenant?.plan && (
                                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded uppercase">{tenant.plan}</span>
                              )}
                            </div>

                            {/* Location & Order */}
                            {(s.locationId || s.orderId) && (
                              <div className="flex items-center gap-3 text-muted-foreground">
                                {s.locationId && (
                                  <span className="flex items-center gap-1">
                                    <MapPin size={10} /> loc: {s.locationId.toString().slice(-6)}
                                  </span>
                                )}
                                {s.orderId && (
                                  <span className="flex items-center gap-1">
                                    <ShoppingBag size={10} /> orden: {s.orderId}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Full timestamp */}
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock size={10} />
                              {formatFullTimestamp(s.createdAt)}
                            </div>

                            {/* Comment */}
                            {s.comment && (
                              <div className="bg-muted/30 rounded-lg p-2 italic text-muted-foreground border border-border/30">
                                &ldquo;{s.comment}&rdquo;
                              </div>
                            )}

                            {/* Error detail */}
                            {s.errorDetail && (
                              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700">
                                <span className="font-semibold">Detalle:</span> {s.errorDetail}
                              </div>
                            )}

                            {/* Metadata (actual MP error, etc.) */}
                            {s.metadata?.error && (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 font-mono text-[10px] break-all">
                                <span className="font-semibold">Metadata error:</span> {s.metadata.error}
                              </div>
                            )}

                            {/* Extra metadata fields */}
                            {s.metadata && Object.keys(s.metadata).filter(k => k !== 'error').length > 0 && (
                              <div className="bg-muted/20 rounded-lg p-2 text-muted-foreground">
                                <span className="font-semibold">Metadata:</span>{' '}
                                {JSON.stringify(
                                  Object.fromEntries(
                                    Object.entries(s.metadata).filter(([k]) => k !== 'error')
                                  )
                                )}
                              </div>
                            )}

                            {/* clientHash */}
                            {s.clientHash && (
                              <div className="text-[9px] text-muted-foreground/50 font-mono">
                                clientHash: {s.clientHash}
                              </div>
                            )}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {Object.keys(byEvent).length === 0 && (
          <Card className="rounded-2xl border shadow-sm p-10 col-span-2">
            <div className="text-center text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold">Sin respuestas todavía</p>
              <p className="text-sm mt-1">Los feedback aparecerán acá a medida que los usuarios interactúen.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
