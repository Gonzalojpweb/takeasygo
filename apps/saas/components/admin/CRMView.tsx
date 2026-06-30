'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Download, Users, ArrowUpDown, Loader2, Phone, Mail,
  ChevronLeft, ChevronRight, Building2, Trash2, Filter, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { CustomerSegmentBadge, CustomerHealthScore } from './cis'
import { SegmentDistributionChart } from './cis/charts'
import ConsumerDetailModal from './crm/ConsumerDetailModal'

// ─────────────────────────────────────────────────────────────────────────────
// CRMView — Tabla de clientes con filtros CIS integrados
// ─────────────────────────────────────────────────────────────────────────────
// Filtros: segmento, health score, LTV, fechas, búsqueda textual.
// Mini donut chart de distribución de segmentos.
// Click en fila → ConsumerDetailModal con perfil V2 completo.
// ─────────────────────────────────────────────────────────────────────────────

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
  isCorporate: boolean
  segment: string | null
  healthScore: number | null
}

interface SegmentCount {
  segment: string
  count: number
}

interface Props {
  tenantSlug: string
}

type SortField = 'lastOrderAt' | 'totalOrders' | 'totalSpent' | 'name'
type SortOrder = 'asc' | 'desc'

const SEGMENTS = [
  { value: '', label: 'Todos' },
  { value: 'VIP', label: 'VIP' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'FREQUENT', label: 'Frecuente' },
  { value: 'LOYAL', label: 'Leal' },
  { value: 'HIGH_POTENTIAL', label: 'Alto Potencial' },
  { value: 'EXPLORER', label: 'Explorador' },
  { value: 'NEW', label: 'Nuevo' },
  { value: 'AT_RISK', label: 'En Riesgo' },
  { value: 'DORMANT', label: 'Dormido' },
  { value: 'PROMOTION_HUNTER', label: 'Promo Hunter' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
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
  const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null)

  // Filtros CIS
  const [showFilters, setShowFilters] = useState(false)
  const [filterSegment, setFilterSegment] = useState('')
  const [filterHealthMin, setFilterHealthMin] = useState('')
  const [filterHealthMax, setFilterHealthMax] = useState('')
  const [filterLtvMin, setFilterLtvMin] = useState('')
  const [filterLtvMax, setFilterLtvMax] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Segment distribution for mini donut
  const [segmentData, setSegmentData] = useState<SegmentCount[]>([])

  const hasActiveFilters = filterSegment || filterHealthMin || filterHealthMax || filterLtvMin || filterLtvMax || filterDateFrom || filterDateTo

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
      if (filterSegment) params.set('segment', filterSegment)
      if (filterHealthMin) params.set('healthScoreMin', filterHealthMin)
      if (filterHealthMax) params.set('healthScoreMax', filterHealthMax)
      if (filterLtvMin) params.set('ltvMin', filterLtvMin)
      if (filterLtvMax) params.set('ltvMax', filterLtvMax)
      if (filterDateFrom) params.set('lastOrderFrom', filterDateFrom)
      if (filterDateTo) params.set('lastOrderTo', filterDateTo)

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
  }, [tenantSlug, filterSegment, filterHealthMin, filterHealthMax, filterLtvMin, filterLtvMax, filterDateFrom, filterDateTo])

  // Load segment distribution
  const loadSegments = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/crm/segments`)
      if (!res.ok) return
      const data = await res.json()
      setSegmentData(data.distribution || [])
    } catch { /* silent */ }
  }, [tenantSlug])

  useEffect(() => {
    load(page, search, sortBy, sortOrder)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSegments()
  }, [loadSegments])

  // Reload when filters change (reset to page 1)
  useEffect(() => {
    setPage(1)
    load(1, search, sortBy, sortOrder)
  }, [filterSegment, filterHealthMin, filterHealthMax, filterLtvMin, filterLtvMax, filterDateFrom, filterDateTo]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const clearFilters = () => {
    setFilterSegment('')
    setFilterHealthMin('')
    setFilterHealthMax('')
    setFilterLtvMin('')
    setFilterLtvMax('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const handleSegmentChartClick = (segment: string) => {
    setFilterSegment(filterSegment === segment ? '' : segment)
  }

  const exportCSV = () => {
    const headers = ['Nombre', 'Teléfono', 'Email', 'Pedidos', 'Gasto Total', 'Primera Compra', 'Última Compra', 'Segmento', 'Salud', 'Club', 'Corporativo']
    const rows = consumers.map(c => [
      `"${c.name}"`,
      c.phone,
      c.email,
      c.totalOrders,
      c.totalSpent,
      c.firstOrderAt ? new Date(c.firstOrderAt).toISOString() : '',
      c.lastOrderAt ? new Date(c.lastOrderAt).toISOString() : '',
      c.segment ?? '',
      c.healthScore ?? '',
      c.isLoyaltyMember ? 'Sí' : 'No',
      c.isCorporate ? 'Sí' : 'No',
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

  const handleDelete = async (consumer: Consumer) => {
    const label = consumer.name || consumer.phone || consumer.email || 'este cliente'
    if (!window.confirm(`¿Eliminar a "${label}" del CRM? Esta acción no se puede deshacer.`)) return

    try {
      const res = await fetch(`/api/${tenantSlug}/crm/customers/${consumer._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Cliente eliminado')
      load(page, search, sortBy, sortOrder)
    } catch {
      toast.error('Error al eliminar el cliente')
    }
  }

  const totalClients = total

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

      {/* Stats + Mini Donut Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 rounded-2xl border border-border p-4 bg-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Total Clientes</p>
              <p className="text-xl font-black">{totalClients}</p>
            </div>
          </div>
          {segmentData.length > 0 && (
            <SegmentDistributionChart
              data={segmentData}
              totalCustomers={totalClients}
              compact
              onSegmentClick={handleSegmentChartClick}
            />
          )}
        </div>

        {/* Stats cards */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-[10px] text-muted-foreground font-medium uppercase">Con Datos CIS</p>
            <p className="text-xl font-black">{consumers.filter(c => c.segment).length} <span className="text-xs font-normal text-muted-foreground">/ {consumers.length}</span></p>
          </div>
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-[10px] text-muted-foreground font-medium uppercase">En Riesgo</p>
            <p className="text-xl font-black text-red-500">{segmentData.find(s => s.segment === 'AT_RISK')?.count ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-[10px] text-muted-foreground font-medium uppercase">VIP</p>
            <p className="text-xl font-black text-purple-600">{segmentData.find(s => s.segment === 'VIP')?.count ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${showFilters || hasActiveFilters ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/30'}`}
          >
            <Filter size={14} />
            Filtros
            {hasActiveFilters && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {[filterSegment, filterHealthMin, filterHealthMax, filterLtvMin, filterLtvMax, filterDateFrom, filterDateTo].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Filtros de Inteligencia</h3>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X size={12} /> Limpiar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Segmento */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Segmento</label>
                <select
                  value={filterSegment}
                  onChange={e => setFilterSegment(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {SEGMENTS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Health Score */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Salud (0-100)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Min"
                    value={filterHealthMin}
                    onChange={e => setFilterHealthMin(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">—</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Max"
                    value={filterHealthMax}
                    onChange={e => setFilterHealthMax(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* LTV */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Gasto Total ($)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={filterLtvMin}
                    onChange={e => setFilterLtvMin(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">—</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={filterLtvMax}
                    onChange={e => setFilterLtvMax(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Fechas */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Última Compra</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">—</span>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Active filters chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2">
                {filterSegment && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                    Segmento: {SEGMENTS.find(s => s.value === filterSegment)?.label}
                    <button onClick={() => setFilterSegment('')} className="ml-0.5 hover:text-primary/70"><X size={10} /></button>
                  </span>
                )}
                {filterHealthMin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                    Salud ≥ {filterHealthMin}
                    <button onClick={() => setFilterHealthMin('')} className="ml-0.5 hover:text-primary/70"><X size={10} /></button>
                  </span>
                )}
                {filterHealthMax && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                    Salud ≤ {filterHealthMax}
                    <button onClick={() => setFilterHealthMax('')} className="ml-0.5 hover:text-primary/70"><X size={10} /></button>
                  </span>
                )}
                {filterLtvMin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                    Gasto ≥ {fmtCurrency(Number(filterLtvMin))}
                    <button onClick={() => setFilterLtvMin('')} className="ml-0.5 hover:text-primary/70"><X size={10} /></button>
                  </span>
                )}
                {filterLtvMax && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                    Gasto ≤ {fmtCurrency(Number(filterLtvMax))}
                    <button onClick={() => setFilterLtvMax('')} className="ml-0.5 hover:text-primary/70"><X size={10} /></button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
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
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Segmento</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Salud</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tags</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                    Cargando clientes...
                  </td>
                </tr>
              )}
              {!loading && consumers.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    {hasActiveFilters
                      ? 'No se encontraron clientes con esos filtros.'
                      : search
                        ? 'No se encontraron clientes con ese criterio.'
                        : 'No hay clientes registrados todavía.'}
                  </td>
                </tr>
              )}
              {!loading && consumers.map(c => (
                <tr key={c._id} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelectedConsumer(c)}>
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
                    {c.segment ? (
                      <CustomerSegmentBadge segment={c.segment as any} compact />
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.healthScore !== null ? (
                      <CustomerHealthScore
                        score={{ total: c.healthScore, components: {}, calculatedAt: null }}
                        compact
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {c.isLoyaltyMember && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">
                          Club
                        </span>
                      )}
                      {c.isCorporate && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 text-[10px] font-bold">
                          Corp
                        </span>
                      )}
                      {!c.isLoyaltyMember && !c.isCorporate && <span className="text-xs text-muted-foreground/50">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(c) }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Eliminar cliente"
                    >
                      <Trash2 size={14} />
                    </button>
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
            Página {page} de {pages} ({total} clientes{hasActiveFilters ? ' con filtros' : ''})
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

      {/* Detail modal */}
      {selectedConsumer && (
        <ConsumerDetailModal
          consumer={selectedConsumer}
          tenantSlug={tenantSlug}
          onClose={() => setSelectedConsumer(null)}
        />
      )}
    </div>
  )
}
