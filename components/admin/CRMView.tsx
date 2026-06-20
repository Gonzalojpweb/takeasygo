'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronDown, Download, Users, ArrowUpDown, Loader2, Phone, Mail, ShoppingBag, DollarSign, Calendar, Award, ChevronLeft, ChevronRight } from 'lucide-react'

interface Consumer {
  _id: string
  name: string
  phone: string
  email: string
  totalOrders: number
  totalSpent: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  isLoyaltyMember: boolean
}

interface Props {
  tenantSlug: string
}

type SortField = 'lastOrderAt' | 'totalOrders' | 'totalSpent' | 'name'
type SortOrder = 'asc' | 'desc'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString('es-AR')}`
}

export default function CRMView({ tenantSlug }: Props) {
  const [consumers, setConsumers] = useState<Consumer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('lastOrderAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const load = useCallback(async (p: number, s: string, sb: SortField, so: SortOrder) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '50',
        sortBy: sb,
        order: so,
      })
      if (s) params.set('search', s)

      const res = await fetch(`/api/${tenantSlug}/crm/customers?${params}`)
      if (!res.ok) throw new Error('Error al cargar')

      const data = await res.json()
      setConsumers(data.consumers)
      setTotal(data.total)
      setPage(data.page)
      setPages(data.pages)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load(page, search, sortBy, sortOrder)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(1)
    load(1, search, sortBy, sortOrder)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      const newOrder = sortOrder === 'desc' ? 'asc' : 'desc'
      setSortOrder(newOrder)
      load(page, search, field, newOrder)
    } else {
      setSortBy(field)
      setSortOrder('desc')
      load(page, search, field, 'desc')
    }
  }

  const goToPage = (p: number) => {
    if (p < 1 || p > pages) return
    setPage(p)
    load(p, search, sortBy, sortOrder)
  }

  const exportCSV = () => {
    const headers = ['Nombre', 'Teléfono', 'Email', 'Pedidos', 'Gasto Total', 'Primera Compra', 'Última Compra', 'Miembro Club']
    const rows = consumers.map(c => [
      `"${c.name}"`,
      c.phone,
      c.email,
      c.totalOrders,
      c.totalSpent,
      c.firstOrderAt ? new Date(c.firstOrderAt).toISOString() : '',
      c.lastOrderAt ? new Date(c.lastOrderAt).toISOString() : '',
      c.isLoyaltyMember ? 'Sí' : 'No',
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crm-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalRevenue = consumers.reduce((sum, c) => sum + c.totalSpent, 0)
  const totalClients = total
  const avgOrders = totalClients > 0 ? (consumers.reduce((sum, c) => sum + c.totalOrders, 0) / consumers.length).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">Base de Datos de Clientes</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={consumers.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border p-5 bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Clientes</p>
              <p className="text-2xl font-black">{totalClients}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border p-5 bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ShoppingBag size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Promedio Pedidos</p>
              <p className="text-2xl font-black">{avgOrders}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border p-5 bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ShoppingBag size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Página Actual</p>
              <p className="text-2xl font-black">{page} / {pages}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background flex-1">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por nombre, teléfono o email..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground/50"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Buscar
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">
                    Cliente
                    <ArrowUpDown size={12} className={sortBy === 'name' ? 'text-primary' : 'opacity-30'} />
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Contacto</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('totalOrders')}>
                  <span className="flex items-center justify-end gap-1">
                    Pedidos
                    <ArrowUpDown size={12} className={sortBy === 'totalOrders' ? 'text-primary' : 'opacity-30'} />
                  </span>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('totalSpent')}>
                  <span className="flex items-center justify-end gap-1">
                    Gasto Total
                    <ArrowUpDown size={12} className={sortBy === 'totalSpent' ? 'text-primary' : 'opacity-30'} />
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('lastOrderAt')}>
                  <span className="flex items-center gap-1">
                    Última Compra
                    <ArrowUpDown size={12} className={sortBy === 'lastOrderAt' ? 'text-primary' : 'opacity-30'} />
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Club</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                    Cargando clientes...
                  </td>
                </tr>
              )}
              {!loading && consumers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    {search ? 'No se encontraron clientes con ese criterio.' : 'No hay clientes registrados todavía.'}
                  </td>
                </tr>
              )}
              {!loading && consumers.map(c => (
                <tr key={c._id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.name || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {c.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone size={10} /> {c.phone}
                        </p>
                      )}
                      {c.email && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[180px]">
                          <Mail size={10} /> {c.email}
                        </p>
                      )}
                      {!c.phone && !c.email && <span className="text-xs text-muted-foreground/50">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.totalOrders}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtCurrency(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(c.lastOrderAt)}</td>
                  <td className="px-4 py-3">
                    {c.isLoyaltyMember ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">
                        <Award size={10} />
                        Club
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page} de {pages} ({total} clientes)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-semibold tabular-nums min-w-[4ch] text-center">
              {page} / {pages}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= pages}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
