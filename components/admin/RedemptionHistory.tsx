'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PopulatedStoreItem {
  _id: string
  name: string
  imageUrl?: string
  pointsCost: number
}

interface PopulatedMember {
  _id: string
  name: string
  phone?: string
  email?: string
  loyalty?: { points: number }
}

interface Redemption {
  _id: string
  status: 'pending' | 'claimed' | 'expired' | 'cancelled'
  redemptionCode: string
  pointsUsed: number
  cashValue?: number
  createdAt: string
  expiresAt?: string
  claimedAt?: string
  storeItemId: PopulatedStoreItem
  memberId: PopulatedMember
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export default function RedemptionHistory({ tenantSlug }: { tenantSlug: string }) {
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)

  const fetchRedemptions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (searchTerm.trim()) params.append('search', searchTerm.trim())
      params.append('page', String(page))
      params.append('limit', '20')

      const res = await fetch(`/api/${tenantSlug}/admin/redemptions?${params}`)
      if (!res.ok) throw new Error('Error al cargar canjes')
      const data = await res.json()
      setRedemptions(data.redemptions || [])
      setPagination(data.pagination || null)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, statusFilter, searchTerm, page])

  useEffect(() => {
    fetchRedemptions()
  }, [fetchRedemptions])

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-500">Pendiente</Badge>
      case 'claimed':
        return <Badge className="bg-emerald-500">Reclamado</Badge>
      case 'expired':
        return <Badge variant="secondary">Expirado</Badge>
      case 'cancelled':
        return <Badge variant="destructive">Cancelado</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pending':
        return <Clock size={16} className="text-amber-500" />
      case 'claimed':
        return <CheckCircle size={16} className="text-emerald-500" />
      case 'expired':
        return <XCircle size={16} className="text-muted-foreground" />
      case 'cancelled':
        return <XCircle size={16} className="text-red-500" />
      default:
        return null
    }
  }

  const statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'claimed', label: 'Reclamados' },
    { value: 'expired', label: 'Expirados' },
    { value: 'cancelled', label: 'Cancelados' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {statusOptions.map(opt => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className="rounded-xl text-xs font-bold"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1) }}
            className="pl-9 rounded-xl h-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : redemptions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-semibold">No hay canjes registrados</p>
          <p className="text-sm mt-1">Los canjes aparecerán aquí cuando los clientes los realicen.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Código</th>
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Miembro</th>
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Item</th>
                <th className="text-center px-4 py-3 font-bold text-xs uppercase tracking-wider">Pts</th>
                <th className="text-center px-4 py-3 font-bold text-xs uppercase tracking-wider">Estado</th>
                <th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {redemptions.map(r => (
                <tr key={r._id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono font-bold bg-muted px-2 py-1 rounded-lg">
                      {r.redemptionCode}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-sm">{r.memberId?.name || '—'}</p>
                      {r.memberId?.phone && (
                        <p className="text-xs text-muted-foreground">{r.memberId.phone}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.storeItemId?.imageUrl && (
                        <img src={r.storeItemId.imageUrl} alt="" className="w-8 h-8 object-cover rounded-lg" />
                      )}
                      <span className="font-medium">{r.storeItemId?.name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono font-bold text-sm">{r.pointsUsed}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {getStatusIcon(r.status)}
                      {getStatusBadge(r.status)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-xl"
          >
            <ChevronLeft size={16} className="mr-1" />
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground font-medium">
            Pág. {pagination.page} de {pagination.pages} ({pagination.total} canjes)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
            className="rounded-xl"
          >
            Siguiente
            <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
