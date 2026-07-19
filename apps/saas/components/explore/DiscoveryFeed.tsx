'use client'

// ── DiscoveryFeed ────────────────────────────────────────────────────────────
//
// La nueva Home de TakeasyGo.
// No es un dashboard. Es una historia.
// Cada sección responde una pregunta distinta del usuario.
//
// Modulos: Greeting → Search → QuickFilters → OpenNow → Nearby →
//          Experiences → Trending → NewInNetwork → RecentlyVisited →
//          ForTonight → Categories

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTenant } from '@/contexts/TenantContext'
import { useLocation } from './LocationContext'

// TGO Primitives
import { Section } from '@/components/tgo'
import { HorizontalScroller } from '@/components/tgo'
import { Chip } from '@/components/tgo'
import { SearchBar } from '@/components/tgo'
import { EmptyState } from '@/components/tgo'

// TGO Business
import { RestaurantCard } from '@/components/tgo-business'
import { ExperienceCard } from '@/components/tgo-business'
import { CategoryCard } from '@/components/tgo-business'

// Types
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'

// ── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(): { period: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return { period: 'Buenos días', emoji: '☀️' }
  if (hour >= 12 && hour < 19) return { period: 'Buenas tardes', emoji: '🌤' }
  return { period: 'Buenas noches', emoji: '🌙' }
}

function GreetingModule({ userName }: { userName?: string }) {
  const { period, emoji } = getGreeting()
  return (
    <div style={{ paddingInline: 'var(--tgo-page-padding)', paddingTop: 'var(--tgo-space-5)', paddingBottom: 'var(--tgo-space-1)' }}>
      <h1
        style={{
          color: 'var(--tgo-text-primary)',
          fontSize: 'var(--tgo-type-title)',
          fontWeight: 700,
          letterSpacing: 'var(--tgo-tracking-tight)',
        }}
      >
        {period} {userName ?? ''}
      </h1>
    </div>
  )
}

// ── QuickFilters ─────────────────────────────────────────────────────────────

const QUICK_FILTERS = [
  { label: 'Abiertos', icon: '🔓', query: 'abiertos' },
  { label: 'Delivery', icon: '🛵', query: 'delivery' },
  { label: 'Cercanos', icon: '📍', query: 'cercanos' },
  { label: 'Beneficios', icon: '🎁', query: 'beneficios' },
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
      {QUICK_FILTERS.map((f) => (
        <Chip
          key={f.query}
          variant={activeFilter === f.query ? 'active' : 'default'}
          size="sm"
          icon={<span>{f.icon}</span>}
          onClick={() =>
            onFilterChange(activeFilter === f.query ? null : f.query)
          }
          style={{ fontSize: 11, padding: '0 10px', height: 28 }}
        >
          {f.label}
        </Chip>
      ))}
    </div>
  )
}

// ── OpenNow ──────────────────────────────────────────────────────────────────

function OpenNowModule({
  restaurants,
  onNavigate,
}: {
  restaurants: NearbyRestaurant[]
  onNavigate: (r: NearbyRestaurant) => void
}) {
  const open = restaurants.filter(
    (r) => r.isOpenNow === true || r.isOpenNow === null
  )

  if (open.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 24 }}>😴</span>}
        title="Todos cerraron"
        subtitle="Mañana hay más. ¿Querés ver el horario?"
        variant="search"
      />
    )
  }

  return (
    <HorizontalScroller>
      {open.slice(0, 8).map((r, i) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          layout="hero"
          onNavigate={() => onNavigate(r)}
          index={i}
        />
      ))}
    </HorizontalScroller>
  )
}

// ── Nearby ───────────────────────────────────────────────────────────────────

