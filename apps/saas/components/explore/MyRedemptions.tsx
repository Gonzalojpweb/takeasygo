'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, QrCode, CheckCircle, Clock, XCircle, Package } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/tgo'
import { useHaptic } from '@/components/tgo/useHaptic'

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
  const haptic = useHaptic()
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
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      pending: { bg: 'var(--tgo-state-discovery)', color: 'white', label: 'Pendiente' },
      claimed: { bg: 'var(--tgo-state-success)', color: 'white', label: 'Reclamado' },
      expired: { bg: 'var(--tgo-surface-1)', color: 'var(--tgo-text-muted)', label: 'Expirado' },
      cancelled: { bg: 'var(--tgo-state-danger)', color: 'white', label: 'Cancelado' },
    }
    const s = styles[status] || { bg: 'var(--tgo-surface-1)', color: 'var(--tgo-text-primary)', label: status }
    return (
      <span
        className="text-xs font-bold px-2 py-0.5"
        style={{ borderRadius: 'var(--tgo-radius-md)', backgroundColor: s.bg, color: s.color }}
      >
        {s.label}
      </span>
    )
  }

  function getStatusIcon(status: string) {
    const colors: Record<string, string> = {
      pending: 'var(--tgo-state-discovery)',
      claimed: 'var(--tgo-state-success)',
      expired: 'var(--tgo-text-muted)',
      cancelled: 'var(--tgo-state-danger)',
    }
    const Icon = status === 'pending' ? Clock : status === 'claimed' ? CheckCircle : XCircle
    return <Icon size={20} style={{ color: colors[status] || 'var(--tgo-text-muted)' }} />
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--tgo-radius-xl)',
    backgroundColor: 'var(--tgo-surface-card)',
    border: '1px solid var(--tgo-border)',
  }

  const filterBtn = (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: 'var(--tgo-radius-md)' as const,
    fontSize: 'var(--tgo-type-body-sm)',
    fontWeight: 700 as const,
    backgroundColor: active ? 'var(--tgo-state-interactive)' : 'var(--tgo-surface-card)',
    color: active ? 'white' : 'var(--tgo-text-primary)',
    border: `1px solid ${active ? 'var(--tgo-state-interactive)' : 'var(--tgo-border)'}`,
    cursor: 'pointer' as const,
    transition: 'all 150ms ease',
  })

  return (
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => { haptic.impact('light'); onBack() }}
          aria-label="Volver"
          className="mb-4 flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
          style={{ color: 'var(--tgo-text-primary)' }}
        >
          <ArrowLeft size={18} />
          Volver
        </button>

        {menuUrl && (
          <button
            onClick={() => { haptic.impact('light'); router.push(menuUrl) }}
            aria-label="Volver al menú"
            className="mb-4 flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            <ArrowLeft size={18} />
            Volver al Menú
          </button>
        )}

        <div className="overflow-hidden" style={cardStyle}>
          {/* Header */}
          <div
            className="p-8"
            style={{
              borderBottom: '1px solid var(--tgo-border)',
              backgroundColor: 'var(--tgo-surface-1)',
            }}
          >
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--tgo-text-primary)' }}>
              Mis Canjes
            </h2>
            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--tgo-text-muted)' }}>
              Historial de tus redenciones de puntos
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2" role="tablist" aria-label="Filtrar por estado">
              <button role="tab" aria-selected={filterStatus === 'all'} onClick={() => { haptic.selection(); setFilterStatus('all') }} style={filterBtn(filterStatus === 'all')}>
                Todos
              </button>
              <button role="tab" aria-selected={filterStatus === 'pending'} onClick={() => { haptic.selection(); setFilterStatus('pending') }} style={filterBtn(filterStatus === 'pending')}>
                Pendientes
              </button>
              <button role="tab" aria-selected={filterStatus === 'claimed'} onClick={() => { haptic.selection(); setFilterStatus('claimed') }} style={filterBtn(filterStatus === 'claimed')}>
                Reclamados
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12" style={{ color: 'var(--tgo-text-muted)' }}>
                Cargando...
              </div>
            ) : redemptions.length === 0 ? (
              <EmptyState
                icon={<Package size={48} />}
                title="No tienes canjes aún"
              />
            ) : (
              <div className="space-y-6">
                {/* Pending Redemptions */}
                {pendingRedemptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--tgo-text-muted)' }}>
                      Pendientes de reclamar
                    </h3>
                    <div className="space-y-4">
                      {pendingRedemptions.map(redemption => (
                        <div key={redemption._id} style={{ ...cardStyle, border: '1px solid var(--tgo-state-discovery)' }}>
                          <div className="p-4">
                            <div className="flex items-start gap-4">
                              {redemption.storeItemId.imageUrl && (
                                <img
                                  src={redemption.storeItemId.imageUrl}
                                  alt={redemption.storeItemId.name}
                                  className="w-16 h-16 object-cover"
                                  style={{ borderRadius: 'var(--tgo-radius-md)' }}
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                  <h4 className="font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                                    {redemption.storeItemId.name}
                                  </h4>
                                  {getStatusBadge(redemption.status)}
                                </div>
                                <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--tgo-text-muted)' }}>
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
                            <div
                              className="mt-4 pt-4"
                              style={{ borderTop: '1px solid var(--tgo-border)' }}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs mb-1" style={{ color: 'var(--tgo-text-muted)' }}>
                                    Código de redención
                                  </p>
                                  <code
                                    className="text-lg font-mono font-bold tracking-wider"
                                    style={{ color: 'var(--tgo-text-primary)' }}
                                  >
                                    {redemption.redemptionCode}
                                  </code>
                                </div>
                                <div
                                  className="w-16 h-16 flex items-center justify-center"
                                  style={{
                                    borderRadius: 'var(--tgo-radius-md)',
                                    backgroundColor: 'var(--tgo-surface-1)',
                                  }}
                                >
                                  <QrCode size={32} style={{ color: 'var(--tgo-text-muted)' }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Redemptions */}
                {otherRedemptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--tgo-text-muted)' }}>
                      Historial
                    </h3>
                    <div className="space-y-3">
                      {otherRedemptions.map(redemption => (
                        <div key={redemption._id} style={cardStyle}>
                          <div className="p-4">
                            <div className="flex items-center gap-4">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: 'var(--tgo-surface-1)' }}
                              >
                                {getStatusIcon(redemption.status)}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between">
                                  <h4 className="font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                                    {redemption.storeItemId.name}
                                  </h4>
                                  {getStatusBadge(redemption.status)}
                                </div>
                                <div className="flex items-center gap-4 text-sm mt-1" style={{ color: 'var(--tgo-text-muted)' }}>
                                  <span>{redemption.pointsUsed} pts</span>
                                  <span>{new Date(redemption.createdAt).toLocaleDateString()}</span>
                                  {redemption.claimedAt && (
                                    <span>Reclamado: {new Date(redemption.claimedAt).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
