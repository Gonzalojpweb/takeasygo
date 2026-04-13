'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import RestaurantCard, { FeaturedCard } from './RestaurantCard'
import ExploreHeader from './ExploreHeader'
import BottomNav from './BottomNav'
import InstallBanner from './InstallBanner'
import PushSubscriber from './PushSubscriber'
import { GpsLoading, FeedSkeleton, FetchOverlay } from './ExploreLoadingSkeleton'
import { MapPin } from 'lucide-react'
import { BlurFade } from '@/components/ui/blur-fade'
import SelfReportModal from '@/components/consumer/SelfReportModal'

const ExploreMap = dynamic(() => import('./ExploreMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--c-bg)]">
      <div className="w-6 h-6 rounded-full border-2 border-[#f14722]/30 border-t-[#f14722] animate-spin" />
    </div>
  ),
})

type View = 'list' | 'map'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

export default function ExploreClient() {
  return (
    <Suspense fallback={<GpsLoading />}>
      <ExploreClientInner />
    </Suspense>
  )
}

function ExploreClientInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [view, setView] = useState<View>('list')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(true)
  const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([])
  const [fetching, setFetching] = useState(false)
  const [radius, setRadius] = useState(5000)
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null)
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLeadModal, setShowLeadModal] = useState(false)

  // ── Sync View with URL ───────────────────────────────────────────
  useEffect(() => {
    const v = searchParams.get('view')
    if (v === 'map') setView('map')
    else setView('list')
  }, [searchParams])

  // ── GPS ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización')
      setCoords(BUENOS_AIRES)
      setGpsLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsLoading(false)
      },
      () => {
        setGpsError('Ubicación denegada — mostrando Buenos Aires')
        setCoords(BUENOS_AIRES)
        setRadius(10000)
        setGpsLoading(false)
      },
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
    )
  }, [])

  // ── Fetch restaurants ────────────────────────────────────────────────
  const fetchNearby = useCallback(async (lat: number, lng: number, r: number) => {
    setFetching(true)
    try {
      const res = await fetch(`/api/explore/nearby?lat=${lat}&lng=${lng}&radius=${r}`)
      if (!res.ok) throw new Error('Error al cargar restaurantes')
      const data = await res.json()
      setRestaurants(data.restaurants)
    } catch {
      setRestaurants([])
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    if (coords) fetchNearby(coords.lat, coords.lng, radius)
  }, [coords, radius, fetchNearby])

  // ── GPS Loading ──────────────────────────────────────────────────────
  if (gpsLoading) {
    return (
      <div className="h-full consumer-dark">
        <GpsLoading />
      </div>
    )
  }

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
    <div className="flex flex-col h-full consumer-dark">

      {/* ── Banners ────────────────────────────────────────────────── */}
      <InstallBanner />
      <PushSubscriber />

      {/* ── Header ─────────────────────────────────────────────────── */}
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
        onOpenLeadModal={() => setShowLeadModal(true)}
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* Fetch overlay */}
        {fetching && <FetchOverlay />}

        {/* === LIST VIEW === */}
        {view === 'list' && !fetching && (
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
                            onNavigate={() => router.push(`/explore/${r.id}?type=${r.type}`)}
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
                          onNavigate={() => router.push(`/explore/${r.id}?type=${r.type}`)}
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
        )}

        {/* === MAP VIEW === */}
        {view === 'map' && coords && (
          <div className="h-full w-full">
            <ExploreMap
              userLat={coords.lat}
              userLng={coords.lng}
              restaurants={restaurants}
              onSelect={r => router.push(`/explore/${r.id}?type=${r.type}`)}
            />
          </div>
        )}
      </div>

      {/* ── Bottom Nav ─────────────────────────────────────────────── */}
      <BottomNav activeView={view === 'map' ? 'map' : undefined} />

      {/* ── Register Modal ─────────────────────────────────────────── */}
      {showLeadModal && <SelfReportModal onClose={() => setShowLeadModal(false)} />}
    </div>
  )
}
