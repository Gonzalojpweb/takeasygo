'use client'

import { useState, useTransition, useCallback } from 'react'
import { Shield, Filter, ChevronLeft, ChevronRight, RefreshCw, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tenant { _id: string; name: string; slug: string; plan: string }

interface AuditRow {
  _id: string
  tenantId: string | null
  tenantName: string
  tenantSlug: string
  tenantPlan: string
  userId: string | null
  userName: string
  userRole: string
  action: string
  entity: string
  entityId: string | null
  details: Record<string, any>
  ip: string
  createdAt: string
}

interface Props {
  initialRows:    AuditRow[]
  initialTotal:   number
  initialPages:   number
  tenants:        Tenant[]
}

// ── Action config ──────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'menu.category.created':    { label: 'Categoría creada',    color: 'bg-emerald-100 text-emerald-700' },
  'menu.category.updated':    { label: 'Categoría editada',   color: 'bg-blue-100 text-blue-700' },
  'menu.category.deleted':    { label: 'Categoría eliminada', color: 'bg-red-100 text-red-700' },
  'menu.item.created':        { label: 'Ítem creado',         color: 'bg-emerald-100 text-emerald-700' },
  'menu.item.updated':        { label: 'Ítem editado',        color: 'bg-blue-100 text-blue-700' },
  'menu.item.deleted':        { label: 'Ítem eliminado',      color: 'bg-red-100 text-red-700' },
  'settings.branding.updated':{ label: 'Branding',            color: 'bg-violet-100 text-violet-700' },
  'settings.profile.updated': { label: 'Perfil',              color: 'bg-violet-100 text-violet-700' },
  'settings.mercadopago.updated':{ label: 'MercadoPago',      color: 'bg-amber-100 text-amber-700' },
  'settings.location.created':{ label: 'Sede creada',         color: 'bg-teal-100 text-teal-700' },
  'settings.location.updated':{ label: 'Sede editada',        color: 'bg-teal-100 text-teal-700' },
  'auth.login':               { label: 'Inicio sesión',       color: 'bg-zinc-100 text-zinc-600' },
  'auth.logout':              { label: 'Cierre sesión',       color: 'bg-zinc-100 text-zinc-600' },
  'order.status_changed':     { label: 'Estado pedido',       color: 'bg-orange-100 text-orange-700' },
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial', try: 'Inicial', buy: 'Crecimiento', full: 'Premium', anfitrion: 'Anfitriones',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditoriaPanel({ initialRows, initialTotal, initialPages, tenants }: Props) {
  const [rows,    setRows]    = useState<AuditRow[]>(initialRows)
  const [total,   setTotal]   = useState(initialTotal)
  const [pages,   setPages]   = useState(initialPages)
  const [page,    setPage]    = useState(1)
  const [isPending, startTransition] = useTransition()

  // Filters
  const [tenantId,  setTenantId]  = useState('')
  const [category,  setCategory]  = useState('all')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')

  // Detail drawer
  const [detail, setDetail] = useState<AuditRow | null>(null)

  const loadData = useCallback((p: number, tId: string, cat: string, from: string, to: string) => {
    startTransition(async () => {
      const qs = new URLSearchParams({ page: String(p), limit: '50' })
      if (tId)  qs.set('tenantId', tId)
      if (cat && cat !== 'all') qs.set('category', cat)
      if (from) qs.set('dateFrom', from)
      if (to)   qs.set('dateTo', to)

      const res = await fetch(`/api/superadmin/auditoria?${qs}`)
      if (!res.ok) return
      const data = await res.json()
      setRows(data.rows)
      setTotal(data.total)
      setPages(data.pages)
      setPage(p)
    })
  }, [])

  function applyFilters() { loadData(1, tenantId, category, dateFrom, dateTo) }
  function goPage(p: number) { loadData(p, tenantId, category, dateFrom, dateTo) }

  return (
    <div className="space-y-6">

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={15} className="text-muted-foreground" />
          <span className="text-sm font-bold">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Tenant */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Tenant</label>
            <select
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              className="w-full text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos los tenants</option>
              {tenants.map(t => (
                <option key={t._id} value={t._id}>{t.name} · {PLAN_LABELS[t.plan] ?? t.plan}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Categoría</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">Todas las acciones</option>
              <option value="menu">Cambios de menú</option>
              <option value="settings">Configuración</option>
              <option value="auth">Login / Logout</option>
              <option value="orders">Pedidos</option>
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={applyFilters}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? <RefreshCw size={14} className="animate-spin" /> : <Filter size={14} />}
            Aplicar filtros
          </button>
          <button
            onClick={() => { setTenantId(''); setCategory('all'); setDateFrom(''); setDateTo(''); loadData(1, '', 'all', '', '') }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpiar
          </button>
          <span className="ml-auto text-xs text-muted-foreground font-medium">
            {total.toLocaleString('es-AR')} registros
          </span>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['Fecha', 'Tenant', 'Usuario', 'Acción', 'Entidad', 'Detalle'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-muted-foreground text-sm">
                    Sin registros para los filtros seleccionados
                  </td>
                </tr>
              )}
              {rows.map(row => {
                const ac = ACTION_LABELS[row.action] ?? { label: row.action, color: 'bg-zinc-100 text-zinc-600' }
                return (
                  <tr key={row._id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">

                    {/* Fecha */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>

                    {/* Tenant */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-xs">{row.tenantName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{row.tenantSlug}</div>
                    </td>

                    {/* Usuario */}
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium">{row.userName || '—'}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{row.userRole}</div>
                    </td>

                    {/* Acción */}
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap', ac.color)}>
                        {ac.label}
                      </span>
                    </td>

                    {/* Entidad */}
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {row.entity}{row.entityId ? ` #${row.entityId.slice(-6)}` : ''}
                    </td>

                    {/* Detalle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetail(row)}
                        className="text-primary hover:text-primary/70 transition-colors"
                        title="Ver detalle"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <button onClick={() => goPage(page - 1)} disabled={page <= 1 || isPending}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
              <ChevronLeft size={15} /> Anterior
            </button>
            <span className="text-xs text-muted-foreground">Página {page} de {pages}</span>
            <button onClick={() => goPage(page + 1)} disabled={page >= pages || isPending}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
              Siguiente <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {/* ── Detail drawer ──────────────────────────────────────────── */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-background rounded-2xl border shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-primary" />
              <h2 className="font-black text-lg">Detalle del evento</h2>
              <button onClick={() => setDetail(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>

            <div className="space-y-2 text-sm">
              {[
                ['Fecha',    new Date(detail.createdAt).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })],
                ['Tenant',   `${detail.tenantName} (${detail.tenantSlug})`],
                ['Plan',     PLAN_LABELS[detail.tenantPlan] ?? detail.tenantPlan],
                ['Usuario',  detail.userName || '—'],
                ['Rol',      detail.userRole || '—'],
                ['Acción',   detail.action],
                ['Entidad',  detail.entity],
                ['ID',       detail.entityId ?? '—'],
                ['IP',       detail.ip || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="w-20 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="font-medium break-all">{v}</span>
                </div>
              ))}
            </div>

            {detail.details && Object.keys(detail.details).length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-2">Datos adicionales</p>
                <pre className="text-xs bg-muted/50 rounded-xl p-3 overflow-auto max-h-48 font-mono">
                  {JSON.stringify(detail.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
