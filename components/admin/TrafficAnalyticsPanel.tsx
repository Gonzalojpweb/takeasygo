'use client'

import { useState, useEffect } from 'react'
import { 
  Smartphone, Monitor, Globe, TrendingUp, Users, 
  Instagram, QrCode, MessageCircle, Facebook, Search, MousePointer,
  Calendar, RefreshCw, ChevronDown, ChevronUp
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
  other: Globe,
}

const SOURCE_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  qr: 'QR Code',
  whatsapp: 'WhatsApp',
  google: 'Google',
  direct: 'Directo',
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
  other: 'bg-slate-500/10 text-slate-500',
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            De dónde vienen tus clientes
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {summary.bySource.map((source: any) => {
              const sourceKey = KNOWN_SOURCES.includes(source._id) ? source._id : 'other'
              const Icon = SOURCE_ICONS[sourceKey] || Globe
              return (
                <div key={source._id} className="bg-muted/30 rounded-xl p-4 text-center">
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

      {/* Dispositivos */}
      {summary?.byDevice && summary.byDevice.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Dispositivos
          </h3>
          <div className="flex flex-wrap gap-3">
            {summary.byDevice.map((device: any) => {
              const Icon = DEVICE_ICONS[device._id] || Globe
              return (
                <div key={device._id} className="flex items-center gap-3 bg-muted/30 rounded-xl px-4 py-3">
                  <Icon size={18} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{DEVICE_NAMES[device._id]}</p>
                    <p className="text-lg font-bold text-foreground">{device.count}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Gráfico por día */}
      {data?.byDay && data.byDay.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Visitas por día
          </h3>
          <div className="bg-muted/30 rounded-xl p-4">
            <div className="flex items-end gap-1 h-32">
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
                    <span className="text-[10px] text-muted-foreground rotate-45 origin-left translate-y-2">
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
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Visitas recientes
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.visits.slice(0, 20).map((visit: any) => {
              const sourceKey = KNOWN_SOURCES.includes(visit.source) ? visit.source : 'other'
              const SourceIcon = SOURCE_ICONS[sourceKey] || Globe
              const DeviceIcon = DEVICE_ICONS[visit.deviceType] || Globe
              return (
                <div key={visit._id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className={cn('p-1.5 rounded', getSourceColor(visit.source))} title={getSourceLabel(visit.source)}>
                      <SourceIcon size={14} />
                    </span>
                    <DeviceIcon size={14} className="text-muted-foreground" />
                    {visit.locationPath && (
                      <span className="text-xs text-muted-foreground">{visit.locationPath}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
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
