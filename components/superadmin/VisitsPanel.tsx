'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Smartphone, Monitor, Globe, Calendar, ChevronDown, ChevronUp, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Tenant {
    _id: string
    name: string
    slug: string
}

interface Visit {
    _id: string
    tenantId: string
    tenant: { name: string; slug: string } | null
    visitedAt: string
    ip: string | null
    userAgent: string | null
    deviceType: string
}

interface VisitsPanelProps {
    tenants: Tenant[]
}

const DEVICE_ICONS = {
    mobile: Smartphone,
    desktop: Monitor,
    unknown: Globe,
}

const DEVICE_COLORS = {
    mobile: 'bg-blue-500/10 text-blue-500',
    desktop: 'bg-purple-500/10 text-purple-500',
    unknown: 'bg-gray-500/10 text-gray-500',
}

export default function VisitsPanel({ tenants }: VisitsPanelProps) {
    const searchParams = useSearchParams()
    const [visits, setVisits] = useState<Visit[]>([])
    const [byTenant, setByTenant] = useState<any[]>([])
    const [summary, setSummary] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState(30)
    const [tenantFilter, setTenantFilter] = useState<string>('')
    const [expandedTenant, setExpandedTenant] = useState<string | null>(null)

    const fetchVisits = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.set('days', days.toString())
            if (tenantFilter) params.set('tenantId', tenantFilter)

            const res = await fetch(`/api/superadmin/visits?${params}`)
            const data = await res.json()
            setVisits(data.visits || [])
            setByTenant(data.byTenant || [])
            setSummary(data.summary || null)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchVisits()
    }, [days, tenantFilter])

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString('es-AR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const deviceIcon = (device: string) => {
        const Icon = DEVICE_ICONS[device as keyof typeof DEVICE_ICONS] || Globe
        return <Icon size={12} />
    }

    const toggleExpand = (tenantId: string) => {
        setExpandedTenant(prev => prev === tenantId ? null : tenantId)
    }

    const visitsForTenant = (tenantId: string) => {
        return visits.filter(v => v.tenantId === tenantId)
    }

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Período:</span>
                    <select
                        value={days}
                        onChange={e => setDays(Number(e.target.value))}
                        className="h-9 text-sm bg-background border border-border/60 rounded-lg px-3"
                    >
                        <option value={7}>Últimos 7 días</option>
                        <option value={30}>Últimos 30 días</option>
                        <option value={90}>Últimos 90 días</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tenant:</span>
                    <select
                        value={tenantFilter}
                        onChange={e => setTenantFilter(e.target.value)}
                        className="h-9 text-sm bg-background border border-border/60 rounded-lg px-3 min-w-[150px]"
                    >
                        <option value="">Todos</option>
                        {tenants.map(t => (
                            <option key={t._id} value={t._id}>{t.name} ({t.slug})</option>
                        ))}
                    </select>
                </div>
                <Button variant="outline" size="sm" onClick={fetchVisits} disabled={loading}>
                    <RefreshCw size={14} className={cn('mr-1', loading && 'animate-spin')} />
                    Actualizar
                </Button>
            </div>

            {/* Summary */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-card border-2 border-border/60 rounded-2xl p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total visitas</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{summary.totalVisits}</p>
                    </div>
                    {summary.byDevice?.map((d: any) => (
                        <div key={d._id} className="bg-card border-2 border-border/60 rounded-2xl p-4">
                            <div className="flex items-center gap-2">
                                <span className={cn('p-1.5 rounded-lg', DEVICE_COLORS[d._id as keyof typeof DEVICE_COLORS])}>
                                    {deviceIcon(d._id)}
                                </span>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    {d._id === 'mobile' ? 'Móvil' : d._id === 'desktop' ? 'Escritorio' : 'Otros'}
                                </p>
                            </div>
                            <p className="text-2xl font-bold text-foreground mt-1">{d.count}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Visits by tenant */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-foreground">Visitas por tenant</h2>
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : byTenant.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-2xl">
                        No hay visitas registradas en este período
                    </div>
                ) : (
                    <div className="space-y-2">
                        {byTenant.map((item: any) => (
                            <div key={item.tenantId} className="bg-card border-2 border-border/60 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => toggleExpand(item.tenantId)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <Globe size={16} className="text-primary" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-foreground text-sm">{item.tenant?.name || 'Unknown'}</p>
                                            <p className="text-xs text-muted-foreground">/{item.tenant?.slug}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-foreground">{item.count}</span>
                                        {expandedTenant === item.tenantId ? (
                                            <ChevronUp size={16} className="text-muted-foreground" />
                                        ) : (
                                            <ChevronDown size={16} className="text-muted-foreground" />
                                        )}
                                    </div>
                                </button>
                                {expandedTenant === item.tenantId && (
                                    <div className="border-t border-border/60">
                                        <div className="max-h-64 overflow-y-auto">
                                            {visitsForTenant(item.tenantId).map((visit: Visit) => (
                                                <div key={visit._id} className="flex items-center justify-between px-4 py-2 border-b border-border/40 last:border-0 hover:bg-muted/30">
                                                    <div className="flex items-center gap-3">
                                                        <span className={cn('p-1 rounded', DEVICE_COLORS[visit.deviceType as keyof typeof DEVICE_COLORS])}>
                                                            {deviceIcon(visit.deviceType)}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground font-mono">{visit.ip || '—'}</span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">{formatDate(visit.visitedAt)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
