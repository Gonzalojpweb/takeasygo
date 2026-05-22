import { connectDB } from '@/lib/mongoose'
import Feedback from '@/models/Feedback'
import Tenant from '@/models/Tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MessageSquare, ThumbsUp, ThumbsDown, Meh, AlertTriangle,
  ShoppingBag, Star, MapPin, Gift, Calendar, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const VARIANT_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  checkout_success:  { label: 'Checkout exitoso',    icon: ShoppingBag, color: 'text-emerald-600' },
  checkout_error:    { label: 'Error en checkout',   icon: AlertTriangle, color: 'text-red-600' },
  club_registered:   { label: 'Registro club',       icon: Star, color: 'text-amber-600' },
  redeem_completed:  { label: 'Canje completado',    icon: Gift, color: 'text-violet-600' },
  geofence_notified: { label: 'Notificados (geo)',   icon: MapPin, color: 'text-cyan-600' },
}

export const dynamic = 'force-dynamic'

export default async function SuperAdminFeedbackPage() {
  await connectDB()

  const events = await Feedback.find().sort({ createdAt: -1 }).limit(500).lean()

  const tenants = await Tenant.find({ _id: { $in: [...new Set(events.map(e => e.tenantId.toString()))] } })
    .select('slug name')
    .lean()

  const tenantMap = Object.fromEntries(tenants.map(t => [t._id.toString(), t]))

  // Aggregate by variant
  const byEvent: Record<string, { total: number; positive: number; negative: number; samples: any[] }> = {}
  const errorBreakdown: Record<string, number> = {}
  let errorCount = 0

  for (const e of events) {
    const ev = e.event || 'unknown'
    if (!byEvent[ev]) byEvent[ev] = { total: 0, positive: 0, negative: 0, samples: [] }
    byEvent[ev].total++
    if (byEvent[ev].samples.length < 5) byEvent[ev].samples.push(e)

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
    }
  }

  const totalFeedback = events.length
  const last7d = events.filter(e => e.createdAt && new Date(e.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length

  const errorAlertTypes = Object.entries(errorBreakdown)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Feedback UX</h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <MessageSquare size={14} className="text-primary" />
          Respuestas de usuarios en todos los tenants
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums text-emerald-800">{Object.keys(byEvent).length}</p>
        </Card>
      </div>

      {/* Alerts: error thresholds */}
      {errorAlertTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Alertas — errores recurrentes</p>
          {errorAlertTypes.map(([type, count]) => {
            const labels: Record<string, string> = {
              pago_rechazado: 'Pago rechazado',
              pantalla_trabada: 'Pantalla trabada',
              precio_incorrecto: 'Precio incorrecto',
              metodo_pago_no_encontrado: 'Método de pago no encontrado',
              otro: 'Otro',
            }
            return (
              <div key={type} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-medium">
                <AlertTriangle size={16} className="text-red-500 shrink-0" />
                <span className="flex-1 text-red-800">
                  <span className="font-bold">{count}x</span> {labels[type] || type}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                  supera umbral
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* By variant */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(byEvent).map(([ev, data]) => {
          const meta = VARIANT_LABELS[ev] || { label: ev, icon: MessageSquare, color: 'text-muted-foreground' }
          const Icon = meta.icon
          const positiveRate = data.total > 0 ? Math.round((data.positive / (data.positive + data.negative)) * 100) : null

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
                        className={cn('h-full rounded-full transition-all', positiveRate >= 70 ? 'bg-emerald-500' : positiveRate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                        style={{ width: `${positiveRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums">{positiveRate}% positivo</span>
                  </div>
                )}
                {ev === 'checkout_error' && errorBreakdown && (
                  <div className="space-y-1.5">
                    {Object.entries(errorBreakdown).map(([errType, count]) => (
                      <div key={errType} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{errType.replace(/_/g, ' ')}</span>
                        <span className="font-bold tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.samples.length > 0 && (
                  <div className="text-xs text-muted-foreground border-t border-border/40 pt-3 space-y-1.5">
                    <p className="font-semibold text-foreground">Últimas respuestas:</p>
                    {data.samples.map((s, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="truncate">
                          {s.satisfaction && `Satisfacción: ${s.satisfaction}`}
                          {s.understoodPoints !== undefined && `Entiende puntos: ${s.understoodPoints ? 'Sí' : 'No'}`}
                          {s.wasEasy !== undefined && `Fácil: ${s.wasEasy ? 'Sí' : 'No'}`}
                          {s.errorType && `Error: ${s.errorType}`}
                          {!s.satisfaction && s.understoodPoints === undefined && s.wasEasy === undefined && !s.errorType && '(sin detalle)'}
                        </span>
                        <span className="text-muted-foreground/60 shrink-0 ml-2">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-AR') : ''}
                        </span>
                      </div>
                    ))}
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
