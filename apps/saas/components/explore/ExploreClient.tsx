'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { RestaurantCard } from '@/components/tgo-business'
import { Section } from '@/components/tgo'
import { HorizontalScroller } from '@/components/tgo'
import { EmptyState } from '@/components/tgo'
import ExploreHeader from './ExploreHeader'
import BottomNav from './BottomNav'
import InstallBanner from './InstallBanner'
import PushSubscriber from './PushSubscriber'
import { GpsLoading, FetchOverlay } from './ExploreLoadingSkeleton'
import SelfReportModal from '@/components/consumer/SelfReportModal'
import { AnimatedLogoLoader } from '@/components/tgo'
import OnboardingFlow from '@/components/onboarding/OnboardingFlow'
import NetworkDiscoveryOnboarding from './NetworkDiscoveryOnboarding'
import { AnimatePresence, motion } from 'framer-motion'
import { useTenant } from '@/contexts/TenantContext'
import { Button } from '@/components/ui/button'
import { useHaptic } from '@/components/tgo/useHaptic'

const ExploreMap = dynamic(() => import('./ExploreMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
      <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--tgo-text-muted)', borderTopColor: 'transparent' }} />
    </div>
  ),
})

const HomeFullbleed = dynamic(() => import('./HomeFullbleed'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
      <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--tgo-text-muted)', borderTopColor: 'transparent' }} />
    </div>
  ),
})

import HomeView from './HomeView'
import OrdersView from './OrdersView'

type View = 'home' | 'list' | 'map' | 'orders'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

export default function ExploreClient() {
  return (
    <Suspense fallback={<GpsLoading />}>
      <ExploreClientInner />
    </Suspense>
  )
}

function getOrCreateSessionId(): string {
  const key = 'tgo_explore_session'
  let sid = sessionStorage.getItem(key)
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem(key, sid)
  }
  return sid
}

function trackExploreEvent(payload: Record<string, any>) {
  const sid = getOrCreateSessionId()
  fetch('/api/explore/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sid },
    body: JSON.stringify({ sessionId: sid, ...payload }),
  }).catch(() => {})
}

