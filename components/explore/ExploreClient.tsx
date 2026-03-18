'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import RestaurantCard from './RestaurantCard'
import InstallBanner from './InstallBanner'
import PushSubscriber from './PushSubscriber'
import { MapPin, List, Map, Loader2, AlertCircle, Navigation, Clock, X } from 'lucide-react'

// Leaflet no puede correr en SSR
const ExploreMap = dynamic(() => import('./ExploreMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-100">
      <Loader2 size={24} className="animate-spin text-zinc-400" />
    </div>
  ),
})

type View = 'list' | 'map'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

export default function ExploreClient() {
  const router = useRouter()
  const [view, setView] = useState<View>('list')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(true)
  const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([])
  const [fetching, setFetching] = useState(false)
  const [radius, setRadius] = useState(5000)
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null)
  const [openNowOnly, setOpenNowOnly] = useState(false)

  // ── GPS ──────────────────────────────────────────────────────────────────────
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
        setGpsError('Permiso de ubicación denegado — mostrando Buenos Aires')
        setCoords(BUENOS_AIRES)
        setRadius(10000) // radio más amplio cuando no hay GPS real
        setGpsLoading(false)
      },
      {
        timeout: 10000,
        maximumAge: 0,          // siempre pedir posición fresca, nunca usar caché
        enableHighAccuracy: true, // usar GPS del hardware, no solo IP/WiFi
      }
    )
  }, [])

  // ── Fetch restaurantes cercanos ───────────────────────────────────────────────
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

  // ── Loading GPS ───────────────────────────────────────────────────────────────
  if (gpsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
        <Navigation size={32} className="animate-pulse text-emerald-500" />
        <p className="text-sm font-medium">Detectando tu ubicación...</p>
      </div>
    )
  }

  // Cuisines disponibles (todas las únicas del resultado actual)
  const allCuisines = Array.from(
    new Set(restaurants.flatMap(r => r.cuisineTypes))
  ).sort()

  // Resultado filtrado según filtros activos
  const filtered = restaurants.filter(r => {
    if (activeCuisine && !r.cuisineTypes.includes(activeCuisine)) return false
    if (openNowOnly && r.isOpenNow !== true) return false
    return true
  })

  const networkCount = filtered.filter(r => r.type === 'network').length
  const listedCount  = filtered.filter(r => r.type === 'listed').length
  const activeFilters = (activeCuisine ? 1 : 0) + (openNowOnly ? 1 : 0)

  return (
    <div className="flex flex-col h-full bg-zinc-50">

      {/* ── Banners ──────────────────────────────────────────────────────────── */}
      <InstallBanner />
      <PushSubscriber />

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-zinc-200 px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-zinc-900 font-bold text-lg leading-tight">Takeaway cerca de vos</h1>
            {gpsError && (
              <p className="text-amber-600 text-xs flex items-center gap-1 mt-0.5">
                <AlertCircle size={11} /> {gpsError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}>
              <List size={13} /> Lista
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === 'map' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}>
              <Map size={13} /> Mapa
            </button>
          </div>
        </div>

        {/* Radio selector */}
        <div className="flex items-center gap-2">
          <MapPin size={12} className="text-zinc-400 shrink-0" />
          <p className="text-zinc-400 text-xs shrink-0">Radio:</p>
          <div className="flex gap-1">
            {[1000, 2000, 5000, 10000].map(r => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  radius === r
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
                }`}>
                {r >= 1000 ? `${r / 1000}km` : `${r}m`}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        {!fetching && (allCuisines.length > 0 || restaurants.some(r => r.isOpenNow !== null)) && (
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
            {/* Toggle abierto ahora */}
            {restaurants.some(r => r.isOpenNow !== null) && (
              <button
                onClick={() => setOpenNowOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                  openNowOnly
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}>
                <Clock size={11} />
                Abierto ahora
              </button>
            )}

            {/* Chips de cocina */}
            {allCuisines.map(cuisine => (
              <button
                key={cuisine}
                onClick={() => setActiveCuisine(c => c === cuisine ? null : cuisine)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border shrink-0 capitalize transition-colors ${
                  activeCuisine === cuisine
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}>
                {cuisine}
              </button>
            ))}

            {/* Limpiar filtros */}
            {activeFilters > 0 && (
              <button
                onClick={() => { setActiveCuisine(null); setOpenNowOnly(false) }}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-zinc-400 border border-zinc-200 shrink-0 hover:text-zinc-600 transition-colors">
                <X size={11} /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* Resumen */}
        {!fetching && restaurants.length > 0 && (
          <p className="text-zinc-400 text-xs mt-2">
            {networkCount > 0 && <span className="text-emerald-600 font-medium">{networkCount} en red</span>}
            {networkCount > 0 && listedCount > 0 && <span className="mx-1">·</span>}
            {listedCount > 0 && <span>{listedCount} en directorio</span>}
            {activeFilters > 0 && <span className="ml-1 text-zinc-400">· {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>}
          </p>
        )}
      </div>

      {/* ── Contenido principal ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* Loading fetch */}
        {fetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/80">
            <Loader2 size={28} className="animate-spin text-emerald-500" />
          </div>
        )}

        {/* Vista LISTA */}
        {view === 'list' && !fetching && (
          <div className="h-full overflow-y-auto px-4 py-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400 py-20">
                <MapPin size={36} className="text-zinc-300" />
                {activeFilters > 0 ? (
                  <>
                    <p className="text-sm font-medium text-zinc-500">Sin resultados con estos filtros</p>
                    <button
                      onClick={() => { setActiveCuisine(null); setOpenNowOnly(false) }}
                      className="text-xs text-emerald-600 font-semibold underline underline-offset-2">
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-zinc-500">Sin restaurantes en este radio</p>
                    <p className="text-xs text-zinc-400">Probá aumentar el radio de búsqueda</p>
                  </>
                )}
              </div>
            ) : (
              filtered.map(r => (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  onNavigate={() => router.push(`/explore/${r.id}?type=${r.type}`)}
                />
              ))
            )}
          </div>
        )}

        {/* Vista MAPA */}
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
    </div>
  )
}
