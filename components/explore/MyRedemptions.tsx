'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, QrCode, CheckCircle, Clock, XCircle, Package } from 'lucide-react'
import { toast } from 'sonner'

interface Redemption {
  _id: string
  status: 'pending' | 'claimed' | 'expired' | 'cancelled'
  redemptionCode: string
  pointsUsed: number
  cashValue?: number
  createdAt: string
  expiresAt?: string
  claimedAt?: string
  storeItemId: {
    _id: string
    name: string
    imageUrl: string
    pointsCost: number
  }
}

interface Props {
  tenantSlug: string
  memberId: string
  onBack: () => void
  menuUrl?: string
}

export default function MyRedemptions({ tenantSlug, memberId, onBack, menuUrl }: Props) {
  const router = useRouter()
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    fetchRedemptions()
  }, [filterStatus])

  async function fetchRedemptions() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('memberId', memberId)
      if (filterStatus !== 'all') params.append('status', filterStatus)

      const res = await fetch(`/api/${tenantSlug}/store/redemptions?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar redenciones')
      setRedemptions(data.redemptions || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pendingRedemptions = redemptions.filter(r => r.status === 'pending')
  const otherRedemptions = redemptions.filter(r => r.status !== 'pending')

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
        return <Clock size={20} className="text-amber-500" />
      case 'claimed':
        return <CheckCircle size={20} className="text-emerald-500" />
      case 'expired':
        return <XCircle size={20} className="text-muted-foreground" />
      case 'cancelled':
        return <XCircle size={20} className="text-red-500" />
      default:
        return <Package size={20} />
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button
          onClick={onBack}
          variant="ghost"
          aria-label="Volver a la tienda"
          className="mb-4 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft size={18} className="mr-2" />
          Volver
        </Button>

        {menuUrl && (
          <Button
            onClick={() => router.push(menuUrl)}
            variant="ghost"
            aria-label="Volver al menú"
            className="mb-4 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft size={18} className="mr-2" />
            Volver al Menú
          </Button>
        )}

        <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
            <CardTitle className="text-xl font-bold tracking-tight">Mis Canjes</CardTitle>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Historial de tus redenciones de puntos
            </p>
          </CardHeader>

          <CardContent className="p-8">
            {/* Filter Tabs */}
            <div 
              className="flex gap-2 mb-6 overflow-x-auto pb-2"
              role="tablist"
              aria-label="Filtrar por estado"
            >
              <Button
                size="sm"
                role="tab"
                aria-selected={filterStatus === 'all'}
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('all')}
                className="focus-visible:ring-2 focus-visible:ring-primary"
              >
                Todos
              </Button>
              <Button
                size="sm"
                role="tab"
                aria-selected={filterStatus === 'pending'}
                variant={filterStatus === 'pending' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('pending')}
                className="focus-visible:ring-2 focus-visible:ring-primary"
              >
                Pendientes
              </Button>
              <Button
                size="sm"
                role="tab"
                aria-selected={filterStatus === 'claimed'}
                variant={filterStatus === 'claimed' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('claimed')}
                className="focus-visible:ring-2 focus-visible:ring-primary"
              >
                Reclamados
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Cargando...</div>
            ) : redemptions.length === 0 ? (
              <div className="text-center py-12">
                <Package size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No tienes canjes aún</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Pending Redemptions */}
                {pendingRedemptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3">
                      Pendientes de reclamar
                    </h3>
                    <div className="space-y-4">
                      {pendingRedemptions.map(redemption => (
                        <Card key={redemption._id} className="border-amber-200">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              {redemption.storeItemId.imageUrl && (
                                <img
                                  src={redemption.storeItemId.imageUrl}
                                  alt={redemption.storeItemId.name}
                                  className="w-16 h-16 rounded-lg object-cover"
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                  <h4 className="font-bold">{redemption.storeItemId.name}</h4>
                                  {getStatusBadge(redemption.status)}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span>{redemption.pointsUsed} pts</span>
                                  {redemption.expiresAt && (
                                    <span className="flex items-center gap-1">
                                      <Clock size={12} />
                                      {new Date(redemption.expiresAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-border">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Código de redención</p>
                                  <code className="text-lg font-mono font-bold tracking-wider">
                                    {redemption.redemptionCode}
                                  </code>
                                </div>
                                <div className="w-16 h-16 bg-muted flex items-center justify-center rounded-lg">
                                  <QrCode size={32} className="text-muted-foreground" />
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Redemptions */}
                {otherRedemptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3">
                      Historial
                    </h3>
                    <div className="space-y-3">
                      {otherRedemptions.map(redemption => (
                        <Card key={redemption._id} className="border-border/60">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                {getStatusIcon(redemption.status)}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between">
                                  <h4 className="font-bold">{redemption.storeItemId.name}</h4>
                                  {getStatusBadge(redemption.status)}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                  <span>{redemption.pointsUsed} pts</span>
                                  <span>{new Date(redemption.createdAt).toLocaleDateString()}</span>
                                  {redemption.claimedAt && (
                                    <span>Reclamado: {new Date(redemption.claimedAt).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
