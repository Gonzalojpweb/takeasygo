'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import InstallBanner from '@/components/explore/InstallBanner'
import {
  Navigation, Loader2, Clock, MapPin, Home, Map, User,
  AlertCircle, ChevronRight,
} from 'lucide-react'
import PlanLeadModal from '@/components/landing/PlanLeadModal'

const ExploreMap = dynamic(() => import('@/components/explore/ExploreMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-100">
      <Loader2 size={24} className="animate-spin text-zinc-400" />
    </div>
  ),
})

const LOGO_URL =
  'https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

const CATEGORIES = [
  { emoji: '🍕', label: 'Pizza',     match: 'pizza' },
  { emoji: '🍣', label: 'Sushi',     match: 'sushi' },
  { emoji: '🍔', label: 'Burger',    match: 'burger' },
  { emoji: '🌮', label: 'Mexicano',  match: 'mexicano' },
  { emoji: '🥗', label: 'Saludable', match: 'saludable' },
  { emoji: '🍜', label: 'Pasta',     match: 'pasta' },
  { emoji: '🍗', label: 'Pollo',     match: 'pollo' },
  { emoji: '🥩', label: 'Carnes',    match: 'carne' },
]

type Tab = 'home' | 'map' | 'profile'

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

// ── Tarjeta compacta para la vista mobile/sidebar ────────────────────────────