function NearbyModule({
  restaurants,
  onNavigate,
}: {
  restaurants: NearbyRestaurant[]
  onNavigate: (r: NearbyRestaurant) => void
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

function ExperiencesModule({
  experiences,
}: {
  experiences: any[]
}) {
  if (experiences.length === 0) {
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
      {experiences.slice(0, 5).map((e) => (
        <ExperienceCard key={e._id} experience={e} />
      ))}
    </HorizontalScroller>
  )
}

// ── Trending ─────────────────────────────────────────────────────────────────

function TrendingModule({
  restaurants,
  onNavigate,
}: {
  restaurants: NearbyRestaurant[]
  onNavigate: (r: NearbyRestaurant) => void
}) {
  if (restaurants.length === 0) return null

  return (
    <HorizontalScroller>
      {restaurants.slice(0, 6).map((r, i) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          layout="hero"
          onNavigate={() => onNavigate(r)}
          index={i}
        />
      ))}
    </HorizontalScroller>
  )
}

// ── NewInNetwork ─────────────────────────────────────────────────────────────

function NewInNetworkModule({
  restaurants,
  onNavigate,
}: {
  restaurants: NearbyRestaurant[]
  onNavigate: (r: NearbyRestaurant) => void
}) {
  if (restaurants.length === 0) return null

  return (
    <HorizontalScroller>
      {restaurants.slice(0, 4).map((r, i) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          layout="hero"
          onNavigate={() => onNavigate(r)}
          index={i}
        />
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
}

function CategoriesModule({
  categories,
  onSelect,
}: {
  categories: string[]
  onSelect: (name: string) => void
}) {
  return (
    <div
      className="grid grid-cols-4 gap-4"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {categories.slice(0, 8).map((cat) => {
        const config = CATEGORY_CONFIG[cat] ?? {
          icon: '🍽',
          color: 'var(--tgo-text-secondary)',
          bg: 'var(--tgo-surface-2)',
        }
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

  const handleNavigate = (r: NearbyRestaurant) => {
    setTenantSlug(r.id)
    router.push(`/app/${r.id}?type=${r.type}`)
  }

  const nearbyTenants: NearbyRestaurant[] = data?.nearbyTenants ?? []
  const promotions: any[] = data?.promotions ?? []
  const rawCategories: string[] = data?.categories ?? []

  // Sort categories: preferred cuisines first, then alphabetical
  const categories = useMemo(() => {
    if (preferredCuisines.length === 0) return rawCategories
    const preferred = preferredCuisines.filter((c) =>
      rawCategories.some((rc) => rc.toLowerCase().includes(c.toLowerCase()))
    )
    const rest = rawCategories.filter(
      (rc) => !preferred.some((p) => rc.toLowerCase().includes(p.toLowerCase()))
    )
    return [...preferred, ...rest]
  }, [rawCategories, preferredCuisines])

  // For now, use nearbyTenants for all modules (real impl would have separate APIs)
  const openNow = useMemo(
    () => nearbyTenants.filter((r) => r.isOpenNow === true || r.isOpenNow === null),
    [nearbyTenants]
  )

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
      {/* 1. Greeting */}
      <GreetingModule userName={userName || session?.user?.name?.split(' ')[0] || ''} />

      {/* 2. SearchBar */}
      <div className="mt-3" style={{ paddingInline: 'var(--tgo-page-padding)' }}>
        <SearchBar showLocation={false} />
      </div>

      {/* 3. QuickFilters */}
      <div className="mt-3">
        <QuickFiltersModule
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </div>

      {/* 4. Nearby (principal — lista compacta) */}
      <Section
        title={
          activeFilter === 'abiertos' ? 'Abiertos ahora' :
          activeFilter === 'delivery' ? 'Con delivery' :
          activeFilter === 'beneficios' ? 'Con beneficios' :
          'Cerca tuyo'
        }
        subtitle={
          activeFilter
            ? `${filteredNearby.length} resultado${filteredNearby.length !== 1 ? 's' : ''}`
            : 'Descubrimientos en tu zona'
        }
        href="/explore"
        verticalPadding="var(--tgo-space-5)"
      >
        <NearbyModule
          restaurants={filteredNearby}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 5. OpenNow (scroll horizontal) */}
      <Section
        title="Abiertos ahora"
        subtitle="Dónde podés ir ahora"
        verticalPadding="var(--tgo-space-4)"
      >
        <OpenNowModule
          restaurants={openNow}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 6. Categories (grid) */}
      {categories.length > 0 && (
        <Section
          title="Tipos de comida"
          subtitle="Explorá por categoría"
          verticalPadding="var(--tgo-space-4)"
        >
          <CategoriesModule
            categories={categories}
            onSelect={(name) => onCategorySelect?.(name)}
          />
        </Section>
      )}

      {/* 7. Experiences */}
      {promotions.length > 0 && (
        <Section
          title="Beneficios"
          subtitle="Lo que tenés como miembro"
          href="/promociones"
          verticalPadding="var(--tgo-space-4)"
        >
          <ExperiencesModule experiences={promotions} />
        </Section>
      )}

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
