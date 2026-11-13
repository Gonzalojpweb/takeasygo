'use client'

// ── CityFeed (Inicio) ───────────────────────────────────────────────────────
//
// Inicio cuenta la ciudad; Mapa la deja explorar. Esta pantalla es el relato:
//   1. la voz de la ciudad (saludo + qué está pasando ahora);
//   2. una ventana viva al mapa: se mira, y al tocarla se abre Mapa;
//   3. el pulso (cada número abre el mapa con esa capa encendida);
//   4. secciones que responden una pregunta cada una:
//      ¿qué está pasando cerca? ¿qué puedo aprovechar? ¿qué hay nuevo?
//      ¿qué me queda a pie? ¿dónde sumo?

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, ChevronRight, DoorOpen, Footprints, Gift, Search, Tag, Armchair, type LucideIcon } from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  MOMENT_GREETING,
  cityFeed,
  cityHeadline,
  cityOpportunity,
  cityPulse,
  cityStatus,
  dayMoment,
  hasClub,
  hasPromo,
  isAwake,
  isWithin15,
  proximityLabel,
  type CityLayer,
} from '@/lib/city/signals'
import type { CityTheme } from '@/lib/city/map-style'
import { useHaptic } from '@/components/tgo/useHaptic'
import AnimatedNumber from '@/components/tgo/AnimatedNumber'
import CityMap from './CityMap'
import CityCard from './CityCard'
import { OpportunityPill, PlaceAvatar, StatusLine } from './Signals'
import './city.css'

interface Props {
  center: { lat: number; lng: number }
  places: RestaurantCardData[]
  onOpen: (place: RestaurantCardData) => void
}

const THEME_KEY = 'tgo_city_theme'

function currentTheme(): CityTheme {
  try {
    const stored = sessionStorage.getItem(THEME_KEY)
    if (stored === 'day' || stored === 'night') return stored
  } catch {}
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 19 * 60 + 30 || minutes < 6 * 60 + 30 ? 'night' : 'day'
}

const byDistance = (a: RestaurantCardData, b: RestaurantCardData) =>
  (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)

/** Card vertical para los carruseles de Inicio. */
function CityTile({ place, onOpen }: { place: RestaurantCardData; onOpen: (p: RestaurantCardData) => void }) {
  const status = cityStatus(place)
  const opportunity = cityOpportunity(place)
  const near = proximityLabel(place.distanceM)
  const tint = place.primaryColor || '#98A2B3'
  return (
    <button type="button" className="city-tile" onClick={() => onOpen(place)}>
      <span className="city-tile__band" style={{ ['--tint' as string]: tint }}>
        <PlaceAvatar place={place} size="lg" />
        {near && <span className="city-tile__near">{near}</span>}
      </span>
      <span className="city-tile__body">
        <span className="city-tile__name">{place.name}</span>
        <StatusLine status={status} />
        {opportunity && (
          <span className="city-tile__opp">
            <OpportunityPill opportunity={opportunity} />
          </span>
        )}
      </span>
    </button>
  )
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <section className="city-feed__section">
      <header className="city-feed__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && (
          <button type="button" onClick={action.onClick}>
            {action.label}
            <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </header>
      {children}
    </section>
  )
}

