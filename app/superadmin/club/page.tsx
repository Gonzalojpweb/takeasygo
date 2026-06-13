'use client'

import { useState, useEffect } from 'react'
import { Users, Gift, Star, Store, ChevronRight, Search, Building2, Trophy, RefreshCw, Target } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TenantClubStat {
  tenantId: string
  tenantName: string
  tenantSlug: string
  plan: string
  clubEnabled: boolean
  clubName: string
  totalMembers: number
  activeMembers: number
  storeEnabled: boolean
  pointsEnabled: boolean
}

interface GlobalTotals {
  totalMembers: number
  activeMembers: number
  tenantsWithClub: number
  tenantsWithStore: number
}

export default function GlobalClubPage() {
  const [tenantStats, setTenantStats] = useState<TenantClubStat[]>([])
  const [globalTotals, setGlobalTotals] = useState<GlobalTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchClubStats()
  }, [])

  async function fetchClubStats() {
    try {
      const res = await fetch('/api/superadmin/club')
      const data = await res.json()
      if (res.ok) {
        setTenantStats(data.tenantStats || [])
        setGlobalTotals(data.globalTotals)
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Error al cargar estadísticas del club')
    } finally {
      setLoading(false)
    }
  }

  const filtered = tenantStats.filter(t =>
    t.tenantName.toLowerCase().includes(search.toLowerCase()) ||
    t.tenantSlug.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="p-8 text-center text-zinc-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="text-zinc-400" />
            Club Global
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Vista general del programa de fidelización en todos los tenants.
          </p>
        </div>
        <button
          onClick={fetchClubStats}
          className="border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-50 transition flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {globalTotals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Miembros totales</span>
              <Users size={18} className="text-primary" />
            </div>
            <p className="text-3xl font-bold">{globalTotals.totalMembers.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Miembros activos</span>
              <Star size={18} className="text-amber-500" />
            </div>
            <p className="text-3xl font-bold">{globalTotals.activeMembers.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Club activo</span>
              <Building2 size={18} className="text-emerald-500" />
            </div>
            <p className="text-3xl font-bold">{globalTotals.tenantsWithClub}</p>
            <p className="text-xs text-zinc-400 mt-1">de {tenantStats.length} tenants</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Tienda activa</span>
              <Store size={18} className="text-purple-500" />
            </div>
            <p className="text-3xl font-bold">{globalTotals.tenantsWithStore}</p>
            <p className="text-xs text-zinc-400 mt-1">de {tenantStats.length} tenants</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tenant..."
              className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">No se encontraron tenants.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Tenant</th>
                <th className="px-6 py-4 font-medium">Club</th>
                <th className="px-6 py-4 font-medium">Miembros</th>
                <th className="px-6 py-4 font-medium">Activos</th>
                <th className="px-6 py-4 font-medium">Puntos</th>
                <th className="px-6 py-4 font-medium">Tienda</th>
                <th className="px-6 py-4 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(t => (
                <tr key={t.tenantId} className="hover:bg-zinc-50/50 transition">
                  <td className="px-6 py-4">
                    <div>
                      <span className="font-medium text-zinc-900">{t.tenantName}</span>
                      <p className="text-zinc-400 text-xs">{t.tenantSlug}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {t.clubEnabled ? (
                      <span className="text-emerald-600 text-xs font-medium flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {t.clubName || 'Activo'}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs">Inactivo</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm">{t.totalMembers}</td>
                  <td className="px-6 py-4 font-mono text-sm">{t.activeMembers}</td>
                  <td className="px-6 py-4">
                    {t.pointsEnabled ? (
                      <span className="text-green-600 text-xs font-medium">Activo</span>
                    ) : (
                      <span className="text-zinc-400 text-xs">Inactivo</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {t.storeEnabled ? (
                      <span className="text-purple-600 text-xs font-medium">Activa</span>
                    ) : (
                      <span className="text-zinc-400 text-xs">Inactiva</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a
                      href={`/superadmin/tenants/${t.tenantId}/edit`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Configurar <ChevronRight size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