function ExploreClientInner() {
  const haptic = useHaptic()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setTenantSlug } = useTenant()
  const sidRef = useRef<string>('')

  const [view, setView] = useState<View>('home')
  const readExploreCache = () => {
    try {
      const raw = sessionStorage.getItem('tgo_explore_cache')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.restaurants) && parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          return parsed
        }
      }
    } catch {}
    return null
  }
  const exploreCache = readExploreCache()
  const [restaurants, setRestaurants] = useState<RestaurantCardData[]>(exploreCache?.restaurants ?? [])
  const [fetching, setFetching] = useState(false)
  const [radius, setRadius] = useState(exploreCache?.radius ?? 5000)
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null)
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [prevView, setPrevView] = useState<View>('home')

  const handleNavigate = useCallback((r: RestaurantCardData) => {
    setTenantSlug(r.id)
    router.push(`/app/${r.id}?type=${r.type}`)
  }, [setTenantSlug, router])

  // ── GPS con cache en sessionStorage ────────────────────────────────────
  const GPS_CACHE_KEY = 'tgo_gps_cache'
  const readGpsCache = (): { lat: number; lng: number } | null => {
    try {
      const raw = sessionStorage.getItem(GPS_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.lat != null && parsed.lng != null && parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          return { lat: parsed.lat, lng: parsed.lng }
        }
      }
    } catch {}
    return null
  }
  const writeGpsCache = (lat: number, lng: number) => {
    try {
      sessionStorage.setItem(GPS_CACHE_KEY, JSON.stringify({ lat, lng, timestamp: Date.now() }))
    } catch {}
  }

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(readGpsCache)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsResolved, setGpsResolved] = useState(!!readGpsCache())

  // ── Splash + Onboarding Logic (dynamic duration) ──────────────────────
  const SPLASH_CACHE_KEY = 'tgo_splash_shown'
  const ONBOARDING_CACHE_KEY = 'takeasy_onboarding_seen'
  const [showSplash, setShowSplash] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [splashReady, setSplashReady] = useState(false)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true) // Default true for SSR

  useEffect(() => {
    sidRef.current = getOrCreateSessionId()
  }, [])

  // ── Track invite QR scans (source=invitacion) ────────────────────────
  useEffect(() => {
    const source = searchParams.get('source')
    if (source === 'invitacion') {
      const tracked = sessionStorage.getItem('tgo_invite_tracked')
      if (!tracked) {
        trackExploreEvent({
          eventType: 'pageview',
          source: 'invitacion',
          view: 'home',
          metadata: { referrer: document.referrer || null, landingPath: window.location.pathname },
        })
        sessionStorage.setItem('tgo_invite_tracked', '1')
      }
    }
  }, [searchParams])

  // Check onboarding status client-side only (avoids hydration mismatch)
  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_CACHE_KEY) === 'true'
    setHasSeenOnboarding(seen)
  }, [])

  // Dynamic splash: wait for data + animation full cycle (~4.5s)
  useEffect(() => {
    // Animation is the app's hook — always play on first session visit
    const minDelay = new Promise((resolve) => setTimeout(resolve, 4500))
    const dataLoad = Promise.allSettled([
      fetch('/api/auth/session').then(() => {}).catch(() => {}),
      fetch('/api/explore/nearby?lat=-34.6037&lng=-58.3816&radius=2000').then(() => {}).catch(() => {}),
      new Promise<void>((resolve) => {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => resolve(),
            { timeout: 2000, maximumAge: 300000 }
          )
        } else {
          resolve()
        }
      }),
    ])

    Promise.all([minDelay, dataLoad]).then(() => {
      setShowSplash(false)
      sessionStorage.setItem(SPLASH_CACHE_KEY, 'true')
      setSplashReady(true)
    })
  }, [])

  // After splash ends + client hydrated, show onboarding if needed
  useEffect(() => {
    if (splashReady && !hasSeenOnboarding) {
      setShowOnboarding(true)
    }
  }, [splashReady, hasSeenOnboarding])

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem(ONBOARDING_CACHE_KEY, 'true')
    setShowOnboarding(false)
  }, [])

  // ── Network Discovery Onboarding ──────────────────────────────────────
  const [showNetworkOnboarding, setShowNetworkOnboarding] = useState(false)
  const [networkData, setNetworkData] = useState<{
    tenantName: string
    tenantLogoUrl?: string | null
    totalOrders: number
    hasClub: boolean
    nearbyCount: number | null
    nearbyWithin15min: number | null
    case: 'A' | 'B' | 'C'
  } | null>(null)

  useEffect(() => {
    if (splashReady && hasSeenOnboarding && !showNetworkOnboarding) {
      fetch('/api/user/onboarding/network-discovery')
        .then(r => r.json())
        .then(data => {
          if (data.show) {
            setNetworkData(data)
            setShowNetworkOnboarding(true)
          }
        })
        .catch(() => {})
    }
  }, [splashReady, hasSeenOnboarding])

  const handleNetworkDismiss = useCallback(async () => {
    setShowNetworkOnboarding(false)
    fetch('/api/user/onboarding/network-discovery', { method: 'POST' }).catch(() => {})
  }, [])

  const handleNetworkExplore = useCallback(() => {
    handleNetworkDismiss()
    // Request GPS if not available, then navigate to home with location
    if (!coords && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGpsResolved(true)
        },
        () => {},
        { timeout: 5000 }
      )
    }
  }, [coords, handleNetworkDismiss, setCoords, setGpsResolved])

  // ── Sync View with URL + track view changes ──────────────────────
  useEffect(() => {
    const v = searchParams.get('view')
    const newView: View = v === 'map' ? 'map' : v === 'list' ? 'list' : v === 'orders' ? 'orders' : 'home'
    setView(newView)
  }, [searchParams])

  useEffect(() => {
    if (sidRef.current && view !== prevView) {
      trackExploreEvent({ eventType: 'view_change', view })
      setPrevView(view)
    }
  }, [view])

  // ── Sync cuisine from URL ─────────────────────────────────────────────
  useEffect(() => {
    const cuisine = searchParams.get('cuisine')
    if (cuisine) {
      setActiveCuisine(cuisine)
    } else if (view !== 'list') {
      // Clear cuisine when leaving list view
      setActiveCuisine(null)
    }
  }, [searchParams, view])

  // ── GPS (non-blocking, background) ────────────────────────────────────
  useEffect(() => {
    if (gpsResolved) return
    setGpsLoading(true)
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización')
      setCoords(BUENOS_AIRES)
      setGpsLoading(false)
      setGpsResolved(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        setGpsLoading(false)
        setGpsResolved(true)
        writeGpsCache(c.lat, c.lng)
      },
      () => {
        setGpsError('Ubicación denegada — mostrando Buenos Aires')
        setCoords(BUENOS_AIRES)
        setRadius(10000)
        setGpsLoading(false)
        setGpsResolved(true)
      },
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
    )
  }, [gpsResolved])

  // ── Fetch restaurants ────────────────────────────────────────────────
  const fetchNearby = useCallback(async (lat: number, lng: number, r: number) => {
    setFetching(true)
    try {
      const res = await fetch(`/api/explore/nearby?lat=${lat}&lng=${lng}&radius=${r}`, {
        headers: { 'x-session-id': sidRef.current },
      })
      if (!res.ok) throw new Error('Error al cargar restaurantes')
      const data = await res.json()
      setRestaurants(data.restaurants)
      try {
        sessionStorage.setItem('tgo_explore_cache', JSON.stringify({ restaurants: data.restaurants, radius: r, timestamp: Date.now() }))
      } catch {}
    } catch {
      setRestaurants([])
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    if (coords) fetchNearby(coords.lat, coords.lng, radius)
  }, [coords, radius, fetchNearby])

  // ── Filtering (memoized) ───────────────────────────────────────────────
  const allCuisines = useMemo(() =>
    Array.from(new Set(restaurants.flatMap(r => r.cuisineTypes))).sort(),
    [restaurants]
  )

  const filtered = useMemo(() => restaurants.filter(r => {
    if (activeCuisine && !r.cuisineTypes.includes(activeCuisine)) return false
    if (openNowOnly && r.isOpenNow !== true) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchName = r.name.toLowerCase().includes(q)
      const matchCuisine = r.cuisineTypes.some(c => c.toLowerCase().includes(q))
      if (!matchName && !matchCuisine) return false
    }
    return true
  }), [restaurants, activeCuisine, openNowOnly, searchQuery])

  const networkCount = useMemo(() => filtered.filter(r => r.type === 'network').length, [filtered])
  const listedCount = useMemo(() => filtered.filter(r => r.type === 'listed').length, [filtered])
  const activeFilters = (activeCuisine ? 1 : 0) + (openNowOnly ? 1 : 0) + (searchQuery ? 1 : 0)

  // Separate network (featured) vs listed
  const featuredRestaurants = useMemo(() => filtered.filter(r => r.type === 'network').slice(0, 7), [filtered])
  const listRestaurants = filtered

  // ── Infinite scroll ───────────────────────────────────────────────────
  const ITEMS_PER_PAGE = 10
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const visibleListRestaurants = useMemo(() => listRestaurants.slice(0, visibleCount), [listRestaurants, visibleCount])
  const hasMore = visibleCount < listRestaurants.length

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + ITEMS_PER_PAGE)
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasMore, listRestaurants.length])

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [activeCuisine, openNowOnly, searchQuery])

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      <AnimatePresence mode="wait">
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatedLogoLoader />
          </motion.div>
        )}
        {showOnboarding && <OnboardingFlow key="onboarding" onComplete={handleOnboardingComplete} />}
      </AnimatePresence>

      {/* Network Discovery Onboarding — shown after onboarding v1 */}
      {networkData && (
        <NetworkDiscoveryOnboarding
          show={showNetworkOnboarding}
          tenantName={networkData.tenantName}
          tenantLogoUrl={networkData.tenantLogoUrl}
          totalOrders={networkData.totalOrders}
          hasClub={networkData.hasClub}
          nearbyCount={networkData.nearbyCount}
          nearbyWithin15min={networkData.nearbyWithin15min}
          caseType={networkData.case}
          onExplore={handleNetworkExplore}
          onDismiss={handleNetworkDismiss}
        />
      )}

      <div className={`flex flex-col h-full transition-opacity duration-1000 ${showSplash || showOnboarding ? 'opacity-0' : 'opacity-100'}`}>
        {/* ── Banners ────────────────────────────────────────────────── */}
        <InstallBanner />
        <PushSubscriber />
        {gpsLoading && !gpsResolved && view !== 'orders' && (
          <div
            className="flex items-center justify-center gap-2 py-1.5"
            style={{
              backgroundColor: 'var(--tgo-state-proximity-soft)',
              borderBottom: '1px solid var(--tgo-border)',
            }}
          >
            <div
              className="animate-ping"
              style={{
                width: 8,
                height: 8,
                borderRadius: 'var(--tgo-radius-pill)',
                backgroundColor: 'var(--tgo-state-proximity)',
              }}
            />
            <span
              style={{
                color: 'var(--tgo-state-proximity)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tgo-tracking-widest)',
              }}
            >
              Localizando...
            </span>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">

          {/* Fetch overlay */}
          {fetching && <FetchOverlay />}

          {/* === HOME VIEW === */}
          {view === 'home' && (
            coords ? (
              <HomeFullbleed
                userLat={coords.lat}
                userLng={coords.lng}
                restaurants={restaurants}
                onSelect={handleNavigate}
                openCount={networkCount}
                promoCount={listedCount}
                newCount={restaurants.filter(r => r.isNew).length}
                avgPickup={(() => {
                  const open = restaurants.filter(r => r.isOpenNow && r.estimatedPickupTime)
                  return open.length > 0
                    ? Math.round(open.reduce((sum, r) => sum + (r.estimatedPickupTime ?? 0), 0) / open.length)
                    : null
                })()}
                onNavigateToMap={() => router.push('/app?view=map')}
              />
            ) : (
              <div
                className="flex flex-col items-center justify-center h-full gap-3"
                style={{ backgroundColor: 'var(--tgo-surface-1)' }}
              >
                <div
                  className="animate-spin"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--tgo-radius-pill)',
                    border: '2px solid var(--tgo-border)',
                    borderTopColor: 'var(--tgo-text-muted)',
                  }}
                />
                <p
                  style={{
                    color: 'var(--tgo-text-muted)',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  Localizando posición en el mapa...
                </p>
              </div>
            )
          )}

          {/* === LIST VIEW === */}
          {view === 'list' && (
            <>
              <ExploreHeader
                gpsError={gpsError}
                radius={radius}
                setRadius={setRadius}
                activeCuisine={activeCuisine}
                setActiveCuisine={setActiveCuisine}
                openNowOnly={openNowOnly}
                setOpenNowOnly={setOpenNowOnly}
                allCuisines={allCuisines}
                networkCount={networkCount}
                listedCount={listedCount}
                activeFilters={activeFilters}
                filteredCount={filtered.length}
                onClearFilters={() => { setActiveCuisine(null); setOpenNowOnly(false); setSearchQuery('') }}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
              <div className="h-full overflow-y-auto pb-24" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<span style={{ fontSize: 28 }}>📍</span>}
                  title={activeFilters > 0 ? 'Sin resultados' : 'Sin restaurantes en este radio'}
                  subtitle={
                    activeFilters > 0
                      ? 'Probá cambiando los filtros o ampliando el radio de búsqueda'
                      : 'Probá ampliar el radio de búsqueda para encontrar opciones cerca'
                  }
                  action={
                    activeFilters > 0
                      ? {
                          label: 'Limpiar filtros',
                          onClick: () => {
                            haptic.selection()
                            setActiveCuisine(null)
                            setOpenNowOnly(false)
                            setSearchQuery('')
                          },
                        }
                      : undefined
                  }
                  variant="search"
                />
              ) : (
                <div className="space-y-6 pt-2">

                  {/* ── Featured (network restaurants) horizontal scroll ── */}
                  {featuredRestaurants.length > 0 && (
                    <Section
                      title="Recomendados para vos"
                      subtitle="Opciones que tienen sentido ahora mismo"
                    >
                      <HorizontalScroller>
                        {featuredRestaurants.map((r, i) => (
                          <RestaurantCard
                            key={r.id}
                            restaurant={r}
                            layout="hero"
                            index={i}
                            onNavigate={() => handleNavigate(r)}
                          />
                        ))}
                      </HorizontalScroller>
                    </Section>
                  )}

                  {/* ── All restaurants (compact list) ── */}
                  <Section
                    title={
                      featuredRestaurants.length > 0
                        ? 'Todas las opciones'
                        : 'Opciones cercanas'
                    }
                    subtitle={`${listRestaurants.length} locales encontrados`}
                  >
                    <div
                      className="flex flex-col gap-3"
                      style={{ paddingInline: 'var(--tgo-page-padding)' }}
                    >
                      {visibleListRestaurants.map((r) => (
                        <RestaurantCard
                          key={r.id}
                          restaurant={r}
                          layout="list"
                          onNavigate={() => handleNavigate(r)}
                        />
                      ))}
                    </div>

                    {/* Infinite scroll trigger */}
                    {hasMore && (
                      <div
                        ref={loadMoreRef}
                        className="flex items-center justify-center py-4"
                      >
                        <div
                          className="animate-spin"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 'var(--tgo-radius-pill)',
                            border: '2px solid var(--tgo-border)',
                            borderTopColor: 'var(--tgo-text-muted)',
                          }}
                        />
                      </div>
                    )}
                  </Section>

                  {/* Footer B2B CTA */}
                  <section style={{ paddingInline: 'var(--tgo-page-padding)', paddingBottom: 48, paddingTop: 16 }}>
                    <div
                      className="text-center"
                      style={{
                        padding: 'var(--tgo-space-6)',
                        borderRadius: 'var(--tgo-radius-xl)',
                        backgroundColor: 'var(--tgo-surface-1)',
                        border: '1px solid var(--tgo-border)',
                      }}
                    >
                      <p
                        style={{
                          color: 'var(--tgo-text-primary)',
                          fontSize: 'var(--tgo-type-body-sm)',
                          fontWeight: 600,
                        }}
                      >
                        ¿Tu restaurante no está en el mapa?
                      </p>
                      <p
                        className="mt-1"
                        style={{
                          color: 'var(--tgo-text-muted)',
                          fontSize: 'var(--tgo-type-caption)',
                          lineHeight: 1.5,
                        }}
                      >
                        Sumanos a TGO y empezá a recibir pedidos sin comisiones
                        ridículas.
                      </p>
                      <button
                        onClick={() => { haptic.selection(); setShowLeadModal(true) }}
                        className="mt-3"
                        style={{
                          color: 'var(--tgo-text-link)',
                          fontSize: 'var(--tgo-type-caption)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 'var(--tgo-tracking-widest)',
                        }}
                      >
                        Registrar mi restaurante →
                      </button>
                    </div>
                  </section>

                  <div className="h-8" />
                </div>
              )}
            </div>
            </>
          )}

          {/* === ORDERS VIEW === */}
          {view === 'orders' && (
            <div className="h-full" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
              <OrdersView />
            </div>
          )}

          {/* === MAP VIEW === */}
          {view === 'map' && (
            <div className="h-full w-full">
              {coords ? (
                <ExploreMap
                  userLat={coords.lat}
                  userLng={coords.lng}
                  restaurants={restaurants}
                  onSelect={handleNavigate}
                  metrics={{
                    openCount: networkCount,
                    promoCount: listedCount,
                    newCount: 0,
                  }}
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center h-full gap-3"
                  style={{ backgroundColor: 'var(--tgo-surface-1)' }}
                >
                  <div
                    className="animate-spin"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--tgo-radius-pill)',
                      border: '2px solid var(--tgo-border)',
                      borderTopColor: 'var(--tgo-text-muted)',
                    }}
                  />
                  <p
                    style={{
                      color: 'var(--tgo-text-muted)',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    Localizando posición en el mapa...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom Nav ─────────────────────────────────────────────── */}
        <BottomNav />

        {/* ── Register Modal ─────────────────────────────────────────── */}
        {showLeadModal && (
          <SelfReportModal onClose={() => {
            setShowLeadModal(false)
            trackExploreEvent({ eventType: 'click_lead' })
          }} />
        )}
      </div>
    </div>
  )
}
