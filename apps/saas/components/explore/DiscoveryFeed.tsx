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
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTenant } from '@/contexts/TenantContext'
import { useLocation } from './LocationContext'
import { Share2, Users, Sparkles, Tag, Coffee, Utensils, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { captureHomeShared } from '@/lib/tia/events'

// TGO Primitives
import { Section } from '@/components/tgo'
import { HorizontalScroller } from '@/components/tgo'
import { EmptyState } from '@/components/tgo'

// TGO Business
import { RestaurantCard } from '@/components/tgo-business'
import { ExperienceCard } from '@/components/tgo-business'
import { CategoryCard } from '@/components/tgo-business'

// Components
import HomeHeader from './HomeHeader'

// Types
import type { RestaurantCardData } from '@/types/restaurant-card'
import { Clock, Bike, MapPin } from 'lucide-react'

// ── QuickFilters ─────────────────────────────────────────────────────────────

const QUICK_FILTERS = [
  { label: 'Abiertos', icon: Clock, query: 'abiertos' },
  { label: 'Delivery', icon: Bike, query: 'delivery' },
  { label: 'Cercanos', icon: MapPin, query: 'cercanos' },
  { label: 'Beneficios', icon: Tag, query: 'beneficios' },
]

function QuickFiltersModule({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string | null
  onFilterChange: (q: string | null) => void
}) {
  return (
    <div
      className="flex gap-2 justify-center"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {QUICK_FILTERS.map((f) => {
        const Icon = f.icon
        const isActive = activeFilter === f.query
        return (
          <button
            key={f.query}
            onClick={() => onFilterChange(isActive ? null : f.query)}
            className="flex items-center gap-1.5 active:scale-[0.96]"
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 'var(--tgo-radius-pill)',
              fontSize: 'var(--tgo-type-body-sm)',
              fontWeight: isActive ? 600 : 400,
              backgroundColor: isActive
                ? 'var(--tgo-state-interactive-soft)'
                : 'var(--tgo-surface-2)',
              color: isActive
                ? 'var(--tgo-state-interactive)'
                : 'var(--tgo-text-secondary)',
              border: `1px solid ${isActive ? 'var(--tgo-state-interactive)' : 'var(--tgo-border)'}`,
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

// ── Nearby ───────────────────────────────────────────────────────────────────

function NearbyModule({
  restaurants,
  onNavigate,
}: {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}) {
  if (restaurants.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 24 }}>📍</span>}
        title="No encontramos nada cerca"
        subtitle="¿Querés ampliar la zona de búsqueda?"
        action={{ label: 'Ampliar zona', onClick: () => {} }}
        variant="search"
      />
    )
  }

  return (
    <div
      className="flex flex-col gap-3"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {restaurants.slice(0, 6).map((r) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          layout="list"
          onNavigate={() => onNavigate(r)}
        />
      ))}
    </div>
  )
}

// ── Experiences ──────────────────────────────────────────────────────────────

function mapPromotionType(type: string): 'promo' | 'club' | 'cashback' | 'qr' | 'event' {
  switch (type) {
    case 'loyalty': return 'club'
    case 'sale': return 'promo'
    case 'info': return 'promo'
    case 'announcement': return 'event'
    default: return 'promo'
  }
}

function toExperience(raw: any) {
  const isRedemption = raw.pointsCost != null
  return {
    _id: raw._id?.toString?.() ?? raw._id ?? String(Math.random()),
    title: raw.title || raw.name || '',
    description: raw.description || raw.shortDescription || '',
    imageUrl: raw.imageUrl || '',
    price: raw.price ?? undefined,
    originalPrice: raw.originalPrice ?? undefined,
    tenantId: raw.tenantId?.toString?.() ?? raw.tenantId ?? '',
    tenantSlug: raw.tenantSlug || '',
    tenantLogo: raw.tenantLogo || '',
    tenantName: raw.tenantName || '',
    type: isRedemption ? 'cashback' as const : mapPromotionType(raw.type || 'sale'),
  }
}

function ExperiencesModule({
  experiences,
}: {
  experiences: any[]
}) {
  const mapped = experiences.map(toExperience).filter((e) => e.tenantSlug && e.title)

  if (mapped.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 24 }}>🎁</span>}
        title="Unite a un club"
        subtitle="Desbloqueá beneficios exclusivos en tus lugares favoritos"
        action={{ label: 'Explorar clubes', onClick: () => {} }}
        variant="search"
      />
    )
  }

  return (
    <HorizontalScroller>
      {mapped.slice(0, 5).map((e) => (
        <ExperienceCard key={e._id} experience={e} />
      ))}
    </HorizontalScroller>
  )
}

