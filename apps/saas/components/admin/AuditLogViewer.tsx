'use client'

import { useState, useCallback, useEffect } from 'react'
import { Shield, ChevronLeft, ChevronRight, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const inputCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

const selectCls =
  'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

interface AuditEntry {
  _id: string
  userName: string
  userRole: string
  action: string
  entity: string
  entityId: string | null
  details: Record<string, any>
  ip: string
  createdAt: string
}

interface AuditResponse {
  entries: AuditEntry[]
  total: number
  page: number
  pages: number
}

const ACTION_LABELS: Record<string, string> = {
  'order.status_changed': 'Cambio de estado',
  'settings.mercadopago_updated': 'Config. MercadoPago',
}

const ENTITY_COLORS: Record<string, string> = {
  order: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  settings: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  printer: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  user: 'bg-green-500/10 text-green-400 border-green-500/20',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  manager: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  cashier: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  staff: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  superadmin: 'bg-red-500/10 text-red-400 border-red-500/20',
}

function formatDetails(action: string, details: Record<string, any>): string {
  if (action === 'order.status_changed') {
    return `${details.orderNumber ?? ''}: ${details.from} → ${details.to}`
  }
  if (action === 'settings.mercadopago_updated') {
    return details.hasWebhookSecret ? 'Con webhook secret' : 'Sin webhook secret'
  }
  const entries = Object.entries(details)
  if (!entries.length) return '—'
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
}

export default function AuditLogViewer({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('')

  const load = useCallback(
    async (p: number, ent: string, q: string) => {
      setLoading(true)
      try {
        const sp = new URLSearchParams({ page: String(p) })
        if (ent) sp.set('entity', ent)
        if (q) sp.set('action', q)
        const res = await fetch(`/api/${tenantSlug}/audit?${sp}`)
        if (!res.ok) throw new Error()
        setData(await res.json())
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    },
    [tenantSlug]
  )

  useEffect(() => {
    load(1, '', '')
  }, [load])

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(1)
    load(1, entity, search)
  }

  const goPage = (p: number) => {
    setPage(p)
    load(p, entity, search)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Buscar por acción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={entity}
          onChange={e => setEntity(e.target.value)}
          className={selectCls}
        >
          <option value="">Todas las entidades</option>
          <option value="order">Pedidos</option>
          <option value="settings">Configuración</option>
          <option value="printer">Impresoras</option>
          <option value="user">Usuarios</option>
        </select>
        <Button type="submit" variant="outline" disabled={loading}>
          <Search size={16} className="mr-2" />
          Filtrar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={loading}
          onClick={() => load(page, entity, search)}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
      </form>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuario</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Acción</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Entidad</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && (!data || data.entries.length === 0) && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Shield size={32} className="mx-auto mb-3 opacity-30" />
                    No hay registros de auditoría aún.
                  </td>
                </tr>
              )}
              {!loading &&
                data?.entries.map(entry => (
                  <tr
                    key={entry._id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {fmtDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground leading-none">{entry.userName}</div>
                      <Badge
                        variant="outline"
                        className={`mt-1 text-[10px] px-1.5 py-0 ${ROLE_COLORS[entry.userRole] ?? ROLE_COLORS.staff}`}
                      >
                        {entry.userRole}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 ${ENTITY_COLORS[entry.entity] ?? ''}`}
                      >
                        {entry.entity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDetails(entry.action, entry.details)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data.total} registros · página {data.page} de {data.pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => goPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pages || loading}
              onClick={() => goPage(page + 1)}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
