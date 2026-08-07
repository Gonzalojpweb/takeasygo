'use client'

import { useState, useEffect } from 'react'
import {
  Loader2,
  Store,
  ShoppingBag,
  TrendingUp,
  X,
  UserCheck,
  UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { toPesos } from '@takeasygo/business'

interface Membership {
  tenantName: string
  tenantSlug: string
  points: number
  tier: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: string | null
  joinedAt: string
  status: string
}

interface UserDetailData {
  user: {
    _id: string
    name: string
    email: string
    image?: string
    role: string
    isActive: boolean
    createdAt: string
  }
  memberships: Membership[]
  stats: {
    totalMemberships: number
    totalOrders: number
    totalSpent: number
  }
}

interface Props {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

const TIER_BADGES: Record<string, { label: string; className: string }> = {
  none: { label: 'Sin nivel', className: 'bg-muted/10 text-muted-foreground border-muted/20' },
  bronze: { label: 'Bronce', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  silver: { label: 'Plata', className: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
  gold: { label: 'Oro', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
}

export default function UserDetailModal({ userId, open, onOpenChange, onUpdate }: Props) {
  const [data, setData] = useState<UserDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/superadmin/users/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { toast.error(d.error); return }
        setData(d)
      })
      .catch(() => toast.error('Error al cargar detalle'))
      .finally(() => setLoading(false))
  }, [userId, open])

  async function toggleActive() {
    if (!data) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/superadmin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !data.user.isActive }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setData(prev => prev ? { ...prev, user: { ...prev.user, isActive: !prev.user.isActive } } : prev)
      toast.success(`Usuario ${data.user.isActive ? 'desactivado' : 'activado'}`)
      onUpdate()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUpdating(false)
    }
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  function formatCurrency(v: number) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(toPesos(v))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[2rem] max-h-[90vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
          </div>
        ) : data ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 rounded-full">
                    {data.user.image ? (
                      <AvatarImage src={data.user.image} alt={data.user.name} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {data.user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-xl font-bold">{data.user.name}</DialogTitle>
                    <p className="text-sm text-muted-foreground font-mono mt-0.5">{data.user.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge className={cn(
                        'text-[9px] font-black uppercase tracking-widest border-2',
                        data.user.role === 'consumer'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : 'bg-primary/10 text-primary border-primary/20'
                      )}>
                        {data.user.role}
                      </Badge>
                      <span className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-bold',
                        data.user.isActive ? 'text-emerald-500' : 'text-muted-foreground'
                      )}>
                        <span className={cn(
                          'w-2 h-2 rounded-full',
                          data.user.isActive ? 'bg-emerald-500' : 'bg-muted-foreground'
                        )} />
                        {data.user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="rounded-xl shrink-0">
                  <X size={18} />
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Registrado</p>
                  <p className="text-lg font-bold">{formatDate(data.user.createdAt)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Membresías</p>
                  <p className="text-lg font-bold">{data.stats.totalMemberships}</p>
                </div>
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Órdenes totales</p>
                  <p className="text-lg font-bold">{data.stats.totalOrders}</p>
                </div>
              </div>

              {data.memberships.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Store size={16} className="text-primary" /> Clubes de Fidelización
                  </h4>
                  <div className="space-y-2">
                    {data.memberships.map((m, i) => (
                      <div key={i} className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm">{m.tenantName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">/{m.tenantSlug}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-black text-amber-500 tabular-nums">{m.points} pts</p>
                            <Badge className={cn(
                              'text-[8px] font-bold border',
                              TIER_BADGES[m.tier]?.className ?? TIER_BADGES.none.className
                            )}>
                              {TIER_BADGES[m.tier]?.label ?? m.tier}
                            </Badge>
                          </div>
                          <div className="text-right text-[10px] text-muted-foreground">
                            <p>{m.totalOrders} {m.totalOrders === 1 ? 'pedido' : 'pedidos'}</p>
                            <p>${toPesos(m.totalSpent).toLocaleString('es-AR')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-primary" />
                      <span className="text-sm font-bold">Totales acumulados</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="font-bold">{data.stats.totalOrders} órdenes</span>
                      <span className="font-bold text-primary">{formatCurrency(data.stats.totalSpent)}</span>
                    </div>
                  </div>
                </div>
              )}

              {data.memberships.length === 0 && (
                <div className="py-8 text-center">
                  <ShoppingBag size={32} className="mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Este usuario no tiene membresías activas en ningún club.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-border/40">
                <Button
                  onClick={toggleActive}
                  disabled={updating}
                  variant="outline"
                  className={cn(
                    'flex-1 rounded-xl h-11 font-bold',
                    data.user.isActive
                      ? 'text-destructive hover:bg-destructive/10 border-destructive/30'
                      : 'text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/30'
                  )}
                >
                  {updating ? (
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  ) : data.user.isActive ? (
                    <UserX size={16} className="mr-2" />
                  ) : (
                    <UserCheck size={16} className="mr-2" />
                  )}
                  {data.user.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="py-16 text-center text-muted-foreground">Error al cargar datos</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
