'use client'

// ── CityHome ────────────────────────────────────────────────────────────────
//
// La Home de TGO: la ciudad viva. Un solo mapa para «Inicio» y «Mapa»
// (cambia la posición del panel, no el mapa), con:
//   · la voz de la ciudad arriba (titular + novedades reales de este minuto);
//   · capas para leer la ciudad (abiertos, a 15 min, promos, club, …);
//   · el pulso de la ciudad y la lista de lugares en el panel;
//   · la ficha rápida al tocar un pin.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Armchair,
  Banknote,
  Bike,
  DoorOpen,
  Footprints,
  Gift,
  LocateFixed,
  Moon,
  Search,
  Sun,
  Tag,
  type LucideIcon,
} from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  CITY_LAYERS,
  MOMENT_GREETING,
  cityFeed,
  cityHeadline,
  cityPulse,
  dayMoment,
  isAwake,
  matchesLayer,
  type CityLayer,
} from '@/lib/city/signals'
import type { CityTheme } from '@/lib/city/map-style'
import { useHaptic } from '@/components/tgo/useHaptic'
import AnimatedNumber from '@/components/tgo/AnimatedNumber'
import CityMap, { type CityMapHandle } from './CityMap'
import CitySheet, { type CitySheetHandle } from './CitySheet'
import CityCard from './CityCard'
import PlacePreview from './PlacePreview'
import './city.css'

interface Props {
  /** Capa encendida al abrir (viene de Inicio: /app?view=map&layer=promo). */
  initialLayer?: CityLayer | null
  center: { lat: number; lng: number }
  places: RestaurantCardData[]
  /** Abre la ficha completa del lugar. */
  onOpen: (place: RestaurantCardData) => void
}

const LAYER_ICON: Record<CityLayer, LucideIcon> = {
  open: DoorOpen,
  walk15: Footprints,
  promo: Tag,
  club: Gift,
  delivery: Bike,
  salon: Armchair,
  cash: Banknote,
}

const LAYER_EMPTY: Record<CityLayer, string> = {
  open: 'No hay lugares abiertos cerca en este momento.',
  walk15: 'Todavía no hay lugares de la red a 15 minutos a pie.',
  promo: 'Hoy no hay promos activas cerca.',
  club: 'No hay clubes cerca por ahora.',
  delivery: 'Ningún lugar cercano hace delivery ahora.',
  salon: 'Ningún salón está informando lugar en este momento.',
  cash: 'Ningún lugar cercano informa pago en efectivo.',
}

const THEME_KEY = 'tgo_city_theme'

function autoTheme(): CityTheme {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 19 * 60 + 30 || minutes < 6 * 60 + 30 ? 'night' : 'day'
}