export default function CityFeed({ center, places, onOpen }: Props) {
  const router = useRouter()
  const haptic = useHaptic()
  const { data: session } = useSession()
  const [theme] = useState<CityTheme>(currentTheme)
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // La barra inferior acompaña el tema de la ciudad.
  useEffect(() => {
    document.documentElement.dataset.cityTheme = theme
    return () => {
      delete document.documentElement.dataset.cityTheme
    }
  }, [theme])

  const pulse = useMemo(() => cityPulse(places), [places])
  const feed = useMemo(() => cityFeed(places), [places])
  const headline = useMemo(() => cityHeadline(pulse, hour), [pulse, hour])

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

  // ── Secciones ──────────────────────────────────────────────────────────
  const network = useMemo(() => places.filter(p => p.type === 'network'), [places])
  const happening = useMemo(() => network.filter(isAwake).sort(byDistance).slice(0, 10), [network])
  const promos = useMemo(() => network.filter(p => isAwake(p) && hasPromo(p)).sort(byDistance), [network])
  const fresh = useMemo(() => network.filter(p => p.isNew).sort(byDistance), [network])
  const walkable = useMemo(
    () =>
      places
        .filter(p => isWithin15(p.distanceM))
        .sort((a, b) => Number(isAwake(b)) - Number(isAwake(a)) || byDistance(a, b))
        .slice(0, 6),
    [places]
  )
  // Mismo criterio que la capa «A 15 min» del mapa, así el número coincide.
  const walkCount = useMemo(() => places.filter(p => isWithin15(p.distanceM)).length, [places])
  const clubs = useMemo(() => network.filter(hasClub).sort(byDistance).slice(0, 10), [network])

  const openMap = (layer?: CityLayer) => {
    haptic.selection()
    router.push(layer ? `/app?view=map&layer=${layer}` : '/app?view=map')
  }

  const onVoiceTap = () => {
    const place = voiceItem.placeId ? places.find(p => p.id === voiceItem.placeId) : null
    if (place) {
      haptic.impact('light')
      onOpen(place)
    } else {
      openMap()
    }
  }

  const firstName = session?.user?.name?.trim().split(/\s+/)[0]
  const greeting = MOMENT_GREETING[dayMoment(hour)]

  const stats: Array<{ layer: CityLayer; value: number; label: string; icon: LucideIcon }> = [
    { layer: 'open', value: pulse.open, label: 'abiertos ahora', icon: DoorOpen },
    { layer: 'walk15', value: walkCount, label: 'a 15 min a pie', icon: Footprints },
    { layer: 'promo', value: pulse.promos, label: 'con promo hoy', icon: Tag },
    pulse.salonFree > 0
      ? { layer: 'salon', value: pulse.salonFree, label: 'con lugar en salón', icon: Armchair }
      : { layer: 'club', value: pulse.clubs, label: 'con club', icon: Gift },
  ]

  return (
    <div className="city-root city-feed" data-theme={theme}>
      <div className="city-feed__scroll">
        {/* ── La voz de la ciudad ───────────────────────────────────────── */}
        <header className="city-feed__top">
          <div className="city-feed__hello">
            <p>{firstName ? `${greeting}, ${firstName}` : greeting}</p>
            <h1>Tu ciudad, ahora</h1>
          </div>
          <button
            type="button"
            className="city-icon-btn city-feed__btn"
            onClick={() => { haptic.selection(); router.push('/app?view=list') }}
            aria-label="Buscar lugares"
          >
            <Search size={20} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="city-icon-btn city-feed__btn city-avatar"
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
        </header>

        {/* ── Ventana a la ciudad ───────────────────────────────────────── */}
        <div className="city-window">
          <div className="city-window__map" aria-hidden="true">
            <CityMap
              center={center}
              places={places}
              selectedId={null}
              onSelect={() => {}}
              theme={theme}
              tilted
              bottomInset={64}
              topInset={0}
              interactive={false}
            />
          </div>
          <button type="button" className="city-window__tap" onClick={() => openMap()} aria-label="Abrir el mapa de la ciudad" />
          <button type="button" className="city-window__voice" onClick={onVoiceTap}>
            <span className="city-voice__dot" data-asleep={pulse.open === 0} aria-hidden="true" />
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
          </button>
          <span className="city-window__open" aria-hidden="true">
            Abrir mapa
            <ArrowUpRight size={14} strokeWidth={2.4} />
          </span>
        </div>

        {/* ── Pulso ─────────────────────────────────────────────────────── */}
        <div className="city-stats city-feed__stats">
          {stats.map(stat => (
            <button key={stat.layer} type="button" className="city-stat" onClick={() => openMap(stat.layer)}>
              <span className="city-stat__icon"><stat.icon size={16} strokeWidth={2} aria-hidden="true" /></span>
              <AnimatedNumber value={stat.value} numberStyle={{ fontSize: 20, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }} />
              <span className="city-stat__label">{stat.label}</span>
            </button>
          ))}
        </div>

        {/* ── Secciones ─────────────────────────────────────────────────── */}
        {happening.length > 0 ? (
          <Section
            title="Está pasando cerca tuyo"
            subtitle="Abiertos y tomando pedidos, los más cercanos primero"
            action={{ label: 'Mapa', onClick: () => openMap('open') }}
          >
            <div className="city-rail">
              {happening.map(p => <CityTile key={p.id} place={p} onOpen={onOpen} />)}
            </div>
          </Section>
        ) : (
          <div className="city-empty">
            La ciudad descansa por ahora. Mirá el mapa para ver a qué hora abren tus lugares.
            <div><button type="button" onClick={() => openMap()}>Ver el mapa</button></div>
          </div>
        )}

        {promos.length > 0 && (
          <Section
            title="Hoy podés aprovechar"
            subtitle="Promos activas en este momento"
            action={promos.length > 3 ? { label: 'Ver todas', onClick: () => openMap('promo') } : undefined}
          >
            <div className="city-rail">
              {promos.map(p => <CityTile key={p.id} place={p} onOpen={onOpen} />)}
            </div>
          </Section>
        )}

        {walkable.length > 0 && (
          <Section
            title="A 15 minutos a pie"
            subtitle="Tu ciudad de cercanía"
            action={{ label: 'Mapa', onClick: () => openMap('walk15') }}
          >
            <div className="city-scope city-list">
              {walkable.map(p => <CityCard key={p.id} place={p} onSelect={onOpen} />)}
            </div>
          </Section>
        )}

        {fresh.length > 0 && (
          <Section title="Recién llegaron al barrio" subtitle="La ciudad suma lugares">
            <div className="city-rail">
              {fresh.map(p => <CityTile key={p.id} place={p} onOpen={onOpen} />)}
            </div>
          </Section>
        )}

        {clubs.length > 0 && (
          <Section
            title="Donde sumás"
            subtitle="Lugares con club de beneficios"
            action={{ label: 'Mapa', onClick: () => openMap('club') }}
          >
            <div className="city-rail">
              {clubs.map(p => <CityTile key={p.id} place={p} onOpen={onOpen} />)}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
