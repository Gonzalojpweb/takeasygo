'use client'

// ── DiscoveryFeed ────────────────────────────────────────────────────────────
//
// La nueva Home de TakeasyGo.
// No es un dashboard. Es una historia.
// Cada sección responde una pregunta distinta del usuario.
//
// Modulos: HomeHeader → BrandBlock → QuickFilters → Categories →
//          OpenNow → Nearby → Experiences

import { useState, useEffect, useMemo, useCallback } from 'react'
import { microcopy } from '@/components/tgo/microcopy'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTenant } from '@/contexts/TenantContext'
import { useLocation } from './LocationContext'
import { Share2, Users, Sun, Moon } from 'lucide-react'
import { toast } from 'sonner'
import { captureHomeShared } from '@/lib/tia/events'

// TGO Primitives
import { Section, LiveCityMetrics, SolidIconPill } from '@/components/tgo'
import PullToRefresh from '@/components/tgo/PullToRefresh'

// Components
import Image from 'next/image'
import { User } from 'lucide-react'
import { SmartGreeting } from '@/components/tgo'
import { useHaptic } from '@/components/tgo/useHaptic'

// Lazy-loaded below-fold modules
import dynamic from 'next/dynamic'

const CategoriesModule = dynamic(
  () => import('./DiscoveryFeed/CategoriesModule').then(m => ({ default: m.CategoriesModule })),
  { ssr: false }
)
const NearbyModule = dynamic(
  () => import('./DiscoveryFeed/NearbyModule').then(m => ({ default: m.NearbyModule })),
  { ssr: false }
)
const NewInNetworkModule = dynamic(
  () => import('./DiscoveryFeed/NewInNetworkModule').then(m => ({ default: m.NewInNetworkModule })),
  { ssr: false }
)
const TimeBasedModule = dynamic(
  () => import('./DiscoveryFeed/TimeBasedModule').then(m => ({ default: m.TimeBasedModule })),
  { ssr: false }
)
const ExperiencesModule = dynamic(
  () => import('./DiscoveryFeed/ExperiencesModule').then(m => ({ default: m.ExperiencesModule })),
  { ssr: false }
)

// Re-export CATEGORY_CONFIG for the categories useMemo
import { CATEGORY_CONFIG } from './DiscoveryFeed/CategoriesModule'

// ── QuickFilters (stays here — above the fold) ─────────────────────────────

import { Clock, Bike, MapPin, Tag } from 'lucide-react'

const QUICK_FILTERS = [
  { label: 'Abiertos', icon: Clock, query: 'abiertos', iconColor: 'var(--tgo-state-activity)' },
  { label: 'Delivery', icon: Bike, query: 'delivery', iconColor: 'var(--tgo-state-trust)' },
  { label: 'Cercanos', icon: MapPin, query: 'cercanos', iconColor: 'var(--tgo-state-proximity)' },
  { label: 'Beneficios', icon: Tag, query: 'beneficios', iconColor: 'var(--tgo-state-reward)' },
]