export default function CityHome({ initialLayer = null, center, places, onOpen }: Props) {
  const router = useRouter()
  const haptic = useHaptic()
  const { data: session } = useSession()
  const mapRef = useRef<CityMapHandle>(null)
  const sheetRef = useRef<CitySheetHandle>(null)

  // Tema: automático según la hora; si el usuario lo cambia, vale por la sesión.
  // (Este componente solo se monta en el navegador: ver el dynamic de ExploreClient.)
  const [theme, setTheme] = useState<CityTheme>(() => {
    try {
      const stored = sessionStorage.getItem(THEME_KEY)
      if (stored === 'day' || stored === 'night') return stored
    } catch {}
    return autoTheme()
  })
  const [tilted, setTilted] = useState(true)
  const [layer, setLayer] = useState<CityLayer | null>(initialLayer)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetInset, setSheetInset] = useState(0)
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // La barra inferior vive fuera de la Home: se entera del tema por <html>.
  useEffect(() => {
    document.documentElement.dataset.cityTheme = theme
    return () => {
      delete document.documentElement.dataset.cityTheme
    }
  }, [theme])

  const toggleTheme = () => {
    haptic.selection()
    setTheme(prev => {
      const next: CityTheme = prev === 'day' ? 'night' : 'day'
      try {
        sessionStorage.setItem(THEME_KEY, next)
      } catch {}
      return next
    })
  }

  // ── La ciudad en números y en palabras ──────────────────────────────────
  const pulse = useMemo(() => cityPulse(places), [places])
  const feed = useMemo(() => cityFeed(places), [places])
  const headline = useMemo(() => cityHeadline(pulse, hour), [pulse, hour])

  const layerCounts = useMemo(() => {
    const counts = {} as Record<CityLayer, number>
    for (const { id } of CITY_LAYERS) counts[id] = places.filter(p => matchesLayer(p, id)).length
    return counts
  }, [places])

  const visible = useMemo(
    () => (layer ? places.filter(p => matchesLayer(p, layer)) : places),
    [places, layer]
  )

  const listed = useMemo(() => {
    const rank = (p: RestaurantCardData) =>
      (p.type === 'network' ? (isAwake(p) ? 0 : 2) : p.isOpenNow === true ? 1 : 3)
    return [...visible].sort(
      (a, b) => rank(a) - rank(b) || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)
    )
  }, [visible])

  // Si el lugar elegido sale de la capa activa (o de los datos), la ficha se cierra sola.
  const selected = useMemo(
    () => (selectedId ? visible.find(p => p.id === selectedId) ?? null : null),
    [visible, selectedId]
  )

  // ── Voz de la ciudad: titular + novedades, rotando ──────────────────────
  const voice = useMemo(
    () => [{ id: 'headline', text: headline, placeId: null as string | null }, ...feed],
    [headline, feed]
  )
  const [voiceIndex, setVoiceIndex] = useState(0)
  useEffect(() => {
    if (voice.length < 2) return
    const timer = setInterval(() => setVoiceIndex(i => (i + 1) % voice.length), 5200)
    return () => clearInterval(timer)
  }, [voice.length])
  const voiceItem = voice[voiceIndex % voice.length]

  // ── Acciones ─────────────────────────────────────────────────────────────
  const select = useCallback(
    (place: RestaurantCardData | null) => {
      if (!place) {
        setSelectedId(null)
        return
      }
      haptic.impact('light')
      setSelectedId(place.id)
      mapRef.current?.focus(place)
    },
    [haptic]
  )

  // Al encender una capa, el mapa encuadra esos lugares (pueden estar lejos
  // de la vista actual). Al apagarla, vuelve a vos.
  const toggleLayer = (id: CityLayer) => {
    haptic.selection()
    setSelectedId(null)
    const next = layer === id ? null : id
    setLayer(next)
    if (next) mapRef.current?.fitTo(places.filter(p => matchesLayer(p, next)))
    else mapRef.current?.recenter()
  }

  // Abierto desde Inicio con una capa: mismo encuadre, una sola vez.
  useEffect(() => {
    if (initialLayer) mapRef.current?.fitTo(places.filter(p => matchesLayer(p, initialLayer)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [])

  const onVoiceTap = () => {
    if (voiceItem.placeId) {
      const place = places.find(p => p.id === voiceItem.placeId)
      if (place) return select(place)
    }
    haptic.selection()
    sheetRef.current?.snapTo('half')
  }

  const firstName = session?.user?.name?.trim().split(/\s+/)[0]
  const greeting = MOMENT_GREETING[dayMoment(hour)]
  const bottomInset = selected ? 360 : sheetInset

  const stats: Array<{ layer: CityLayer; value: number; label: string }> = [
    { layer: 'open', value: pulse.open, label: 'abiertos ahora' },
    { layer: 'walk15', value: layerCounts.walk15, label: 'a 15 min a pie' },
    { layer: 'promo', value: pulse.promos, label: 'con promo hoy' },
    pulse.salonFree > 0 || pulse.clubs === 0
      ? { layer: 'salon', value: pulse.salonFree, label: 'con lugar en salón' }
      : { layer: 'club', value: pulse.clubs, label: 'con club' },
  ]

  const activeLayer = layer ? CITY_LAYERS.find(l => l.id === layer) : null

  return (
    <div
      className="city-root"
      data-theme={theme}
      style={{ ['--city-attrib-bottom' as string]: `${selected ? 0 : sheetInset}px` }}
    >
      <CityMap
        ref={mapRef}
        center={center}
        places={visible}
        selectedId={selected?.id ?? null}
        onSelect={select}
        theme={theme}
        tilted={tilted}
        bottomInset={bottomInset}
        topInset={132}
      />

      {/* ── Voz de la ciudad + capas ─────────────────────────────────────── */}
      <header className="city-top">
        <div className="city-bar">
          <button type="button" className="city-voice city-glass" onClick={onVoiceTap}>
            <span className="city-voice__dot" data-asleep={pulse.open === 0} aria-hidden="true" />
            <span className="city-voice__text">
              <span className="city-voice__eyebrow">
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </span>
              <span className="city-voice__line" aria-live="polite">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={voiceItem.id}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  >
                    {voiceItem.text}
                  </motion.span>
                </AnimatePresence>
              </span>
            </span>
          </button>
          <button
            type="button"
            className="city-icon-btn city-glass"
            onClick={() => { haptic.selection(); router.push('/app?view=list') }}
            aria-label="Buscar lugares"
          >
            <Search size={20} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="city-icon-btn city-glass city-avatar"
            onClick={() => router.push('/app/profile')}
            aria-label="Tu perfil"
          >
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" referrerPolicy="no-referrer" />
            ) : (
              (firstName?.charAt(0) ?? 'T').toUpperCase()
            )}
          </button>
        </div>

        <div className="city-layers" role="group" aria-label="Capas del mapa">
          {CITY_LAYERS.filter(l => layerCounts[l.id] > 0 || layer === l.id).map(l => {
            const Icon = LAYER_ICON[l.id]
            return (
              <button
                key={l.id}
                type="button"
                className="city-layer city-glass"
                aria-pressed={layer === l.id}
                onClick={() => toggleLayer(l.id)}
              >
                <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
                {l.label}
                <span className="city-layer__count">{layerCounts[l.id]}</span>
              </button>
            )
          })}
        </div>
      </header>

      {/* ── Controles del mapa ───────────────────────────────────────────── */}
      {!selected && (
        <div className="city-controls city-glass" style={{ bottom: Math.max(sheetInset, 96) + 16 }}>
          <button type="button" onClick={toggleTheme} aria-label={theme === 'day' ? 'Ver la ciudad de noche' : 'Ver la ciudad de día'}>
            {theme === 'day' ? <Moon size={18} strokeWidth={2} /> : <Sun size={18} strokeWidth={2} />}
          </button>
          <button
            type="button"
            aria-pressed={tilted}
            aria-label={tilted ? 'Ver el mapa plano' : 'Ver el mapa en 3D'}
            onClick={() => { haptic.selection(); setTilted(t => !t) }}
          >
            3D
          </button>
          <button
            type="button"
            aria-label="Volver a mi ubicación"
            onClick={() => { haptic.selection(); mapRef.current?.recenter() }}
          >
            <LocateFixed size={18} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── Panel: pulso de la ciudad + lugares ──────────────────────────── */}
      <CitySheet
        ref={sheetRef}
        initial={initialLayer ? 'half' : 'peek'}
        hidden={!!selected}
        onVisibleHeight={setSheetInset}
        header={
          <div className="city-pulse">
            <div className="city-pulse__title">
              <h2>La ciudad ahora</h2>
              <span>Tu ciudad de 15 minutos</span>
            </div>
            <div className="city-stats">
              {stats.map(stat => {
                const Icon = LAYER_ICON[stat.layer]
                return (
                  <button
                    key={stat.layer}
                    type="button"
                    className="city-stat"
                    aria-pressed={layer === stat.layer}
                    onClick={() => toggleLayer(stat.layer)}
                  >
                    <span className="city-stat__icon"><Icon size={16} strokeWidth={2} aria-hidden="true" /></span>
                    <AnimatedNumber value={stat.value} numberStyle={{ fontSize: 20, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }} />
                    <span className="city-stat__label">{stat.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        }
      >
        <div className="city-section">
          <h3>{activeLayer ? activeLayer.label : 'Está pasando cerca tuyo'}</h3>
          <p>
            {listed.length === 0
              ? 'Nada para mostrar en esta capa'
              : listed.length === 1
                ? '1 lugar, ordenado por cercanía'
                : `${listed.length} lugares, primero los que están despiertos`}
          </p>
        </div>
        {listed.length === 0 ? (
          <div className="city-empty">
            {layer ? LAYER_EMPTY[layer] : 'Todavía no hay lugares de la red en esta zona.'}
            {layer && (
              <div>
                <button type="button" onClick={() => setLayer(null)}>Ver toda la ciudad</button>
              </div>
            )}
          </div>
        ) : (
          listed.map(place => <CityCard key={place.id} place={place} onSelect={select} />)
        )}
      </CitySheet>

      {/* ── Ficha rápida ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <PlacePreview
            key={selected.id}
            place={selected}
            onOpen={onOpen}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
