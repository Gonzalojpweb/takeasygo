'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, MapPin, Settings, Users, Search, ArrowUpAZ, ArrowDownAZ, Clock, Pause, Play } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/plans'
import { toast } from 'sonner'

type Tenant = {
  _id: string
  name: string
  slug: string
  plan: Plan
  status: 'active' | 'paused' | 'deleted'
  isActive: boolean
  pausedAt?: string | null
  pausedReason?: string
  createdAt: string
}

type SortKey = 'az' | 'za' | 'newest' | 'oldest'

const PLAN_OPTIONS = [
  { value: 'all', label: 'Todos los planes' },
  { value: 'founder', label: 'Anfitriones' },
  { value: 'try', label: 'Inicial' },
  { value: 'buy', label: 'Crecimiento' },
  { value: 'full', label: 'Premium' },
]

const SORT_OPTIONS: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: 'az',     label: 'A → Z',   icon: <ArrowUpAZ size={14} /> },
  { value: 'za',     label: 'Z → A',   icon: <ArrowDownAZ size={14} /> },
  { value: 'newest', label: 'Más nuevo', icon: <Clock size={14} /> },
  { value: 'oldest', label: 'Más antiguo', icon: <Clock size={14} className="opacity-50" /> },
]

export default function TenantsListClient({ tenants }: { tenants: Tenant[] }) {
  const [search, setSearch]   = useState('')
  const [sort, setSort]       = useState<SortKey>('newest')
  const [plan, setPlan]       = useState('all')
  const [status, setStatus]   = useState('all') // 'all' | 'active' | 'paused' | 'deleted'

  const handlePause = async (tenantId: string) => {
    const reason = prompt('Razón para pausar el tenant:')
    if (!reason?.trim()) return

    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })

      if (res.ok) {
        toast.success('Tenant pausado exitosamente')
        window.location.reload()
      } else {
        const error = await res.json()
        toast.error(error.error || 'Error al pausar tenant')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  const handleResume = async (tenantId: string) => {
    if (!confirm('¿Reactivar este tenant?')) return

    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/resume`, {
        method: 'POST',
      })

      if (res.ok) {
        toast.success('Tenant reactivado exitosamente')
        window.location.reload()
      } else {
        const error = await res.json()
        toast.error(error.error || 'Error al reactivar tenant')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  const filtered = useMemo(() => {
    let list = [...tenants]

    // Búsqueda
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q)
      )
    }

    // Filtro plan
    if (plan !== 'all') {
      list = list.filter(t => t.plan === plan)
    }

    // Filtro estado
    if (status === 'active')  list = list.filter(t => t.status === 'active')
    if (status === 'paused')  list = list.filter(t => t.status === 'paused')
    if (status === 'deleted') list = list.filter(t => t.status === 'deleted')

    // Ordenamiento
    list.sort((a, b) => {
      if (sort === 'az')     return a.name.localeCompare(b.name, 'es')
      if (sort === 'za')     return b.name.localeCompare(a.name, 'es')
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return 0
    })

    return list
  }, [tenants, search, sort, plan, status])

  return (
    <div className="space-y-6">
      {/* Barra de controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre o slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-border/60 bg-background text-sm font-medium focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Filtro plan */}
        <select
          value={plan}
          onChange={e => setPlan(e.target.value)}
          className="px-3 py-2.5 rounded-xl border-2 border-border/60 bg-background text-sm font-medium focus:outline-none focus:border-primary transition-colors cursor-pointer"
        >
          {PLAN_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filtro estado */}
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl border-2 border-border/60 bg-background text-sm font-medium focus:outline-none focus:border-primary transition-colors cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="paused">Pausados</option>
          <option value="deleted">Eliminados</option>
        </select>

        {/* Orden */}
        <div className="flex gap-1 p-1 rounded-xl border-2 border-border/60 bg-background">
          {SORT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setSort(o.value)}
              title={o.label}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                sort === o.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {o.icon}
              <span className="hidden sm:inline">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Contador de resultados */}
      <p className="text-xs font-bold text-muted-foreground">
        {filtered.length === tenants.length
          ? `${tenants.length} tenants`
          : `${filtered.length} de ${tenants.length} tenants`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-muted-foreground font-bold">Sin resultados para &quot;{search}&quot;</p>
          <button
            onClick={() => { setSearch(''); setPlan('all'); setStatus('all') }}
            className="text-xs text-primary font-bold underline underline-offset-4"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((tenant) => (
            <Card key={tenant._id} className="bg-card border-2 border-border/60 shadow-md hover:shadow-xl transition-all duration-300 group overflow-hidden rounded-2xl">
              <CardHeader className="pb-4 relative">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xl shadow-inner group-hover:bg-primary group-hover:text-white transition-all duration-500 transform group-hover:rotate-2">
                    {tenant.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-bold text-lg truncate group-hover:text-primary transition-colors">{tenant.name}</p>
                    <p className="text-muted-foreground text-xs font-mono font-bold">{tenant.slug}</p>
                  </div>
                  <Badge className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border-2",
                    PLAN_COLORS[tenant.plan] ?? "bg-muted text-muted-foreground border-muted"
                  )}>
                    {PLAN_LABELS[tenant.plan] ?? tenant.plan}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-0">
                 <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/40">
                   <div className="flex items-center gap-2">
                     <div className={cn(
                       "w-2.5 h-2.5 rounded-full shadow-[0_0_8px]",
                       tenant.status === 'active' ? "bg-emerald-500 shadow-emerald-500/50" :
                       tenant.status === 'paused' ? "bg-amber-500 shadow-amber-500/50" :
                       "bg-red-500 shadow-red-500/50"
                     )} />
                     <span className="text-xs font-bold uppercase tracking-tighter">
                       {tenant.status === 'active' ? 'Activo' :
                        tenant.status === 'paused' ? 'Pausado' :
                        'Eliminado'}
                     </span>
                   </div>
                   <p className="text-[10px] text-muted-foreground font-bold">
                     Desde: {new Date(tenant.createdAt).toLocaleDateString('es-AR')}
                   </p>
                 </div>

                 <div className="flex items-center gap-2">
                   <Link href={`/${tenant.slug}/admin`} target="_blank" className="flex-1">
                     <Button variant="outline" size="sm" className="w-full rounded-xl font-bold text-xs border-2 hover:bg-primary hover:border-primary hover:text-white transition-all group/btn">
                       <ExternalLink className="mr-2 h-3 w-3 group-hover/btn:scale-110 transition-transform" /> Admin
                     </Button>
                   </Link>
                   <Link href={`/superadmin/tenants/${tenant._id}/locations`} className="flex-1">
                     <Button variant="outline" size="sm" className="w-full rounded-xl font-bold text-xs border-2 hover:bg-primary hover:border-primary hover:text-white transition-all group/btn">
                       <MapPin className="mr-2 h-3 w-3 group-hover/btn:scale-110 transition-transform" /> Sedes
                     </Button>
                   </Link>
                   <Link href={`/superadmin/tenants/${tenant._id}/users`}>
                     <Button variant="outline" size="sm" className="h-9 w-9 rounded-xl p-0 border-2 hover:bg-primary hover:border-primary hover:text-white transition-all" title="Usuarios">
                       <Users className="h-4 w-4" />
                     </Button>
                   </Link>
                   <Link href={`/superadmin/tenants/${tenant._id}/edit`}>
                     <Button variant="outline" size="sm" className="h-9 w-9 rounded-xl p-0 border-2 hover:bg-primary hover:border-primary hover:text-white transition-all">
                       <Settings className="h-4 w-4" />
                     </Button>
                   </Link>
                   {tenant.status === 'active' && (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => handlePause(tenant._id)}
                       className="h-9 w-9 rounded-xl p-0 border-2 hover:bg-amber-500 hover:border-amber-500 hover:text-white transition-all"
                       title="Pausar tenant"
                     >
                       <Pause className="h-4 w-4" />
                     </Button>
                   )}
                   {tenant.status === 'paused' && (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => handleResume(tenant._id)}
                       className="h-9 w-9 rounded-xl p-0 border-2 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white transition-all"
                       title="Reactivar tenant"
                     >
                       <Play className="h-4 w-4" />
                     </Button>
                   )}
                 </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