function QuickFiltersModule({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string | null
  onFilterChange: (q: string | null) => void
}) {
  const haptic = useHaptic()
  return (
    <div className="flex gap-2">
      {QUICK_FILTERS.map((f) => {
        const Icon = f.icon
        const isActive = activeFilter === f.query
        return (
          <button
            key={f.query}
            onClick={() => { haptic.selection(); onFilterChange(isActive ? null : f.query) }}
            className="flex items-center gap-1.5 active:scale-[0.96]"
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 'var(--tgo-radius-pill)',
              fontSize: 'var(--tgo-type-body-sm)',
              fontWeight: isActive ? 600 : 400,
              backgroundColor: isActive
<<<<<<< HEAD
                ? 'var(--tgo-state-trust-soft)'
                : 'var(--tgo-card)',
              color: isActive
=======
>>>>>>> d20e1c74cddac36743d1cc3570848922a339ab9d
                ? 'var(--tgo-state-trust)'
                : 'var(--tgo-card)',
              color: isActive
                ? '#FFFFFF'
                : 'var(--tgo-text-primary)',
              border: `1px solid ${isActive ? 'var(--tgo-state-trust)' : 'var(--tgo-border)'}`,
              transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
            }}
          >
            <Icon size={14} />
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main DiscoveryFeed ───────────────────────────────────────────────────────

interface DiscoveryFeedProps {
  userName?: string
  onOpenLeadModal?: () => void
  onCategorySelect?: (name: string) => void
}

export default function DiscoveryFeed({
  userName,
  onOpenLeadModal,
  onCategorySelect,
}: DiscoveryFeedProps) {
  const { currentAddress } = useLocation()
  const { setTenantSlug } = useTenant()
  const { data: session } = useSession()
  const router = useRouter()
  const haptic = useHaptic()

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [preferredCuisines, setPreferredCuisines] = useState<string[]>([])
  const [showAllCategories, setShowAllCategories] = useState(false)

  const handleShare = useCallback(async () => {
    const shareData = {
      title: 'TGO',
      text: 'Descubrí restaurantes cerca tuyo con beneficios exclusivos',
      url: 'https://takeasygo.com/apps',
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        captureHomeShared('native')
      } else {
        await navigator.clipboard.writeText(shareData.url)
        captureHomeShared('clipboard')
        toast('Link copiado')
      }
    } catch {
      // Usuario canceló el share
    }
  }, [])
  // Fetch user preferences for personalization
  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/user/preferences')
        .then((res) => res.json())
        .then((json) => {
          if (json.exists && json.preferences?.cuisinePreferences) {
            setPreferredCuisines(json.preferences.cuisinePreferences)
          }
        })
        .catch(() => {})
    }
  }, [session])

  useEffect(() => {
    if (currentAddress) fetchHomeData()
  }, [currentAddress])

  const fetchHomeData = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/explore/home?lat=${currentAddress?.coordinates.lat}&lng=${currentAddress?.coordinates.lng}`
      )
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Error fetching home data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleNavigate = (r: { id: string; type: string }) => {
    setTenantSlug(r.id)
    router.push(`/app/${r.id}?type=${r.type}`)
  }

  const nearbyTenants: any[] = data?.nearbyTenants ?? []
  const promotions: any[] = data?.promotions ?? []
  const redemptions: any[] = data?.redemptions ?? []
  const allExperiences = useMemo(
    () => [...promotions, ...redemptions],
    [promotions, redemptions]
  )
  const rawCategories: string[] = data?.categories ?? []

  // Always show ALL CATEGORY_CONFIG entries
  // DB categories first (prioritized by proximity), then the rest alphabetically
  const categories = useMemo(() => {
    const allConfigKeys = Object.keys(CATEGORY_CONFIG)
    const dbLower = rawCategories.map((c) => c.toLowerCase())
    const inDb = allConfigKeys.filter((k) => dbLower.includes(k.toLowerCase()))
    const notInDb = allConfigKeys.filter((k) => !dbLower.includes(k.toLowerCase()))
    const preferred = preferredCuisines.length > 0
      ? inDb.sort((a, b) => {
          const ai = preferredCuisines.findIndex((p) => a.toLowerCase().includes(p.toLowerCase()))
          const bi = preferredCuisines.findIndex((p) => b.toLowerCase().includes(p.toLowerCase()))
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : inDb
    return [...preferred, ...notInDb]
  }, [rawCategories, preferredCuisines])

  // QuickFilter: filter nearbyTenants based on active filter
  const filteredNearby = useMemo(() => {
    if (!activeFilter) return nearbyTenants
    switch (activeFilter) {
      case 'abiertos':
        return nearbyTenants.filter((r: any) => r.isOpenNow === true || r.isOpenNow === null)
      case 'delivery':
        return nearbyTenants.filter((r: any) =>
          r.deliveryEnabled === true && (r.isDeliveryOpen === true || r.isDeliveryOpen === null)
        )
      case 'cercanos':
        return [...nearbyTenants].sort((a: any, b: any) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
      case 'beneficios':
        return nearbyTenants.filter((r: any) =>
          r.loyaltyInfo?.hasClub || r.loyaltyInfo?.hasActivePromo
        )
      default:
        return nearbyTenants
    }
  }, [nearbyTenants, activeFilter])

  if (loading && !data) {
    return (
      <div className="h-full" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
        <div className="p-6 space-y-6">
          <div className="h-10 w-48 bg-[var(--tgo-surface-2)] rounded-lg animate-pulse" />
          <div className="h-12 bg-[var(--tgo-surface-2)] rounded-full animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-8 w-20 bg-[var(--tgo-surface-2)] rounded-full animate-pulse"
              />
            ))}
          </div>
          <div className="h-48 bg-[var(--tgo-surface-2)] rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={fetchHomeData}>
      <div
        className="h-full overflow-y-auto no-scrollbar pb-32"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
      {/* 0. Top Nav Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px var(--tgo-page-padding)',
        }}
      >
        <Image src="/tgoicon.png" alt="TGO" width={28} height={28} unoptimized />
        <button
          onClick={() => router.push('/app/profile')}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid var(--tgo-border)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            background: session?.user?.image ? 'transparent' : 'var(--tgo-state-trust)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={userName || ''}
              width={36}
              height={36}
              className="object-cover"
              unoptimized
            />
          ) : (
            <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
              {userName ? userName.charAt(0).toUpperCase() : <User size={16} />}
            </span>
          )}
        </button>
      </div>

      {/* 1. Greeting Card */}
      {(() => {
        const hour = new Date().getHours()
        const isDay = hour >= 6 && hour < 19
        return (
          <div
            style={{
              backgroundColor: 'var(--tgo-card)',
              borderRadius: 'var(--tgo-radius-lg)',
              padding: '16px var(--tgo-page-padding)',
              margin: '0 var(--tgo-page-padding) 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ paddingTop: 2, flexShrink: 0 }}>
                {isDay ? (
                  <Sun size={20} style={{ color: 'var(--tgo-state-discovery)' }} />
                ) : (
                  <Moon size={20} style={{ color: 'var(--tgo-state-trust)' }} />
                )}
              </div>
              <SmartGreeting
                userName={userName || session?.user?.name?.split(' ')[0] || ''}
                interval={10000}
              />
            </div>
          </div>
        )
      })()}

      {/* 2. Brand Block — Pills */}
      <div
        style={{
          padding: '0 var(--tgo-page-padding) 20px',
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <SolidIconPill
            bgColor="var(--tgo-state-trust)"
            title="@tgo.app"
            subtitle="Seguinos"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            }
            href="https://instagram.com/tgo.app"
<<<<<<< HEAD
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--tgo-radius-pill)',
              fontSize: 'var(--tgo-type-caption)',
              fontWeight: 600,
              color: 'var(--tgo-text-inverse)',
              backgroundColor: 'var(--tgo-state-trust)',
              border: '0.5px solid var(--tgo-state-trust)',
              textDecoration: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            @tgo.app
          </a>
          <button
            onClick={() => { haptic.impact('light'); handleShare() }}
            className="flex items-center gap-1.5"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--tgo-radius-pill)',
              fontSize: 'var(--tgo-type-caption)',
              fontWeight: 600,
              color: 'var(--tgo-text-inverse)',
              backgroundColor: 'var(--tgo-state-discovery)',
              border: '0.5px solid var(--tgo-state-discovery)',
              cursor: 'pointer',
            }}
          >
            <Share2 size={12} />
            Compartí
          </button>
=======
          />
          <SolidIconPill
            bgColor="var(--tgo-state-discovery)"
            title="Compartí"
            subtitle="Conocidos"
            icon={<Share2 size={14} />}
            onClick={() => { haptic.impact('light'); handleShare() }}
          />
>>>>>>> d20e1c74cddac36743d1cc3570848922a339ab9d
        </div>
      </div>

      {/* 3. QuickFilters */}
      <div style={{ paddingInline: 'var(--tgo-page-padding)', marginBottom: 'var(--tgo-space-4)' }}>
        <QuickFiltersModule
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </div>

      {/* 4. Ahora mismo — resumen de ciudad */}
      <Section
        title="Ahora mismo"
        verticalPadding="var(--tgo-space-4)"
      >
        <LiveCityMetrics
          openCount={nearbyTenants.filter((r: any) => r.isOpenNow === true).length}
          promoCount={promotions.length}
          newCount={nearbyTenants.filter((r: any) => r.isNew).length}
          avgPickup={(() => {
            const open = nearbyTenants.filter((r: any) => r.isOpenNow === true && r.estimatedPickupTime)
            return open.length > 0
              ? Math.round(open.reduce((sum: number, r: any) => sum + (r.estimatedPickupTime ?? 0), 0) / open.length)
              : null
          })()}
        />
      </Section>

      {/* 5. Explorar Categorías (lazy) */}
      {categories.length > 0 && (
        <Section
          title={microcopy.discovery.sections.categories}
          subtitle={microcopy.discovery.sections.categoriesSub}
          verticalPadding="var(--tgo-space-5)"
        >
          <CategoriesModule
            categories={categories}
            showAll={showAllCategories}
            onToggleShowAll={() => setShowAllCategories(!showAllCategories)}
            onSelect={(name) => onCategorySelect?.(name)}
          />
        </Section>
      )}

      {/* 6. Cerca de vos — Nearby */}
      <Section
        title={microcopy.discovery.sections.nearYou}
        subtitle={filteredNearby.length > 0 ? `${filteredNearby.length} lugares cerca` : microcopy.discovery.sections.nearYouSub}
        verticalPadding="var(--tgo-space-4)"
      >
        <NearbyModule
          restaurants={filteredNearby}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 7. Recién llegados a la red (lazy) */}
      <Section
        title={microcopy.discovery.sections.newInNetwork}
        subtitle={microcopy.discovery.sections.newInNetworkSub}
        verticalPadding="var(--tgo-space-4)"
      >
        <NewInNetworkModule
          restaurants={nearbyTenants}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 8. Para este momento (lazy) */}
      <Section
        title={microcopy.discovery.sections.timeBased}
        verticalPadding="var(--tgo-space-4)"
      >
        <TimeBasedModule
          restaurants={nearbyTenants}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 9. Hoy podés aprovechar (lazy) */}
      <Section
        title={microcopy.discovery.sections.experiences}
        subtitle={allExperiences.length > 0 ? 'Lo que tenés como miembro' : 'Próximamente'}
        href="/app/promociones"
        verticalPadding="var(--tgo-space-4)"
      >
        <ExperiencesModule experiences={allExperiences} />
      </Section>

      {/* B2B CTA */}
      {onOpenLeadModal && (
        <section
          className="py-6"
          style={{ paddingInline: 'var(--tgo-page-padding)' }}
        >
          <p
            style={{
              fontSize: '0.6875rem',
              lineHeight: 1.6,
              color: 'var(--tgo-text-muted)',
              maxWidth: 300,
              margin: '0 auto 16px',
              textAlign: 'center',
            }}
          >
            TGO conecta personas y comercios cercanos.
            Creemos en una ciudad donde todo lo importante
            sucede cerca de vos.
          </p>
          <div
            className="p-6 text-center"
            style={{
              borderRadius: 'var(--tgo-radius-xl)',
              backgroundColor: 'var(--tgo-surface-1)',
              border: '1px solid var(--tgo-border)',
            }}
          >
            <h3
              style={{
                color: 'var(--tgo-text-primary)',
                fontSize: 'var(--tgo-type-body)',
                fontWeight: 700,
              }}
            >
              ¿Tenés un restaurante?
            </h3>
            <p
              className="mt-1"
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 'var(--tgo-type-body-sm)',
                lineHeight: 1.5,
              }}
            >
              Sumate a la plataforma que potencia locales sin comisiones abusivas.
            </p>
            <button
              onClick={() => { haptic.impact('light'); onOpenLeadModal() }}
              className="mt-3"
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-state-trust)',
                color: 'var(--tgo-text-inverse)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tgo-tracking-wider)',
              }}
            >
              Registrar mi local
            </button>
          </div>
        </section>
      )}
      </div>
    </PullToRefresh>
  )
}