// ── Categories ───────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string }
> = {
  Pizza: { icon: '🍕', color: '#E03A0E', bg: 'rgba(224, 58, 14, 0.08)' },
  Sushi: { icon: '🍣', color: '#D94A3D', bg: 'rgba(217, 74, 61, 0.08)' },
  Hamburguesa: { icon: '🍔', color: '#F4B42D', bg: 'rgba(244, 180, 45, 0.08)' },
  Ensalada: { icon: '🥗', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
  Thai: { icon: '🍜', color: '#F74211', bg: 'rgba(247, 66, 17, 0.08)' },
  Mexicana: { icon: '🌮', color: '#E03A0E', bg: 'rgba(224, 58, 14, 0.08)' },
  Italiana: { icon: '🍝', color: '#D94A3D', bg: 'rgba(217, 74, 61, 0.08)' },
  Café: { icon: '☕', color: '#065D63', bg: 'rgba(6, 93, 99, 0.08)' },
  Parrilla: { icon: '🥩', color: '#C2410C', bg: 'rgba(194, 65, 12, 0.08)' },
  Japonesa: { icon: '🍱', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)' },
  China: { icon: '🥡', color: '#B91C1C', bg: 'rgba(185, 28, 28, 0.08)' },
  India: { icon: '🍛', color: '#D97706', bg: 'rgba(217, 119, 6, 0.08)' },
  Arabe: { icon: '🧆', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
  Peruana: { icon: '🥘', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)' },
  Vegana: { icon: '🌱', color: '#15803D', bg: 'rgba(21, 128, 61, 0.08)' },
  Postres: { icon: '🍰', color: '#DB2777', bg: 'rgba(219, 39, 119, 0.08)' },
  Cervecería: { icon: '🍺', color: '#CA8A04', bg: 'rgba(202, 138, 4, 0.08)' },
  Bagels: { icon: '🥯', color: '#A16207', bg: 'rgba(161, 98, 7, 0.08)' },
  Empanadas: { icon: '🥟', color: '#C2410C', bg: 'rgba(194, 65, 12, 0.08)' },
  Milanesas: { icon: '🍳', color: '#B45309', bg: 'rgba(180, 83, 9, 0.08)' },
  Mariscos: { icon: '🦐', color: '#0891B2', bg: 'rgba(8, 145, 178, 0.08)' },
  Heladería: { icon: '🍦', color: '#E11D48', bg: 'rgba(225, 29, 72, 0.08)' },
  Pollo: { icon: '🍗', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)' },
  Sandwich: { icon: '🥪', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
  Rostisería: { icon: '🍗', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)' },
  Pastelería: { icon: '🥐', color: '#DB2777', bg: 'rgba(219, 39, 119, 0.08)' },
  Saludable: { icon: '🥗', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
  Cafetería: { icon: '☕', color: '#065D63', bg: 'rgba(6, 93, 99, 0.08)' },
  Helados: { icon: '🍦', color: '#E11D48', bg: 'rgba(225, 29, 72, 0.08)' },
  'Comida Casera': { icon: '🍲', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
}

function getCategoryConfig(name: string) {
  const key = Object.keys(CATEGORY_CONFIG).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  )
  return key
    ? CATEGORY_CONFIG[key]
    : { icon: '🍽', color: 'var(--tgo-text-secondary)', bg: 'var(--tgo-surface-2)' }
}

function CategoriesModule({
  categories,
  showAll,
  onToggleShowAll,
  onSelect,
}: {
  categories: string[]
  showAll: boolean
  onToggleShowAll: () => void
  onSelect: (name: string) => void
}) {
  const visible = showAll ? categories.slice(0, 12) : categories.slice(0, 8)
  const hasMore = categories.length > 8

  return (
    <div>
      <div
        className="grid grid-cols-4 gap-4"
        style={{ paddingInline: 'var(--tgo-page-padding)' }}
      >
        {visible.map((cat) => {
          const config = getCategoryConfig(cat)
          return (
            <CategoryCard
              key={cat}
              name={cat}
              icon={config.icon}
              color={config.color}
              bg={config.bg}
              onClick={() => onSelect(cat)}
            />
          )
        })}
      </div>
      {hasMore && (
        <button
          onClick={onToggleShowAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            margin: '16px var(--tgo-page-padding) 0',
            padding: '10px',
            borderRadius: 'var(--tgo-radius-lg)',
            border: '1px dashed var(--tgo-border)',
            background: 'transparent',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--tgo-state-interactive)',
            cursor: 'pointer',
            width: 'calc(100% - 40px)',
          }}
        >
          {showAll ? 'Ver menos' : 'Ver más categorías'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: showAll ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── CityNow ("Ahora mismo") ──────────────────────────────────────────────────

function CityNowModule({
  nearbyTenants,
  promotions,
}: {
  nearbyTenants: RestaurantCardData[]
  promotions: any[]
}) {
  const openCount = nearbyTenants.filter((r) => r.isOpenNow === true).length
  const promoCount = promotions.length
  const newCount = nearbyTenants.filter((r) => r.isNew).length
  const openTenants = nearbyTenants.filter((r) => r.isOpenNow === true && r.estimatedPickupTime)
  const avgPickup = openTenants.length > 0
    ? Math.round(openTenants.reduce((sum, r) => sum + (r.estimatedPickupTime ?? 0), 0) / openTenants.length)
    : null

  const metrics = [
    { label: 'abiertos', value: openCount, icon: Users },
    { label: 'promos', value: promoCount, icon: Tag },
    { label: 'nuevos', value: newCount, icon: Sparkles },
    ...(avgPickup !== null ? [{ label: 'espera promedio', value: avgPickup, suffix: 'min', icon: Coffee }] : []),
  ]

  return (
    <div
      className="flex gap-3 overflow-x-auto no-scrollbar"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <div
            key={m.label}
            className="flex items-center gap-2 shrink-0"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-surface-1)',
              border: '1px solid var(--tgo-border)',
            }}
          >
            <Icon size={14} style={{ color: 'var(--tgo-state-interactive)' }} />
            <div>
              <p
                style={{
                  color: 'var(--tgo-text-primary)',
                  fontSize: 'var(--tgo-type-body-sm)',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {m.value}{m.suffix ? ` ${m.suffix}` : ''}
              </p>
              <p
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 10,
                  lineHeight: 1,
                  marginTop: 2,
                }}
              >
                {m.label}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── NewInNetwork ("Recién llegaron a la red") ─────────────────────────────────

function NewInNetworkModule({
  restaurants,
  onNavigate,
}: {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}) {
  const newRestaurants = restaurants.filter((r) => r.isNew)
  if (newRestaurants.length === 0) return null

  return (
    <HorizontalScroller gap="12px">
      {newRestaurants.slice(0, 6).map((r, i) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          layout="compact"
          onNavigate={() => onNavigate(r)}
          index={i}
        />
      ))}
    </HorizontalScroller>
  )
}

// ── TimeBased ("Para este momento") ───────────────────────────────────────────

function getTimeOfDay(): { label: string; icon: typeof Sun; categories: string[] } {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 11) {
    return { label: 'Desayuno — Ideal para arrancar el día', icon: Sun, categories: ['Café', 'Bagels', 'Pastelería', 'Panadería'] }
  }
  if (hour >= 11 && hour < 15) {
    return { label: 'Almuerzo — Opciones rápidas cerca', icon: Utensils, categories: ['Pizza', 'Empanadas', 'Ensalada', ' Sandwich', 'Mexicana'] }
  }
  if (hour >= 15 && hour < 19) {
    return { label: 'Merienda — Cafés y dulces para vos', icon: Coffee, categories: ['Café', 'Heladería', 'Postres', 'Pastelería'] }
  }
  return { label: 'Noche — Para esta noche', icon: Moon, categories: ['Parrilla', 'Italiana', 'Japonesa', 'Cervecería'] }
}

function TimeBasedModule({
  restaurants,
  onNavigate,
}: {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}) {
  const timeInfo = getTimeOfDay()
  const Icon = timeInfo.icon
  const matching = restaurants.filter((r) =>
    r.cuisineTypes.some((c) => timeInfo.categories.some((tc) => c.toLowerCase().includes(tc.toLowerCase())))
  )

  if (matching.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3" style={{ paddingInline: 'var(--tgo-page-padding)' }}>
        <Icon size={14} style={{ color: 'var(--tgo-state-interactive)' }} />
        <span
          style={{
            color: 'var(--tgo-text-secondary)',
            fontSize: 'var(--tgo-type-caption)',
            fontWeight: 500,
          }}
        >
          {timeInfo.label}
        </span>
      </div>
      <HorizontalScroller gap="12px">
        {matching.slice(0, 6).map((r, i) => (
          <RestaurantCard
            key={r.id}
            restaurant={r}
            layout="compact"
            onNavigate={() => onNavigate(r)}
            index={i}
          />
        ))}
      </HorizontalScroller>
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

  const handleNavigate = (r: RestaurantCardData) => {
    setTenantSlug(r.id)
    router.push(`/app/${r.id}?type=${r.type}`)
  }

  const nearbyTenants: RestaurantCardData[] = data?.nearbyTenants ?? []
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
        return nearbyTenants.filter((r) => r.isOpenNow === true || r.isOpenNow === null)
      case 'delivery':
        return nearbyTenants.filter((r) =>
          r.type === 'listed' || (r.orderModes && r.orderModes.includes('delivery'))
        )
      case 'cercanos':
        return [...nearbyTenants].sort((a, b) => a.distanceM - b.distanceM)
      case 'beneficios':
        return nearbyTenants.filter((r) =>
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
    <div
      className="h-full overflow-y-auto no-scrollbar pb-32"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* 1. Personalized Header */}
      <HomeHeader
        userName={userName || session?.user?.name?.split(' ')[0] || ''}
        userAvatar={session?.user?.image}
      />

      {/* 2. Brand Block */}
      <div
        style={{
          padding: '4px var(--tgo-page-padding) 16px',
          textAlign: 'center',
        }}
      >
        <a
          href="https://instagram.com/tgo.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--tgo-text-muted)',
            textDecoration: 'none',
            marginBottom: 10,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          Seguinos en @tgo.app
        </a>

        <p
          style={{
            fontSize: '0.6875rem',
            lineHeight: 1.6,
            color: 'var(--tgo-text-muted)',
            maxWidth: 300,
            margin: '0 auto 10px',
          }}
        >
          TGO conecta personas y comercios cercanos.
          Creemos en una ciudad donde todo lo importante
          sucede cerca de vos.
        </p>

        <button
          onClick={handleShare}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--tgo-state-interactive)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          <Share2 size={14} />
          Compartí con tus amigos
        </button>
      </div>

      {/* 3. QuickFilters */}
      <div>
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
        <CityNowModule
          nearbyTenants={nearbyTenants}
          promotions={promotions}
        />
      </Section>

      {/* 5. Explorar Categorías */}
      {categories.length > 0 && (
        <Section
          title="Explorar Categorías"
          subtitle="Descubrí por tipo de comida"
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

      {/* 6. Está pasando cerca tuyo */}
      <Section
        title="Está pasando cerca tuyo"
        subtitle="Descubrimientos en tu zona"
        href="/explore"
        verticalPadding="var(--tgo-space-4)"
      >
        <NearbyModule
          restaurants={filteredNearby}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 7. Recién llegaron a la red */}
      <Section
        title="Recién llegaron a la red"
        subtitle="Nuevos en TGO esta semana"
        verticalPadding="var(--tgo-space-4)"
      >
        <NewInNetworkModule
          restaurants={nearbyTenants}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 8. Para este momento */}
      <Section
        title="Para este momento"
        verticalPadding="var(--tgo-space-4)"
      >
        <TimeBasedModule
          restaurants={nearbyTenants}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 9. Hoy podés aprovechar */}
      <Section
        title="Hoy podés aprovechar"
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
              onClick={onOpenLeadModal}
              className="mt-3"
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-state-interactive)',
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
  )
}
