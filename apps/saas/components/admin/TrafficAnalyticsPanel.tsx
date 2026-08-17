'use client'

import { useState, useEffect } from 'react'
import { 
  Smartphone, Monitor, Globe, TrendingUp, Users, 
  Instagram, QrCode, MessageCircle, Facebook, Search, MousePointer,
  Calendar, RefreshCw, ChevronDown, ChevronUp, Info, Tag
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface TrafficAnalyticsPanelProps {
  tenantSlug: string
}

const SOURCE_ICONS: Record<string, any> = {
  instagram: Instagram,
  facebook: Facebook,
  qr: QrCode,
  whatsapp: MessageCircle,
  google: Search,
  direct: MousePointer,
  'tgo-explore': Globe,
  'tgo-customer': Globe,
  other: Globe,
}

const SOURCE_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  qr: 'QR Code',
  whatsapp: 'WhatsApp',
  google: 'Google',
  direct: 'Directo',
  'tgo-explore': 'TGO Explore',
  'tgo-customer': 'TAKEASYGO-CUSTOMER',
  other: 'Otro',
}

const KNOWN_SOURCES = Object.keys(SOURCE_NAMES)

const SOURCE_COLORS: Record<string, string> = {
  instagram: 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 text-pink-500',
  facebook: 'bg-blue-600/10 text-blue-600',
  qr: 'bg-emerald-500/10 text-emerald-500',
  whatsapp: 'bg-green-500/10 text-green-500',
  google: 'bg-red-500/10 text-red-500',
  direct: 'bg-gray-500/10 text-gray-500',
  'tgo-explore': 'bg-cyan-500/10 text-cyan-600',
  'tgo-customer': 'bg-[#f74211]/10 text-[#f74211]',
  other: 'bg-slate-500/10 text-slate-500',
}

const SOURCE_TOOLTIPS: Record<string, string> = {
  instagram: 'Usuarios que llegaron desde Instagram (link en bio, historia, anuncio o perfil). Se detecta por el parámetro ?source=instagram, por el referer de instagram.com, o por el user-agent del navegador in-app de Instagram.',
  facebook: 'Usuarios que llegaron desde Facebook (publicación, página o anuncio). Se detecta por el parámetro ?source=facebook o por referer de facebook.com o fb.com.',
  qr: 'Usuarios que escanearon un código QR. Se detecta por el parámetro ?source=qr o ?source=qr-{identificador} (ej: qr-mesa1, qr-calle). El identificador después del guión permite rastrear QRs específicos.',
  whatsapp: 'Usuarios que llegaron desde un enlace compartido por WhatsApp. Se detecta por el parámetro ?source=whatsapp o por referer de whatsapp.com o wa.me.',
  google: 'Usuarios que llegaron desde una búsqueda en Google. Se detecta por el parámetro ?source=google o por referer de google.com.',
  direct: 'Usuarios que ingresaron sin referer ni parámetro ?source=. Esto incluye: escribir la URL directamente, usar un marcador/favorito, o que el navegador no haya enviado el referer por políticas de privacidad.',
  'tgo-explore': 'Usuarios que llegaron desde el explorador de restaurantes de TakeasyGO (sección /app o /explore). Corresponde a navegación orgánica dentro de la misma plataforma.',
  'tgo-customer': 'Clientes que llegaron a través del link compartido directamente por el fundador/superadmin de TakeasyGO. Se detecta por el parámetro ?source=tgo-customer en la URL del menú.',
  other: 'Usuarios cuyo referer no coincide con ninguna red social ni fuente conocida. Puede incluir: newsletters, enlaces desde otros sitios web, apps de mensajería no identificadas, bots, o tráfico sin clasificar.',
}

function getSourceTooltip(source: string): string {
  if (SOURCE_TOOLTIPS[source]) return SOURCE_TOOLTIPS[source]
  return `Valor personalizado configurado en el enlace: "${source}". Este valor se define con el parámetro ?source=${source} en la URL. Revisá desde dónde compartiste ese enlace para identificar el origen.`
}

const DEVICE_TOOLTIPS: Record<string, string> = {
  mobile: 'Visitantes que accedieron desde un teléfono móvil o tablet',
  desktop: 'Visitantes que accedieron desde una computadora de escritorio o notebook',
  unknown: 'No se pudo determinar el tipo de dispositivo',
}

function getDeviceTooltip(device: string): string {
  return DEVICE_TOOLTIPS[device] || DEVICE_TOOLTIPS.unknown
}

function getSourceLabel(source: string): string {
  return SOURCE_NAMES[source] || source
}

function getSourceColor(source: string): string {
  return KNOWN_SOURCES.includes(source) ? SOURCE_COLORS[source] : SOURCE_COLORS.other
}

const DEVICE_ICONS: Record<string, any> = {
  mobile: Smartphone,
  desktop: Monitor,
  unknown: Globe,
}

const DEVICE_NAMES: Record<string, string> = {
  mobile: 'Móvil',
  desktop: 'Escritorio',
  unknown: 'Desconocido',
}

