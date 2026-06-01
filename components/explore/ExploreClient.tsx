'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import RestaurantCard, { FeaturedCard } from './RestaurantCard'
import ExploreHeader from './ExploreHeader'
import BottomNav from './BottomNav'
import InstallBanner from './InstallBanner'
import PushSubscriber from './PushSubscriber'
import { GpsLoading, FetchOverlay } from './ExploreLoadingSkeleton'
import { MapPin } from 'lucide-react'
import { BlurFade } from '@/components/ui/blur-fade'
import SelfReportModal from '@/components/consumer/SelfReportModal'
import LoadingScreen from './LoadingScreen'
import OnboardingCarousel from './OnboardingCarousel'
import { AnimatePresence } from 'framer-motion'
import { useTenant } from '@/contexts/TenantContext'
import { Button } from '@/components/ui/button'

const ExploreMap = dynamic(() => import('./ExploreMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--c-bg)]">
      <div className="w-6 h-6 rounded-full border-2 border-[#f14722]/30 border-t-[#f14722] animate-spin" />
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
  const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>(exploreCache?.restaurants ?? [])
  const [fetching, setFetching] = useState(false)
  const [radius, setRadius] = useState(exploreCache?.radius ?? 5000)
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null)
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [prevView, setPrevView] = useState<View>('home')

  const handleCategorySelect = useCallback((name: string) => {
    setActiveCuisine(name)
    setView('list')
  }, [setActiveCuisine, setView])

  const handleMapSelect = useCallback((r: NearbyRestaurant) => {
    setTenantSlug(r.id)
    router.push(`/explore/${r.id}?type=${r.type}`)
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

  // ── Splash cache: solo mostrar una vez por sesión ───────────────────────
  const SPLASH_CACHE_KEY = 'tgo_splash_shown'
  const [showSplash, setShowSplash] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    sidRef.current = getOrCreateSessionId()
  }, [])

  // Ocultar splash al hidratar si ya se vio en esta sesión
  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_CACHE_KEY)) {
      setShowSplash(false)
    }
  }, [])

  // ── Session/Onboarding Logic ────────────────────────────────────
  useEffect(() => {
    if (!showSplash) return
    const timer = setTimeout(() => {
      setShowSplash(false)
      sessionStorage.setItem(SPLASH_CACHE_KEY, 'true')
      
      // After splash, check if we need to show onboarding
      const hasSeenOnboarding = localStorage.getItem('takeasy_onboarding_seen')
      if (!hasSeenOnboarding) {
        setShowOnboarding(true)
      }
    }, 2500)
    
    return () => clearTimeout(timer)
  }, [showSplash])

  const handleOnboardingComplete = () => {
    localStorage.setItem('takeasy_onboarding_seen', 'true')
    setShowOnboarding(false)
  }

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

  // ── Filtering ─────────────────────────────────────────────────────────
  const allCuisines = Array.from(
    new Set(restaurants.flatMap(r => r.cuisineTypes))
  ).sort()

  const filtered = restaurants.filter(r => {
    if (activeCuisine && !r.cuisineTypes.includes(activeCuisine)) return false
    if (openNowOnly && r.isOpenNow !== true) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchName = r.name.toLowerCase().includes(q)
      const matchCuisine = r.cuisineTypes.some(c => c.toLowerCase().includes(q))
      if (!matchName && !matchCuisine) return false
    }
    return true
  })

  const networkCount = filtered.filter(r => r.type === 'network').length
  const listedCount = filtered.filter(r => r.type === 'listed').length
  const activeFilters = (activeCuisine ? 1 : 0) + (openNowOnly ? 1 : 0) + (searchQuery ? 1 : 0)

  // Separate network (featured) vs listed
  const featuredRestaurants = filtered.filter(r => r.type === 'network').slice(0, 7)
  const listRestaurants = filtered

  return (
    <div className="flex flex-col h-full bg-[#fafafa] overflow-hidden">
      <AnimatePresence mode="wait">
        {showSplash && <LoadingScreen key="splash" />}
        {showOnboarding && <OnboardingCarousel key="onboarding" onComplete={handleOnboardingComplete} />}
      </AnimatePresence>

      <div className={`flex flex-col h-full transition-opacity duration-1000 ${showSplash || showOnboarding ? 'opacity-0' : 'opacity-100'}`}>
        {/* ── Banners ────────────────────────────────────────────────── */}
        <InstallBanner />
        <PushSubscriber />
        {gpsLoading && !gpsResolved && view !== 'orders' && (
          <div className="flex items-center justify-center gap-2 py-1.5 bg-primary/5 border-b border-primary/10">
            <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Localizando...</span>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">

          {/* Fetch overlay */}
          {fetching && <FetchOverlay />}

          {/* === HOME VIEW === */}
          {view === 'home' && (
            <HomeView
              onOpenLeadModal={() => {
                trackExploreEvent({ eventType: 'click_lead' })
                setShowLeadModal(true)
              }}
              onCategorySelect={handleCategorySelect}
            />
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
                onOpenLeadModal={() => {
                  trackExploreEvent({ eventType: 'click_lead' })
                  setShowLeadModal(true)
                }}
              />
              <div className="h-full overflow-y-auto pb-24">
              {filtered.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full gap-4 px-6 py-20">
                  <div className="w-20 h-20 rounded-full bg-[var(--c-surface)] flex items-center justify-center">
                    <MapPin size={32} className="text-[#5a524d]" />
                  </div>
                  {activeFilters > 0 ? (
                    <>
                      <p className="text-[#f7f4f2] text-sm font-semibold">Sin resultados</p>
                      <p className="text-[#5a524d] text-xs text-center max-w-[240px]">
                        Probá cambiando los filtros o ampliando el radio de búsqueda
                      </p>
                      <button
                        onClick={() => { setActiveCuisine(null); setOpenNowOnly(false); setSearchQuery('') }}
                        className="text-xs text-[#f14722] font-semibold underline underline-offset-2 cursor-pointer"
                      >
                        Limpiar filtros
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[#f7f4f2] text-sm font-semibold">Sin restaurantes en este radio</p>
                      <p className="text-[#5a524d] text-xs text-center max-w-[240px]">
                        Probá ampliar el radio de búsqueda para encontrar opciones cerca
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-6 pt-2">

                  {/* ── Featured (network restaurants) horizontal scroll ── */}
                  {featuredRestaurants.length > 0 && (
                    <section>
                      <div className="px-4 mb-2">
                        <h2 className="text-[#f7f4f2] text-sm font-bold">
                          Recomendados para vos
                        </h2>
                        <p className="text-[#5a524d] text-[10px]">
                          Opciones que tienen sentido ahora mismo
                        </p>
                      </div>
                      <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar snap-scroll-x pb-2">
                        {featuredRestaurants.map((r, i) => (
                          <BlurFade key={r.id} delay={i * 0.08} inView>
                            <FeaturedCard
                              restaurant={r}
                              index={i}
                              onNavigate={() => {
                                setTenantSlug(r.id)
                                router.push(`/explore/${r.id}?type=${r.type}`)
                              }}
                            />
                          </BlurFade>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── All restaurants (compact list) ── */}
                  <section className="px-4">
                    <div className="mb-3">
                      <h2 className="text-[#f7f4f2] text-sm font-bold">
                        {featuredRestaurants.length > 0 ? 'Todas las opciones' : 'Opciones cercanas'}
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {listRestaurants.map((r, i) => (
                        <BlurFade key={r.id} delay={Math.min(i * 0.05, 0.4)} inView>
                          <RestaurantCard
                            restaurant={r}
                            onNavigate={() => {
                              setTenantSlug(r.id)
                              router.push(`/explore/${r.id}?type=${r.type}`)
                            }}
                          />
                        </BlurFade>
                      ))}
                    </div>
                  </section>

                  {/* Footer B2B CTA */}
                  <section className="px-4 pb-12 pt-4">
                    <div className="glass-card rounded-2xl p-6 text-center space-y-3">
                      <p className="text-[#f7f4f2] text-sm font-bold">¿Tu restaurante no está en el mapa?</p>
                      <p className="text-[#5a524d] text-[11px] leading-relaxed">
                        Sumanos a TakeasyGO y empezá a recibir pedidos sin comisiones ridículas.
                      </p>
                      <button
                        onClick={() => setShowLeadModal(true)}
                        className="text-[#10b981] text-[11px] font-bold uppercase tracking-widest hover:text-[#10b981]/80 transition-colors cursor-pointer"
                      >
                        Registrar mi restaurante →
                      </button>
                    </div>
                  </section>

                  {/* Bottom padding for nav */}
                  <div className="h-8" />
                </div>
              )}
            </div>
            </>
          )}

          {/* === ORDERS VIEW === */}
          {view === 'orders' && (
            <div className="h-full bg-white">
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
                  onSelect={handleMapSelect}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 bg-[#fafafa]">
                  <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <p className="text-slate-400 text-[10px] font-bold">Localizando posición en el mapa...</p>
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
