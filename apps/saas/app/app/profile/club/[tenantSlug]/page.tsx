'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Trophy,
  ShoppingBag,
  DollarSign,
  Calendar,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Smartphone,
  Gift
} from 'lucide-react'
import AddToWalletButtons from '@/components/wallet/AddToWalletButtons'
import BottomNav from '@/components/explore/BottomNav'
import { useTenant } from '@/contexts/TenantContext'
import { use } from 'react'
import StoreView from '@/components/explore/StoreView'
import MyRedemptions from '@/components/explore/MyRedemptions'

interface MemberData {
  id: string
  name: string
  phone: string
  email: string
  status: string
  joinedAt: string
  points: number
  tier: string
  publicId: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: string | null
}

interface ClubData {
  member: MemberData | null
  clubEnabled: boolean
  walletEnabled: boolean
  appleWalletAvailable?: boolean
  clubName: string
  welcomeMessage: string
  message?: string
  branding?: {
    primaryColor: string
    secondaryColor: string
  }
}

function ClubContent({ tenantSlug }: { tenantSlug: string }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { setTenantSlug: setContextTenantSlug } = useTenant()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const currentTab = searchParams.get('tab') || 'club'
  const origin = searchParams.get('origin')
  const locationId = searchParams.get('locationId')
  const menuUrl = (origin === 'menu' && locationId) ? `/${tenantSlug}/menu/${locationId}` : null

  const [clubData, setClubData] = useState<ClubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    setContextTenantSlug(tenantSlug)
  }, [tenantSlug, setContextTenantSlug])

  useEffect(() => {
    if (status === 'unauthenticated') {
      const dest = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
      router.push(`/app/profile?callbackUrl=${encodeURIComponent(dest)}`)
      return
    }

    if (status === 'authenticated' && tenantSlug) {
      fetchClubData()
    } else if (status === 'authenticated' && !tenantSlug) {
      router.push('/app')
    }
  }, [status, tenantSlug, router, locationId])

  const handleJoinClub = async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(locationId ? { locationId } : {}) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al unirse al club')
      }
      await fetchClubData()
    } catch (err: any) {
      setJoinError(err.message)
    } finally {
      setJoining(false)
    }
  }

  const fetchClubData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (locationId) params.set('locationId', locationId)
      const res = await fetch(`/api/${tenantSlug}/loyalty/me?${params}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al cargar datos del club')
      }

      setClubData(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold': return 'from-yellow-500 to-amber-600'
      case 'silver': return 'from-slate-400 to-slate-500'
      case 'bronze': return 'from-orange-400 to-orange-600'
      default: return 'from-zinc-400 to-zinc-500'
    }
  }

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case 'gold': return 'Oro'
      case 'silver': return 'Plata'
      case 'bronze': return 'Bronce'
      default: return 'Miembro'
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <Loader2 size={32} style={{ color: 'var(--tgo-text-muted)' }} className="animate-spin" />
      </div>
    )
  }

  if (!clubData?.clubEnabled) {
    return (
      <div
        className="flex flex-col h-full p-6 pb-24"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Volver atrás"
          className="w-fit mb-6 flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          <ArrowLeft size={20} />
          Volver
        </button>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <AlertCircle size={48} style={{ color: 'var(--tgo-text-muted)' }} className="mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--tgo-text-primary)' }}>
            Club no disponible
          </h2>
          <p className="text-sm" style={{ color: 'var(--tgo-text-muted)' }}>
            Este restaurante no tiene el club de fidelización activo.
          </p>
        </div>

        <BottomNav />
      </div>
    )
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--tgo-radius-xl)',
    backgroundColor: 'var(--tgo-card)',
    border: '1px solid var(--tgo-border)',
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-24"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {currentTab === 'store' && clubData?.member ? (
        <StoreView
          tenantSlug={tenantSlug}
          memberId={clubData.member.id}
          memberPoints={clubData.member.points}
          memberTier={clubData.member.tier}
          tenantBranding={clubData.branding ? {
            primaryColor: clubData.branding.primaryColor,
            secondaryColor: clubData.branding.secondaryColor,
            logoUrl: '',
          } : undefined}
          onBack={() => router.replace(`${pathname}?tab=club`)}
          menuUrl={menuUrl ?? undefined}
        />
      ) : currentTab === 'canjes' && clubData?.member ? (
        <MyRedemptions
          tenantSlug={tenantSlug}
          memberId={clubData.member.id}
          onBack={() => router.replace(`${pathname}?tab=club`)}
          menuUrl={menuUrl ?? undefined}
        />
      ) : (
        <>
          <div className="p-6">
            <button
              onClick={() => router.back()}
              aria-label="Volver atrás"
              className="w-fit mb-4 flex items-center gap-2 text-sm font-medium transition-colors"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              <ArrowLeft size={20} />
              Volver
            </button>

            {menuUrl && (
              <button
                onClick={() => router.push(menuUrl)}
                aria-label="Volver al menú"
                className="w-fit mb-4 flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: 'var(--tgo-text-muted)' }}
              >
                <ArrowLeft size={18} />
                Volver al Menú
              </button>
            )}

            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--tgo-text-primary)' }}>
              {clubData?.clubName || 'Club de Fidelización'}
            </h1>
            {clubData?.welcomeMessage && (
              <p className="text-sm" style={{ color: 'var(--tgo-text-muted)' }}>
                {clubData.welcomeMessage}
              </p>
            )}
          </div>

          {clubData?.member && (
            <div className="px-6 pb-4">
              <div
                className="flex items-center gap-2 p-1"
                role="tablist"
                aria-label="Navegación del club"
                style={{
                  borderRadius: 'var(--tgo-radius-md)',
                  backgroundColor: `${clubData.branding?.primaryColor || 'var(--tgo-surface-1)'}15`,
                }}
              >
                {[
                  { key: 'club', label: 'Club', icon: Trophy },
                  { key: 'store', label: 'Tienda', icon: Gift },
                  { key: 'canjes', label: 'Canjes', icon: ShoppingBag },
                ].map(tab => {
                  const isActive = currentTab === tab.key
                  const TabIcon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`panel-${tab.key}`}
                      onClick={() => router.replace(`${pathname}?tab=${tab.key}`)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold transition-all"
                      style={{
                        borderRadius: 'var(--tgo-radius-md)',
                        backgroundColor: isActive ? (clubData.branding?.primaryColor || 'var(--tgo-brand-primary)') : 'transparent',
                        color: isActive ? 'white' : 'var(--tgo-text-muted)',
                      }}
                    >
                      <TabIcon size={16} />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error ? (
            <div className="p-6">
              <div
                className="p-4"
                style={{
                  ...cardStyle,
                  borderColor: 'rgba(239, 68, 68, 0.2)',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                }}
              >
                <div className="flex items-center gap-3" style={{ color: 'var(--tgo-state-danger)' }}>
                  <AlertCircle size={20} />
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          ) : !clubData?.member ? (
            <div className="p-6">
              <div className="p-6 text-center" style={cardStyle}>
                <Trophy size={48} className="mx-auto mb-4" style={{ color: 'var(--tgo-text-muted)' }} />
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--tgo-text-primary)' }}>
                  No sos miembro del club
                </h3>
                <p className="text-sm mb-6" style={{ color: 'var(--tgo-text-muted)' }}>
                  Unite al club para acumular puntos en cada compra y obtener beneficios exclusivos.
                </p>
                <button
                  onClick={handleJoinClub}
                  disabled={joining}
                  className="w-full py-3 text-white font-bold text-sm transition-all disabled:opacity-50"
                  style={{
                    borderRadius: 'var(--tgo-radius-md)',
                    backgroundColor: 'var(--tgo-state-action)',
                  }}
                >
                  {joining ? 'Uniéndote...' : 'Unirse al Club'}
                </button>
                {joinError && (
                  <p className="text-xs mt-2" style={{ color: 'var(--tgo-state-danger)' }}>
                    {joinError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Points Card */}
              <div
                className="overflow-hidden"
                style={{
                  ...cardStyle,
                  background: 'linear-gradient(135deg, var(--tgo-surface-3), var(--tgo-surface-2))',
                }}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <p
                        className="uppercase tracking-wider mb-1"
                        style={{ fontSize: 10, color: 'var(--tgo-text-muted)' }}
                      >
                        Nivel Actual
                      </p>
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r ${getTierColor(clubData.member.tier)}`}>
                        <Trophy size={16} className="text-white" />
                        <span className="text-sm font-bold text-white">
                          {getTierLabel(clubData.member.tier)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="uppercase tracking-wider mb-1"
                        style={{ fontSize: 10, color: 'var(--tgo-text-muted)' }}
                      >
                        Miembro desde
                      </p>
                      <p className="text-sm" style={{ color: 'var(--tgo-text-secondary)' }}>
                        {new Date(clubData.member.joinedAt).toLocaleDateString('es-AR', {
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="text-center py-4">
                    <p className="text-6xl font-black mb-2" style={{ color: 'var(--tgo-text-primary)' }}>
                      {clubData.member.points}
                    </p>
                    <p
                      className="text-sm uppercase tracking-wider"
                      style={{ color: 'var(--tgo-text-muted)' }}
                    >
                      Puntos Disponibles
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4" style={cardStyle}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingBag size={18} style={{ color: 'var(--tgo-state-reward)' }} />
                    <p
                      className="uppercase tracking-wider"
                      style={{ fontSize: 10, color: 'var(--tgo-text-muted)' }}
                    >
                      Pedidos
                    </p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                    {clubData.member.totalOrders}
                  </p>
                </div>

                <div className="p-4" style={cardStyle}>
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign size={18} style={{ color: 'var(--tgo-state-success)' }} />
                    <p
                      className="uppercase tracking-wider"
                      style={{ fontSize: 10, color: 'var(--tgo-text-muted)' }}
                    >
                      Gastado
                    </p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                    ${clubData.member.totalSpent.toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Last Order */}
              {clubData.member.lastOrderAt && (
                <div className="p-4" style={cardStyle}>
                  <div className="flex items-center gap-2">
                    <Calendar size={18} style={{ color: 'var(--tgo-text-muted)' }} />
                    <div>
                      <p
                        className="uppercase tracking-wider"
                        style={{ fontSize: 10, color: 'var(--tgo-text-muted)' }}
                      >
                        Último pedido
                      </p>
                      <p className="text-sm" style={{ color: 'var(--tgo-text-primary)' }}>
                        {new Date(clubData.member.lastOrderAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Wallet */}
              {clubData.walletEnabled && (
                <div className="space-y-3">
                  <h3
                    className="uppercase tracking-widest"
                    style={{ fontSize: 10, fontWeight: 900, color: 'var(--tgo-text-muted)' }}
                  >
                    Billetera Digital
                  </h3>
                  <div
                    className="flex items-start gap-3 p-4"
                    style={{
                      borderRadius: 'var(--tgo-radius-md)',
                      backgroundColor: 'rgba(139, 92, 246, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.1)',
                    }}
                  >
                    <Smartphone size={16} className="text-violet-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-violet-700 leading-relaxed">
                      Agrega tu tarjeta a Google Wallet o Apple Wallet para tenerla siempre disponible.
                      Los puntos se actualizan automáticamente.
                    </p>
                  </div>

                  <AddToWalletButtons
                    tenantSlug={tenantSlug}
                    memberId={clubData.member.id}
                    publicId={clubData.member.publicId}
                    points={clubData.member.points}
                    tier={clubData.member.tier}
                    appleAvailable={clubData.appleWalletAvailable}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <BottomNav />
    </div>
  )
}

export default function ClubProfilePage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = use(params)

  return (
    <Suspense fallback={
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <Loader2 size={32} style={{ color: 'var(--tgo-text-muted)' }} className="animate-spin" />
      </div>
    }>
      <ClubContent tenantSlug={tenantSlug} />
    </Suspense>
  )
}