export default function TrafficAnalyticsPanel({ tenantSlug }: TrafficAnalyticsPanelProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/analytics/traffic?days=${days}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [days, tenantSlug])

  if (loading) {
    return (
      <div className="bg-card border-2 border-border/60 rounded-2xl p-8">
        <div className="text-center text-muted-foreground">Cargando analytics...</div>
      </div>
    )
  }

  const summary = data?.summary

  return (
    <div className="bg-card border-2 border-border/60 rounded-2xl p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <TrendingUp size={20} className="text-primary" />
            Estadísticas de Tráfico
          </h2>
          <p className="text-sm text-muted-foreground">
            Visitas a tu menú en los últimos {days} días
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 text-sm bg-background border border-border/60 rounded-lg px-3"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Total */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Total Visitas
          </p>
          <p className="text-3xl font-bold text-foreground mt-2">
            {summary?.totalVisits || 0}
          </p>
        </div>
      </div>

      {/* Fuentes de tráfico */}
            {summary?.bySource && summary.bySource.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            De dónde vienen tus clientes
            <span className="relative group">
              <Info size={14} className="text-muted-foreground/60 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                Cada visita se clasifica según cómo llegó el usuario al menú: por red social, código QR, enlace directo, buscador, etc.
              </span>
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {summary.bySource.map((source: any) => {
              const sourceKey = KNOWN_SOURCES.includes(source._id) ? source._id : 'other'
              const Icon = SOURCE_ICONS[sourceKey] || Globe
              return (
                <div key={source._id} className="bg-muted/30 rounded-xl p-4 text-center relative group">
                  <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-help">
                    <Info size={12} className="text-muted-foreground/50" />
                    <span className="absolute top-0 right-full mr-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg pointer-events-none text-left">
                      {getSourceTooltip(source._id)}
                    </span>
                  </span>
                  <span className={cn('inline-flex p-2 rounded-lg mb-2', getSourceColor(source._id))}>
                    <Icon size={20} />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {getSourceLabel(source._id)}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{source.count}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Promociones */}
      {data?.byPromo && data.byPromo.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Promociones activas
            <span className="relative group">
              <Info size={14} className="text-muted-foreground/60 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                Visitas generadas desde enlaces con promoción activa (?promo=...)
              </span>
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.byPromo.map((promo: any) => (
              <div key={promo._id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
                <span className="inline-flex p-2 rounded-lg mb-2 bg-amber-500/10 text-amber-600">
                  <Tag size={20} />
                </span>
                <p className="text-sm font-medium text-foreground capitalize">{promo._id}</p>
                <p className="text-2xl font-bold text-foreground">{promo.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispositivos */}
      {summary?.byDevice && summary.byDevice.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Dispositivos
            <span className="relative group">
              <Info size={14} className="text-muted-foreground/60 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                Tipo de dispositivo desde el que los usuarios accedieron al menú
              </span>
            </span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {summary.byDevice.map((device: any) => {
              const Icon = DEVICE_ICONS[device._id] || Globe
              return (
                <div key={device._id} className="flex items-center gap-3 bg-muted/30 rounded-xl px-4 py-3 relative group cursor-help">
                  <Icon size={18} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{DEVICE_NAMES[device._id]}</p>
                    <p className="text-lg font-bold text-foreground">{device.count}</p>
                  </div>
                  <Info size={12} className="text-muted-foreground/30 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-left">
                    {getDeviceTooltip(device._id)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Gráfico por día */}
      {data?.byDay && data.byDay.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Visitas por día
            <span className="relative group">
              <Info size={14} className="text-muted-foreground/60 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                Distribución de visitas día por día en el período seleccionado
              </span>
            </span>
          </h3>
          <div className="bg-muted/30 rounded-xl p-4 overflow-x-auto">
            <div className="flex items-end gap-1 h-32 min-w-[300px]">
              {data.byDay.map((day: any) => {
                const maxCount = Math.max(...data.byDay.map((d: any) => d.count))
                const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${day.date}: ${day.count} visitas`}
                  >
                    <div
                      className="w-full bg-primary/60 rounded-t"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    <span className="text-[9px] text-muted-foreground rotate-45 origin-left translate-y-2">
                      {day.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Visitas recientes */}
      {data?.visits && data.visits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Visitas recientes
            <span className="relative group">
              <Info size={14} className="text-muted-foreground/60 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                Últimas 20 visitas registradas al menú, con su origen y tipo de dispositivo
              </span>
            </span>
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.visits.slice(0, 20).map((visit: any) => {
              const sourceKey = KNOWN_SOURCES.includes(visit.source) ? visit.source : 'other'
              const SourceIcon = SOURCE_ICONS[sourceKey] || Globe
              const DeviceIcon = DEVICE_ICONS[visit.deviceType] || Globe
              return (
                <div key={visit._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('p-1.5 rounded relative group/icon', getSourceColor(visit.source))}>
                      <SourceIcon size={14} />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10 text-left whitespace-normal">
                        {getSourceTooltip(visit.source)}
                      </span>
                    </span>
                    <span className="relative group/device">
                      <DeviceIcon size={14} className="text-muted-foreground cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-xs text-white bg-zinc-800 rounded-lg shadow-lg opacity-0 group-hover/device:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                        {getDeviceTooltip(visit.deviceType)}
                      </span>
                    </span>
                    {visit.locationPath && (
                      <span className="text-xs text-muted-foreground truncate">{visit.locationPath}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(visit.visitedAt).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
