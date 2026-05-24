'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  History,
  TrendingUp,
  TrendingDown,
  Gift,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Transaction {
  _id: string
  type: 'earn' | 'redeem'
  points: number
  description: string
  orderNumber: string | null
  storeItemName: string | null
  status: string
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Props {
  memberId: string
  memberName: string
  tenantSlug: string
  open: boolean
  onClose: () => void
}

export default function MemberTransactions({
  memberId,
  memberName,
  tenantSlug,
  open,
  onClose,
}: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'earn' | 'redeem'>('all')
  const [error, setError] = useState<string | null>(null)

  async function fetchPage(targetPage: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/loyalty/members/${memberId}/transactions?page=${targetPage}&limit=20`
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al cargar historial')
        setTransactions([])
        return
      }
      setTransactions(data.transactions ?? [])
      setPagination(data.pagination ?? null)
    } catch {
      setError('Error de conexión')
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setPage(1)
    setFilter('all')
    fetchPage(1)
  }, [open, memberId, tenantSlug])

  useEffect(() => {
    if (!open || page === 1) return
    fetchPage(page)
  }, [page, open, memberId, tenantSlug])

  const filtered = filter === 'all'
    ? transactions
    : transactions.filter(t => t.type === filter)

  const totalEarned = transactions
    .filter(t => t.type === 'earn')
    .reduce((s, t) => s + t.points, 0)

  const totalSpent = transactions
    .filter(t => t.type === 'redeem')
    .reduce((s, t) => s + Math.abs(t.points), 0)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 bg-gradient-to-b from-background to-muted/30 shadow-2xl">
        <DialogHeader className="relative p-5 pb-0 border-b border-border/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold truncate">
                  Historial de Puntos
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate">
                  {memberName}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-xl h-8 w-8 shrink-0 -mr-1 -mt-1"
            >
              <X size={15} />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2 pb-5 pt-4">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-3 ring-1 ring-emerald-500/10">
              <p className="text-[9px] uppercase tracking-[0.15em] text-emerald-600/70 font-semibold mb-1">
                Ganados
              </p>
              <p className="text-base font-bold text-emerald-600 tabular-nums">
                +{totalEarned}
              </p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-rose-500/10 to-rose-500/5 p-3 ring-1 ring-rose-500/10">
              <p className="text-[9px] uppercase tracking-[0.15em] text-rose-600/70 font-semibold mb-1">
                Canjeados
              </p>
              <p className="text-base font-bold text-rose-600 tabular-nums">
                -{totalSpent}
              </p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-3 ring-1 ring-primary/10">
              <p className="text-[9px] uppercase tracking-[0.15em] text-primary/70 font-semibold mb-1">
                Saldo
              </p>
              <p className="text-base font-bold text-primary tabular-nums">
                {totalEarned - totalSpent}
              </p>
            </div>
          </div>

          <div className="flex gap-1 pb-4">
            {(['all', 'earn', 'redeem'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 text-[11px] rounded-lg font-semibold transition-all',
                  filter === f
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50'
                )}
              >
                {f === 'all' ? 'Todos' : f === 'earn' ? 'Ganados' : 'Canjeados'}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 260px)' }}>
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse ring-1 ring-border/20" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center mb-3 ring-1',
                error
                  ? 'bg-destructive/10 text-destructive ring-destructive/20'
                  : 'bg-muted/30 text-muted-foreground/30 ring-border/20'
              )}>
                <AlertCircle className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-muted-foreground/60 mb-1">
                {error ?? 'Sin movimientos'}
              </p>
              <p className="text-xs text-muted-foreground/40">
                {error
                  ? 'Intentá de nuevo más tarde'
                  : filter === 'all'
                    ? 'No hay transacciones registradas para este miembro'
                    : filter === 'earn'
                      ? 'No hay puntos ganados registrados'
                      : 'No hay canjes registrados'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map(t => (
                <div
                  key={t._id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div
                    className={cn(
                      'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ring-1',
                      t.type === 'earn'
                        ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15'
                        : 'bg-rose-500/10 text-rose-600 ring-rose-500/15'
                    )}
                  >
                    {t.type === 'earn' ? (
                      <TrendingUp size={16} />
                    ) : (
                      <Gift size={16} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {t.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {format(new Date(t.createdAt), "d MMM yyyy · HH:mm", { locale: es })}
                    </p>
                  </div>

                  <div
                    className={cn(
                      'text-sm font-black tabular-nums shrink-0',
                      t.type === 'earn' ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {t.type === 'earn' ? '+' : ''}{t.points}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/10">
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              {pagination.total} movimientos
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded-lg h-7 text-[11px] px-2 font-semibold"
              >
                <ChevronLeft size={13} className="mr-0.5" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded-lg h-7 text-[11px] px-2 font-semibold"
              >
                Siguiente
                <ChevronRight size={13} className="ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
