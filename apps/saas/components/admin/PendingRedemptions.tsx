'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Inbox, Copy, CheckCircle2, RefreshCw, Package, User } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface PendingRedemption {
  _id: string
  redemptionCode: string
  pointsUsed: number
  expiresAt: string
  createdAt: string
  memberId: { _id: string; name: string } | null
  storeItemId: { _id: string; name: string; imageUrl?: string } | null
}

interface Props {
  tenantSlug: string
}

/**
 * Pestaña "Solicitudes": canjes pendientes de entrega.
 * Copiá el código o marcá como reclamado cuando entregues el premio.
 *
 * TODO(cancelar-redemption): cuando exista el endpoint de cancelación,
 * agregar acá el botón correspondiente. Requiere reembolso de puntos,
 * restauración de stock y operación atómica con filtro status:'pending'.
 * No agregar UI muerta antes de tiempo.
 */
export default function PendingRedemptions({ tenantSlug }: Props) {
  const [items, setItems] = useState<PendingRedemption[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/store/redemptions?status=pending`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar canjes')
      setItems(data.redemptions)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Código copiado')
    } catch {
      toast.error('No se pudo copiar el código')
    }
  }

  async function handleClaim(r: PendingRedemption) {
    setClaimingId(r._id)
    try {
      const res = await fetch(`/api/${tenantSlug}/store/redemptions/${r._id}/claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al marcar como reclamado')

      toast.success('Canje entregado')
      setItems(prev => prev.filter(item => item._id !== r._id))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Inbox size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Solicitudes</CardTitle>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Canjes esperando entrega en el local
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Cargando solicitudes…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm text-muted-foreground">No hay canjes pendientes</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(r => (
              <div
                key={r._id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-2xl border border-border/40 bg-background"
              >
                {r.storeItemId?.imageUrl ? (
                  <img
                    src={r.storeItemId.imageUrl}
                    alt=""
                    className="w-12 h-12 object-cover rounded-xl shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                    <Package size={20} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{r.storeItemId?.name || 'Item eliminado'}</span>
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      {r.pointsUsed} pts
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <User size={12} />
                    <span>{r.memberId?.name || 'Miembro'}</span>
                    {r.expiresAt && (
                      <span>
                        · Expira {formatDistanceToNow(new Date(r.expiresAt), { locale: es })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyCode(r.redemptionCode)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 font-mono text-sm font-semibold hover:bg-muted/50 transition-colors"
                    title="Copiar código"
                  >
                    {r.redemptionCode}
                    <Copy size={14} />
                  </button>
                  <Button
                    size="sm"
                    onClick={() => handleClaim(r)}
                    disabled={claimingId === r._id}
                    className="rounded-xl"
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    {claimingId === r._id ? 'Marcando…' : 'Entregado'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
