'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, Search, Loader2, ChevronLeft, ChevronRight,
  ArrowUpDown, Store, ShoppingCart, DollarSign, Clock, Award,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import ConsumerDetailModal from './ConsumerDetailModal'

interface Consumer {
  _id: string
  name: string
  email: string
  phone: string
  phoneHash: string
  tenantIds: string[]
  totalOrders: number
  totalSpent: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  isLoyaltyMember: boolean
  createdAt: string
}

interface Tenant {
  _id: string
  name: string
  slug: string
}

export default function ConsumersList() {
  const [consumers, setConsumers] = useState<Consumer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [sortBy, setSortBy] = useState('lastOrderAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null)

  const fetchConsumers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (tenantId) params.set('tenantId', tenantId)
      params.set('page', String(page))
      params.set('limit', '20')
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)

      const res = await fetch(`/api/superadmin/consumers?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setConsumers(data.consumers || [])
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      toast.error('Error al cargar consumidores')
    } finally {
      setLoading(false)
    }
  }, [search, tenantId, page, sortBy, sortOrder])

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/tenants?limit=500')
      if (!res.ok) return
      const data = await res.json()
      setTenants(data.tenants || [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchConsumers() }, [fetchConsumers])
  useEffect(() => { fetchTenants() }, [fetchTenants])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-[10px] uppercase font-black tracking-wider text-muted-foreground/50 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown size={12} className={cn(sortBy === field ? 'text-primary' : 'opacity-30')} />
    </button>
  )

  const formatCurrency = (n: number) => `$${n.toLocaleString('es-AR')}`

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Consumidores</h1>
            <p className="text-xs text-muted-foreground">{total} registros</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nombre o email..."
            className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-xl pl-10 pr-4 py-2.5 outline-none transition-all"
          />
        </div>
        <select
          value={tenantId}
          onChange={(e) => { setTenantId(e.target.value); setPage(1) }}
          className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-4 py-2.5 outline-none transition-all"
        >
          <option value="">Todos los tenants</option>
          {tenants.map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="text-left px-5 py-4"><SortHeader field="name" label="Nombre" /></th>
                <th className="text-left px-5 py-4"><SortHeader field="email" label="Email" /></th>
                <th className="text-left px-5 py-4 hidden md:table-cell">Teléfono</th>
                <th className="text-left px-5 py-4 hidden lg:table-cell"><SortHeader field="tenantIds" label="Tenants" /></th>
                <th className="text-right px-5 py-4"><SortHeader field="totalOrders" label="Órdenes" /></th>
                <th className="text-right px-5 py-4"><SortHeader field="totalSpent" label="Total" /></th>
                <th className="text-right px-5 py-4 hidden md:table-cell"><SortHeader field="lastOrderAt" label="Última" /></th>
                <th className="text-center px-5 py-4">Club</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : consumers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Users size={40} className="mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground font-medium">No hay consumidores</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      Los consumidores se crean automáticamente cuando se realizan pedidos
                    </p>
                  </td>
                </tr>
              ) : (
                consumers.map((c) => (
                  <tr
                    key={c._id}
                    onClick={() => setSelectedConsumer(c)}
                    className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4 font-medium">{c.name || <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-5 py-4 text-muted-foreground">{c.email || '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs bg-muted/40 px-2.5 py-1 rounded-lg">
                        <Store size={12} className="text-muted-foreground" />
                        {c.tenantIds.length}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono">{c.totalOrders}</td>
                    <td className="px-5 py-4 text-right font-mono font-medium">{formatCurrency(c.totalSpent)}</td>
                    <td className="px-5 py-4 text-right text-muted-foreground hidden md:table-cell">
                      {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {c.isLoyaltyMember ? (
                        <Award size={16} className="inline text-amber-500" />
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages} ({total} registros)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl border-2 border-border/60 disabled:opacity-30 hover:bg-muted/30 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl border-2 border-border/60 disabled:opacity-30 hover:bg-muted/30 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedConsumer && (
        <ConsumerDetailModal
          consumer={selectedConsumer}
          onClose={() => setSelectedConsumer(null)}
        />
      )}
    </div>
  )
}
