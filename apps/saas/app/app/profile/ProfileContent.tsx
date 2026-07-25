'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { LogOut, User, Settings, ShoppingBag, Heart, ChevronRight, LogIn, Trophy, AlertCircle, MapPin, X, Loader2 } from 'lucide-react'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { BlurFade } from '@/components/ui/blur-fade'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import BottomNav from '@/components/explore/BottomNav'
import { useTenant } from '@/contexts/TenantContext'
import AddressSelector from '@/components/explore/AddressSelector'
import { useState, useEffect } from 'react'
import RestaurantLeadModal from '@/components/explore/RestaurantLeadModal'

interface ClubSummary {
  tenantSlug: string
  tenantName: string
  logoUrl: string | null
  primaryColor: string
  points: number
  tier: string
  totalOrders: number
  lastOrderAt: string | null
  clubName: string
}

interface SuggestedClub {
  tenantSlug: string
  tenantName: string
  logoUrl: string | null
  primaryColor: string
  distanceM: number | null
  hasOrdered: boolean
  clubName: string
}

export default function ProfileContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const { tenantSlug } = useTenant()
  const loading = status === 'loading'
  const [showAddressSelector, setShowAddressSelector] = useState(false)
  const [showRestaurantLead, setShowRestaurantLead] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  const [myClubs, setMyClubs] = useState<ClubSummary[]>([])
  const [suggestedClubs, setSuggestedClubs] = useState<SuggestedClub[]>([])
  const [clubsLoading, setClubsLoading] = useState(false)

  useEffect(() => {
    if (callbackUrl && callbackUrl !== '/') {
      localStorage.setItem('auth_pending_redirect', callbackUrl)
    }
  }, [callbackUrl])

  useEffect(() => {
    if (session) {
      const pendingRedirect = localStorage.getItem('auth_pending_redirect')
      if (pendingRedirect && pendingRedirect !== window.location.href) {
        localStorage.removeItem('auth_pending_redirect')
        router.push(pendingRedirect)
        return
      }
      setClubsLoading(true)
      fetch('/api/explore/loyalty/clubs')
        .then(res => res.json())
        .then(data => {
          setMyClubs(data.myClubs || [])
          setSuggestedClubs(data.suggestedClubs || [])
        })
        .catch(() => {})
        .finally(() => setClubsLoading(false))
    }
  }, [session])

  if (loading) {
    return (
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{
            borderColor: 'var(--tgo-state-interactive)',
            borderTopColor: 'transparent',
          }}
        />
      </div>
    )
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--tgo-radius-xl)',
    backgroundColor: 'var(--tgo-surface-card)',
    border: '1px solid var(--tgo-border)',
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 'var(--tgo-tracking-widest)',
    color: 'var(--tgo-text-muted)',
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-24"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {!session ? (
        /* ── LOGIN VIEW ─────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
          {/* Background decoration */}
          <div
            className="absolute rounded-full"
            style={{
              top: '-10%',
              left: '-10%',
              width: '40%',
              height: '40%',
              background: 'var(--tgo-state-interactive)',
              opacity: 0.06,
              filter: 'blur(120px)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              bottom: '-5%',
              right: '-5%',
              width: '30%',
              height: '30%',
              background: 'var(--tgo-state-success)',
              opacity: 0.04,
              filter: 'blur(100px)',
            }}
          />

          <BlurFade delay={0.1}>
            <div
              className="w-20 h-20 flex items-center justify-center mb-6 relative group"
              style={{
                backgroundColor: 'var(--tgo-surface-card)',
                borderRadius: 'var(--tgo-radius-2xl)',
                border: '1px solid var(--tgo-border)',
              }}
            >
              <BorderBeam size={80} duration={8} />
              <User size={32} style={{ color: 'var(--tgo-state-interactive)' }} />
            </div>
          </BlurFade>

          <BlurFade delay={0.2}>
            <h1
              className="text-2xl font-bold text-center mb-2"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              Tu perfil Gastronómico
            </h1>
            <p
              className="text-sm text-center mb-8 max-w-[280px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              Iniciá sesión para guardar tus favoritos, ver tu historial y gestionar tus pedidos.
            </p>
          </BlurFade>

          <div className="w-full max-w-[320px] space-y-3">
            <button
              onClick={() => {}}
              disabled
              className="w-full flex items-center justify-center gap-3 py-3.5 bg-black text-white font-bold transition-transform active:scale-95 opacity-50 cursor-not-allowed"
              style={{ borderRadius: 'var(--tgo-radius-xl)' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M17.05 20.28c-.96.95-2.04 2.15-3.32 2.15-1.24 0-1.63-.78-3.08-.78-1.46 0-1.89.76-3.08.76-1.28 0-2.31-1.13-3.32-2.15-2.07-2.08-3.66-5.88-3.66-9.15 0-5.23 3.39-8 6.58-8 1.63 0 2.92.57 3.82.57.85 0 2.37-.62 4.24-.62 1.93 0 4.09.87 5.3 2.76-3.8 1.83-3.18 6.78.29 8.24-1.07 2.47-2.73 5.3-3.77 6.22zm-4.33-14.89c.83-1.05 1.4-2.5 1.4-3.94 0-.2-.02-.4-.05-.59-1.34.05-2.95.89-3.92 2.03-.86 1-1.61 2.5-1.61 4 .01.21.04.42.06.6.14.01.29.02.43.02 1.25 0 2.87-.78 3.69-2.12z" />
              </svg>
              Próximamente Apple
            </button>

            <button
              onClick={() => signIn('google', { callbackUrl })}
              className="w-full flex items-center justify-center gap-3 py-3.5 bg-white text-zinc-900 font-bold shadow-sm border border-zinc-200 transition-transform active:scale-95"
              style={{ borderRadius: 'var(--tgo-radius-xl)' }}
            >
              <Image
                src="https://www.google.com/favicon.ico"
                alt="Google"
                width={18}
                height={18}
                className="shrink-0"
              />
              Continuar con Google
            </button>

            {!showEmailForm ? (
              <button
                onClick={() => setShowEmailForm(true)}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-zinc-100 text-zinc-900 font-bold transition-transform active:scale-95"
                style={{ borderRadius: 'var(--tgo-radius-xl)' }}
              >
                <LogIn size={20} className="text-zinc-600" />
                Continuar con Email
              </button>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!emailInput) return
                  setEmailLoading(true)
                  setEmailError('')
                  try {
                    await signIn('email', { email: emailInput, callbackUrl, redirect: false })
                  } catch {
                    setEmailError('Error al enviar el link. Intentá de nuevo.')
                  } finally {
                    setEmailLoading(false)
                  }
                }}
                className="space-y-2"
              >
                <input
                  type="email"
                  required
                  placeholder="Tu email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full h-12 px-4 bg-zinc-100 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[var(--tgo-state-interactive)]/30 transition-all"
                  style={{ borderRadius: 'var(--tgo-radius-xl)' }}
                />
                {emailError && (
                  <p className="text-xs text-red-500 font-medium">{emailError}</p>
                )}
                <button
                  type="submit"
                  disabled={emailLoading || !emailInput}
                  className="w-full h-12 bg-zinc-900 text-white font-bold text-sm transition-all active:scale-[0.985] disabled:opacity-50"
                  style={{ borderRadius: 'var(--tgo-radius-xl)' }}
                >
                  {emailLoading ? 'Enviando...' : 'Enviar link mágico'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEmailForm(false); setEmailInput(''); setEmailError('') }}
                  className="w-full text-xs text-zinc-400 hover:text-zinc-600 font-medium transition-colors"
                >
                  Volver
                </button>
              </form>
            )}
          </div>

          <BlurFade delay={0.4} className="mt-8">
            <p
              className="text-[11px] text-center"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              Al continuar, aceptás nuestros <br />
              <span style={{ color: 'var(--tgo-text-secondary)' }} className="underline">
                Términos y condiciones
              </span>
            </p>
          </BlurFade>

          <div
            className="w-full max-w-[320px] mt-10 pt-8"
            style={{ borderTop: '1px solid var(--tgo-border)' }}
          >
            <p
              className="text-[10px] text-center mb-3 uppercase tracking-widest font-medium"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              ¿Tenés un restaurante?
            </p>
            <button
              onClick={() => setShowRestaurantLead(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all active:scale-[0.98]"
              style={{
                ...cardStyle,
                color: 'var(--tgo-state-interactive)',
              }}
            >
              Registrá tu restaurante
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full flex items-center justify-center gap-2 py-3 mt-2 text-sm font-bold transition-all active:scale-[0.98]"
              style={{
                ...cardStyle,
                color: 'var(--tgo-text-secondary)',
              }}
            >
              Accedé a tu panel de gestión
            </button>
          </div>
        </div>
      ) : (
        /* ── PROFILE VIEW ────────────────────────────────────────── */
        <div className="flex-1 p-6 animate-fade-in-up">
          {/* User Header */}
          <div
            className="relative p-6 mb-8 overflow-hidden"
            style={{
              ...cardStyle,
              borderRadius: 'var(--tgo-radius-2xl)',
            }}
          >
            <BorderBeam size={200} duration={12} colorFrom="var(--tgo-state-interactive)" colorTo="var(--tgo-state-interactive)" />

            <div className="flex items-center gap-4 relative z-10">
              <div
                className="w-16 h-16 overflow-hidden shrink-0"
                style={{
                  borderRadius: 'var(--tgo-radius-xl)',
                  border: '2px solid var(--tgo-border)',
                }}
              >
                {session.user?.image ? (
                  <Image src={session.user.image} alt={session.user.name || ''} width={64} height={64} />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--tgo-surface-0)' }}
                  >
                    <User size={24} style={{ color: 'var(--tgo-text-muted)' }} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2
                  className="text-lg font-bold truncate"
                  style={{ color: 'var(--tgo-text-primary)' }}
                >
                  {session.user?.name}
                </h2>
                <p
                  className="text-xs truncate"
                  style={{ color: 'var(--tgo-text-muted)' }}
                >
                  {session.user?.email}
                </p>
                <div
                  className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5"
                  style={{
                    borderRadius: 'var(--tgo-radius-full)',
                    backgroundColor: 'var(--tgo-brand-primary-soft)',
                    border: '1px solid var(--tgo-brand-primary)',
                  }}
                >
                  <div
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: 'var(--tgo-brand-primary)' }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tgo-tracking-widest)',
                      color: 'var(--tgo-brand-primary)',
                    }}
                  >
                    Cliente {session.user?.role || 'Consumer'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions List */}
          <div className="space-y-3">
            <h3 className="ml-1 mb-2" style={sectionTitle}>
              Actividad
            </h3>

            <button
              onClick={() => router.push('/app/orders')}
              className="w-full p-4 flex items-center gap-4 group transition-all"
              style={cardStyle}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--tgo-surface-1)',
                  color: 'var(--tgo-state-interactive)',
                }}
              >
                <ShoppingBag size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                  Mis Pedidos
                </p>
                <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                  Historial y seguimiento
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
            </button>

            <button
              onClick={() => setShowAddressSelector(true)}
              className="w-full p-4 flex items-center gap-4 group transition-all"
              style={cardStyle}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--tgo-surface-1)',
                  color: '#3b82f6',
                }}
              >
                <MapPin size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                  Mis Direcciones
                </p>
                <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                  Gestionar direcciones de entrega
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
            </button>

            <button className="w-full p-4 flex items-center gap-4 group transition-all" style={cardStyle}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--tgo-surface-1)',
                  color: 'var(--tgo-state-success)',
                }}
              >
                <Heart size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                  Favoritos
                </p>
                <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                  Tus lugares preferidos
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
            </button>

            {/* ── Club de Fidelización ─────────────────────────────── */}
            {clubsLoading ? (
              <div className="w-full p-4 flex items-center gap-4" style={cardStyle}>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-state-warning)',
                  }}
                >
                  <Loader2 size={20} className="animate-spin" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                    Club de Fidelización
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                    Cargando...
                  </p>
                </div>
              </div>
            ) : myClubs.length > 0 ? (
              <div className="w-full p-4" style={cardStyle}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} style={{ color: 'var(--tgo-state-warning)' }} />
                    <p className="text-xs font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                      Tus Clubs
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/app/profile/clubs')}
                    className="text-[10px] font-bold transition-colors"
                    style={{ color: 'var(--tgo-state-warning)' }}
                  >
                    Ver todos
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {myClubs.slice(0, 5).map(club => (
                    <button
                      key={club.tenantSlug}
                      onClick={() => router.push(`/app/profile/club/${club.tenantSlug}`)}
                      className="shrink-0 flex flex-col items-center gap-1.5 p-3 transition-colors min-w-[80px]"
                      style={{
                        borderRadius: 'var(--tgo-radius-md)',
                        backgroundColor: 'var(--tgo-surface-1)',
                      }}
                    >
                      {club.logoUrl ? (
                        <Image src={club.logoUrl} alt="" width={32} height={32} className="rounded-full" unoptimized />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--tgo-state-warning-soft)' }}
                        >
                          <Trophy size={14} style={{ color: 'var(--tgo-state-warning)' }} />
                        </div>
                      )}
                      <p
                        className="text-[10px] font-bold truncate max-w-[70px] text-center leading-tight"
                        style={{ color: 'var(--tgo-text-primary)' }}
                      >
                        {club.clubName}
                      </p>
                      <p
                        className="text-[9px] font-black tabular-nums"
                        style={{ color: 'var(--tgo-state-warning)' }}
                      >
                        {club.points} pts
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : tenantSlug && suggestedClubs.some(c => c.tenantSlug === tenantSlug) ? (
              <button
                onClick={() => router.push(`/app/profile/club/${tenantSlug}`)}
                className="w-full p-4 flex items-center gap-4 group transition-all"
                style={cardStyle}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--tgo-state-warning-soft)',
                    color: 'var(--tgo-state-warning)',
                  }}
                >
                  <Trophy size={20} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                    Unite al Club
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                    Acumulá puntos en {suggestedClubs.find(c => c.tenantSlug === tenantSlug)?.clubName}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
              </button>
            ) : suggestedClubs.length > 0 ? (
              <button
                onClick={() => router.push('/app/profile/clubs')}
                className="w-full p-4 flex items-center gap-4 group transition-all"
                style={cardStyle}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-state-warning)',
                  }}
                >
                  <Trophy size={20} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                    Descubrí Clubs
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                    {suggestedClubs.length} clubs disponibles cerca tuyo
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
              </button>
            ) : (
              <div className="w-full p-4 flex items-center gap-4" style={cardStyle}>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-text-muted)',
                  }}
                >
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                    Club de Fidelización
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                    Sin clubs disponibles por ahora
                  </p>
                </div>
              </div>
            )}

            <div className="h-4" />
            <h3 className="ml-1 mb-2" style={sectionTitle}>
              Configuración
            </h3>

            <button
              onClick={() => router.push('/app/profile/settings')}
              className="w-full p-4 flex items-center gap-4 group transition-all"
              style={cardStyle}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--tgo-surface-1)',
                  color: 'var(--tgo-text-muted)',
                }}
              >
                <Settings size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                  Mi Cuenta
                </p>
                <p className="text-[10px]" style={{ color: 'var(--tgo-text-muted)' }}>
                  Preferencias y datos
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--tgo-text-muted)' }} />
            </button>

            <button
              onClick={() => signOut({ callbackUrl: window.location.pathname })}
              className="w-full p-4 flex items-center gap-4 group transition-all mt-8"
              style={{
                ...cardStyle,
                borderColor: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  color: 'var(--tgo-state-danger)',
                }}
              >
                <LogOut size={20} />
              </div>
              <div className="flex-1 text-left">
                <p
                  className="text-sm font-bold"
                  style={{ color: 'var(--tgo-state-danger)', opacity: 0.8 }}
                >
                  Cerrar Sesión
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Restaurant Lead Modal */}
      {showRestaurantLead && (
        <RestaurantLeadModal onClose={() => setShowRestaurantLead(false)} />
      )}

      {/* Address Selector Modal */}
      {showAddressSelector && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div
            className="w-full max-w-md max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={{
              backgroundColor: 'var(--tgo-surface-0)',
              borderRadius: 'var(--tgo-radius-2xl)',
            }}
          >
            <div
              className="sticky top-0 z-10 p-4"
              style={{
                backgroundColor: 'var(--tgo-surface-0)',
                borderBottom: '1px solid var(--tgo-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                  Mis Direcciones
                </h2>
                <button
                  onClick={() => setShowAddressSelector(false)}
                  className="w-8 h-8 flex items-center justify-center transition-colors"
                  style={{
                    borderRadius: 'var(--tgo-radius-md)',
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-text-muted)',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-4">
              <AddressSelector onClose={() => {
                setShowAddressSelector(false)
                router.push('/app')
              }} />
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
