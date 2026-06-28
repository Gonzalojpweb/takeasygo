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
  CreditCard,
  Smartphone,
  Gift
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  }, [status, tenantSlug, router])

  const handleJoinClub = async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/join`, { method: 'POST' })
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
      const res = await fetch(`/api/${tenantSlug}/loyalty/me`)
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
      <div className="flex flex-col h-full bg-[var(--c-bg)] items-center justify-center">
        <Loader2 size={32} className="text-[#f14722] animate-spin" />
      </div>
    )
  }

  if (!clubData?.clubEnabled) {
    return (
      <div className="flex flex-col h-full bg-[var(--c-bg)] p-6 pb-24">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          aria-label="Volver atrás"
          className="w-fit mb-6 text-[#a8a29e] hover:text-[#f7f4f2]"
        >
          <ArrowLeft size={20} className="mr-2" />
          Volver
        </Button>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <AlertCircle size={48} className="text-[#a8a29e] mb-4" />
          <h2 className="text-xl font-bold text-[#f7f4f2] mb-2">
            Club no disponible
          </h2>
          <p className="text-[#a8a29e] text-sm">
            Este restaurante no tiene el club de fidelización activo.
          </p>
        </div>

        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] overflow-y-auto pb-24">
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
        />
      ) : currentTab === 'canjes' && clubData?.member ? (
        <MyRedemptions
          tenantSlug={tenantSlug}
          memberId={clubData.member.id}
          onBack={() => router.replace(`${pathname}?tab=club`)}
        />
      ) : (
        <>
          <div className="p-6">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              aria-label="Volver atrás"
              className="w-fit mb-4 text-[#a8a29e] hover:text-[#f7f4f2] focus-visible:ring-2 focus-visible:ring-[#a8a29e]"
            >
              <ArrowLeft size={20} className="mr-2" />
              Volver
            </Button>

            <h1 className="text-2xl font-bold text-[#f7f4f2] mb-1">
              {clubData?.clubName || 'Club de Fidelización'}
            </h1>
            {clubData?.welcomeMessage && (
              <p className="text-[#a8a29e] text-sm">{clubData.welcomeMessage}</p>
            )}
          </div>

          {clubData?.member && (
            <div className="px-6 pb-4">
              <div 
                className="flex items-center gap-2 rounded-xl p-1"
                role="tablist"
                aria-label="Navegación del club"
                style={{ backgroundColor: `${clubData.branding?.primaryColor || '#000'}15` }}
              >
                <button
                  role="tab"
                  aria-selected={currentTab === 'club'}
                  aria-controls="panel-club"
                  onClick={() => router.replace(`${pathname}?tab=club`)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    currentTab === 'club'
                      ? 'text-white shadow-lg'
                      : 'text-[#a8a29e] hover:text-[#f7f4f2] focus-visible:ring-[#a8a29e]'
                  }`}
                  style={currentTab === 'club' ? { backgroundColor: clubData.branding?.primaryColor || '#f14722' } : undefined}
                >
                  <Trophy size={16} />
                  Club
                </button>
                <button
                  role="tab"
                  aria-selected={currentTab === 'store'}
                  aria-controls="panel-store"
                  onClick={() => router.replace(`${pathname}?tab=store`)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    currentTab === 'store'
                      ? 'text-white shadow-lg'
                      : 'text-[#a8a29e] hover:text-[#f7f4f2] focus-visible:ring-[#a8a29e]'
                  }`}
                  style={currentTab === 'store' ? { backgroundColor: clubData.branding?.primaryColor || '#f14722' } : undefined}
                >
                  <Gift size={16} />
                  Tienda
                </button>
                <button
                  role="tab"
                  aria-selected={currentTab === 'canjes'}
                  aria-controls="panel-canjes"
                  onClick={() => router.replace(`${pathname}?tab=canjes`)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    currentTab === 'canjes'
                      ? 'text-white shadow-lg'
                      : 'text-[#a8a29e] hover:text-[#f7f4f2] focus-visible:ring-[#a8a29e]'
                  }`}
                  style={currentTab === 'canjes' ? { backgroundColor: clubData.branding?.primaryColor || '#f14722' } : undefined}
                >
                  <ShoppingBag size={16} />
                  Canjes
                </button>
              </div>
            </div>
          )}

          {error ? (
            <div className="p-6">
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 text-red-500">
                    <AlertCircle size={20} />
                    <p className="text-sm">{error}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : !clubData?.member ? (
            <div className="p-6">
              <Card className="border-[var(--c-border)] bg-[var(--c-surface)]">
                <CardContent className="p-6 text-center">
                  <Trophy size={48} className="text-[#a8a29e] mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-[#f7f4f2] mb-2">
                    No sos miembro del club
                  </h3>
                  <p className="text-[#a8a29e] text-sm mb-6">
                    Unite al club para acumular puntos en cada compra y obtener beneficios exclusivos.
                  </p>
                  <Button
                    className="w-full bg-[#f14722] text-white"
                    onClick={handleJoinClub}
                    disabled={joining}
                  >
                    {joining ? 'Uniéndote...' : 'Unirse al Club'}
                  </Button>
                  {joinError && (
                    <p className="text-red-500 text-xs mt-2">{joinError}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <Card className="border-[var(--c-border)] bg-gradient-to-br from-zinc-900 to-zinc-800 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
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
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                        Miembro desde
                      </p>
                      <p className="text-sm text-zinc-300">
                        {new Date(clubData.member.joinedAt).toLocaleDateString('es-AR', { 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="text-center py-4">
                    <p className="text-6xl font-black text-white mb-2">
                      {clubData.member.points}
                    </p>
                    <p className="text-zinc-400 text-sm uppercase tracking-wider">
                      Puntos Disponibles
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card className="border-[var(--c-border)] bg-[var(--c-surface)]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag size={18} className="text-[#f14722]" />
                      <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider">
                        Pedidos
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-[#f7f4f2]">
                      {clubData.member.totalOrders}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-[var(--c-border)] bg-[var(--c-surface)]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign size={18} className="text-emerald-500" />
                      <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider">
                        Gastado
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-[#f7f4f2]">
                      ${clubData.member.totalSpent.toFixed(0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {clubData.member.lastOrderAt && (
                <Card className="border-[var(--c-border)] bg-[var(--c-surface)]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-[#a8a29e]" />
                      <div>
                        <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider">
                          Último pedido
                        </p>
                        <p className="text-sm text-[#f7f4f2]">
                          {new Date(clubData.member.lastOrderAt).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {clubData.walletEnabled && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[#a8a29e]">
                    Billetera Digital
                  </h3>
                  <div className="flex items-start gap-3 p-4 bg-violet-50 rounded-xl border border-violet-100">
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
      <div className="flex flex-col h-full bg-[var(--c-bg)] items-center justify-center">
        <Loader2 size={32} className="text-[#f14722] animate-spin" />
      </div>
    }>
      <ClubContent tenantSlug={tenantSlug} />
    </Suspense>
  )
}