function CompactCard({
  r,
  onNavigate,
}: {
  r: NearbyRestaurant
  onNavigate: () => void
}) {
  const isNetwork = r.type === 'network'
  return (
    <div
      onClick={onNavigate}
      className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all active:scale-[0.99] ${
        isNetwork
          ? 'bg-white border-zinc-100 hover:border-emerald-200 hover:shadow-sm hover:shadow-emerald-50'
          : 'bg-white border-zinc-100 opacity-60 hover:opacity-80'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-11 h-11 rounded-[14px] flex items-center justify-center text-xl shrink-0 ${
          isNetwork ? 'bg-emerald-50' : 'bg-zinc-100'
        }`}
      >
        {r.logoUrl ? (
          <img src={r.logoUrl} alt={r.name} className="w-full h-full rounded-[14px] object-cover" />
        ) : (
          <span>{isNetwork ? '🍽️' : '🏪'}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-zinc-900 text-sm leading-tight truncate">{r.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
              isNetwork ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {isNetwork ? '● Red' : '○ Directorio'}
          </span>
          {r.isOpenNow === true && (
            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              Abierto
            </span>
          )}
          {r.isOpenNow === false && (
            <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
              Cerrado
            </span>
          )}
        </div>
        {r.cuisineTypes?.length > 0 && (
          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{r.cuisineTypes.join(' · ')}</p>
        )}
      </div>

      {/* Derecha */}
      <div className="shrink-0 text-right">
        <p className={`text-xs font-bold ${isNetwork ? 'text-emerald-600' : 'text-zinc-400'}`}>
          {distLabel(r.distanceM)}
        </p>
        {isNetwork && r.estimatedPickupTime && (
          <p className="text-[10px] text-zinc-400 mt-0.5">~{r.estimatedPickupTime} min</p>
        )}
        {isNetwork && (
          <ChevronRight size={12} className="text-zinc-300 mt-1 ml-auto" />
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ConsumerClient() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('home')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(true)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([])
  const [fetching, setFetching] = useState(false)
  const [radius, setRadius] = useState(5000)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)

  // ── GPS ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Sin GPS — mostrando Buenos Aires')
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
        setGpsError('Ubicación aproximada')
        setCoords(BUENOS_AIRES)
        setRadius(10000)
        setGpsLoading(false)
      },
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
    )
  }, [])

  // ── Fetch cercanos ────────────────────────────────────────────────────────────
  const fetchNearby = useCallback(async (lat: number, lng: number, r: number) => {
    setFetching(true)
    try {
      const res = await fetch(`/api/explore/nearby?lat=${lat}&lng=${lng}&radius=${r}`)
      if (!res.ok) throw new Error()
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

  // ── Filtrado ──────────────────────────────────────────────────────────────────
  const filtered = restaurants.filter(r => {
    if (
      activeCategory &&
      !r.cuisineTypes.some(c => c.toLowerCase().includes(activeCategory))
    )
      return false
    if (openNowOnly && r.isOpenNow !== true) return false
    return true
  })

  const networkCount = filtered.filter(r => r.type === 'network').length
  const locationLabel = gpsError ? 'Ubicación aproximada' : 'Cerca de vos'

  const navigate = (r: NearbyRestaurant) =>
    router.push(`/explore/${r.id}?type=${r.type}`)

  // ── Loading GPS ───────────────────────────────────────────────────────────────
  if (gpsLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-white">
        <div className="w-16 h-16 rounded-2xl overflow-hidden">
          <Image src="/tgo192.png" alt="TakeasyGO" width={64} height={64} />
        </div>
        <Navigation size={22} className="animate-pulse text-emerald-500 mt-2" />
        <p className="text-sm font-medium text-zinc-500">Detectando tu ubicación...</p>
      </div>
    )
  }

  // ── Shared: filtros ───────────────────────────────────────────────────────────
  const FilterBar = () => (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {/* Abierto ahora */}
      <button
        onClick={() => setOpenNowOnly(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
          openNowOnly
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
        }`}
      >
        <Clock size={11} />
        Abierto ahora
      </button>

      {/* Categorías */}
      {CATEGORIES.map(cat => (
        <button
          key={cat.match}
          onClick={() => setActiveCategory(c => (c === cat.match ? null : cat.match))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
            activeCategory === cat.match
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
          }`}
        >
          <span>{cat.emoji}</span>
          {cat.label}
        </button>
      ))}
    </div>
  )

  // ── DESKTOP layout ────────────────────────────────────────────────────────────
  return (
    <>
      {/* ══ DESKTOP (md+) ══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col h-full bg-zinc-50">
        {/* Top bar */}
        <div className="bg-white border-b border-zinc-100 px-5 py-3 flex items-center gap-4 shrink-0">
          <Link href="/">
            <Image
              src={LOGO_URL}
              alt="TakeasyGO"
              width={160}
              height={32}
              style={{ height: 32, width: 'auto' }}
              unoptimized
              priority
            />
          </Link>

          {/* Location badge */}
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200">
            <MapPin size={11} />
            {locationLabel}
            {gpsError && <AlertCircle size={10} className="text-amber-500" />}
          </div>

          {/* Radio chips */}
          <div className="flex items-center gap-1.5 ml-auto">
            <p className="text-xs text-zinc-400 mr-1">Radio:</p>
            {[1000, 2000, 5000, 10000].map(r => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  radius === r
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                {r >= 1000 ? `${r / 1000}km` : `${r}m`}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowLeadModal(true)}
            className="text-xs text-zinc-400 hover:text-emerald-600 transition-colors shrink-0"
          >
            ¿Tenés un restaurante? →
          </button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[360px] shrink-0 flex flex-col border-r border-zinc-100 bg-white overflow-hidden">
            {/* Filtros */}
            <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
              <FilterBar />
            </div>

            {/* Resumen */}
            <div className="px-4 py-2 shrink-0">
              {fetching ? (
                <div className="flex items-center gap-2 text-zinc-400 text-xs py-1">
                  <Loader2 size={12} className="animate-spin" /> Cargando...
                </div>
              ) : (
                <p className="text-xs text-zinc-400">
                  {networkCount > 0 && (
                    <span className="text-emerald-600 font-semibold">{networkCount} en red</span>
                  )}
                  {networkCount > 0 && filtered.length - networkCount > 0 && ' · '}
                  {filtered.length - networkCount > 0 && (
                    <span>{filtered.length - networkCount} en directorio</span>
                  )}
                  {filtered.length === 0 && 'Sin resultados en este radio'}
                </p>
              )}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {!fetching &&
                filtered.map(r => (
                  <CompactCard key={r.id} r={r} onNavigate={() => navigate(r)} />
                ))}
              {!fetching && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-zinc-300">
                  <MapPin size={28} />
                  <p className="text-sm font-medium text-zinc-400">Sin resultados</p>
                  <p className="text-xs text-zinc-300">Probá aumentar el radio</p>
                </div>
              )}
            </div>

            {/* Footer B2B */}
            <div className="px-4 py-3 border-t border-zinc-100 shrink-0">
              <p className="text-[11px] text-zinc-400 text-center">
                ¿Tenés un restaurante?{' '}
                <button
                  onClick={() => setShowLeadModal(true)}
                  className="text-emerald-600 font-semibold hover:underline"
                >
                  Sumate a la red →
                </button>
              </p>
            </div>
          </div>

          {/* Mapa */}
          <div className="flex-1 relative">
            {coords && (
              <ExploreMap
                userLat={coords.lat}
                userLng={coords.lng}
                restaurants={filtered}
                onSelect={navigate}
              />
            )}
          </div>
        </div>
      </div>

      {/* ══ MOBILE (< md) ══════════════════════════════════════════════════════ */}
      <div className="flex flex-col h-full md:hidden bg-zinc-50">

        {/* Header compacto con gradiente */}
        <div className="bg-gradient-to-r from-[#064e3b] via-[#065f46] to-[#059669] px-4 pt-11 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <Image
              src={LOGO_URL}
              alt="TakeasyGO"
              width={140}
              height={28}
              style={{ height: 28, width: 'auto' }}
              unoptimized
              priority
            />
            <div className="flex items-center gap-1.5 bg-white/15 border border-white/25 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
              {fetching ? 'Buscando...' : `${networkCount} en red`}
            </div>
          </div>

          {gpsError && (
            <p className="text-amber-300 text-[10px] flex items-center gap-1 mb-2">
              <AlertCircle size={9} /> {gpsError}
            </p>
          )}

          {/* Filtros de radio */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <MapPin size={10} className="text-emerald-300 shrink-0" />
            {[1000, 2000, 5000, 10000].map(r => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 transition-colors ${
                  radius === r
                    ? 'bg-white text-emerald-700 border-white'
                    : 'bg-transparent text-white/70 border-white/30'
                }`}
              >
                {r >= 1000 ? `${r / 1000}km` : `${r}m`}
              </button>
            ))}
          </div>
        </div>

        {/* Install banner */}
        <InstallBanner />

        {/* Filtros de categorías */}
        <div className="bg-white border-b border-zinc-100 px-4 py-3 shrink-0">
          <FilterBar />
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-hidden relative">
          {fetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/80">
              <Loader2 size={24} className="animate-spin text-emerald-500" />
            </div>
          )}

          {/* Lista */}
          {tab === 'home' && !fetching && (
            <div className="h-full overflow-y-auto px-4 py-3 pb-24 space-y-2.5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-300">
                  <MapPin size={32} />
                  <p className="text-sm font-medium text-zinc-400">Sin resultados</p>
                  <p className="text-xs text-zinc-300">Probá aumentar el radio o limpiar filtros</p>
                </div>
              ) : (
                filtered.map(r => (
                  <CompactCard key={r.id} r={r} onNavigate={() => navigate(r)} />
                ))
              )}

              {/* Link B2B mobile */}
              <div className="text-center pt-4 pb-2">
                <button
                  onClick={() => setShowLeadModal(true)}
                  className="text-[11px] text-zinc-400"
                >
                  ¿Tenés un restaurante?{' '}
                  <span className="text-emerald-600 font-semibold">Sumate →</span>
                </button>
              </div>
            </div>
          )}

          {/* Mapa mobile */}
          {tab === 'map' && coords && (
            <div className="h-full w-full pb-16">
              <ExploreMap
                userLat={coords.lat}
                userLng={coords.lng}
                restaurants={filtered}
                onSelect={navigate}
              />
            </div>
          )}

          {/* Perfil — próximamente */}
          {tab === 'profile' && (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center">
                <User size={28} className="text-zinc-400" />
              </div>
              <div>
                <p className="font-bold text-zinc-800 mb-1">Próximamente</p>
                <p className="text-sm text-zinc-400">
                  Tu historial de pedidos, favoritos y configuración de cuenta estarán disponibles pronto.
                </p>
              </div>
              <Link
                href="/login"
                className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold"
              >
                Iniciar sesión
              </Link>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div className="absolute bottom-0 left-0 right-0 md:hidden bg-white border-t border-zinc-100 flex h-16 z-50">
          <button
            onClick={() => setTab('home')}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              tab === 'home' ? 'text-emerald-600' : 'text-zinc-400'
            }`}
          >
            <Home size={20} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Inicio</span>
          </button>
          <button
            onClick={() => setTab('map')}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              tab === 'map' ? 'text-emerald-600' : 'text-zinc-400'
            }`}
          >
            <Map size={20} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Mapa</span>
          </button>
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              tab === 'profile' ? 'text-emerald-600' : 'text-zinc-400'
            }`}
          >
            <User size={20} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Perfil</span>
          </button>
        </div>
      </div>

      {/* Modal de registro B2B */}
      {showLeadModal && (
        <PlanLeadModal
          plan="Registrá tu restaurante"
          planId="contact"
          onClose={() => setShowLeadModal(false)}
        />
      )}
    </>
  )
}
