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
    <div style={{ paddingInline: 'var(--tgo-page-padding)', paddingTop: 'var(--tgo-space-6)' }}>
      <h1
        style={{
          color: 'var(--tgo-text-primary)',
          fontSize: 'var(--tgo-type-hero)',
          fontWeight: 700,
          letterSpacing: 'var(--tgo-tracking-tight)',
        }}
      >
        {period} {userName ?? ''}
      </h1>
      <p
        className="mt-1"
        style={{
          color: 'var(--tgo-text-muted)',
          fontSize: 'var(--tgo-type-body-sm)',
        }}
      >
        ¿Qué se te antoja hoy?
      </p>
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
      className="flex gap-2 overflow-x-auto scrollbar-none"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {QUICK_FILTERS.map((f) => (
        <Chip
          key={f.query}
          variant={activeFilter === f.query ? 'active' : 'default'}
          size="pill"
          icon={<span>{f.icon}</span>}
          onClick={() =>
            onFilterChange(activeFilter === f.query ? null : f.query)
          }
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
          color: 'var(--tgo-text-muted)',
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
  const router = useRouter()

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

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
  const categories: string[] = data?.categories ?? []

  // For now, use nearbyTenants for all modules (real impl would have separate APIs)
  const openNow = useMemo(
    () => nearbyTenants.filter((r) => r.isOpenNow === true || r.isOpenNow === null),
    [nearbyTenants]
  )

  if (loading && !data) {
    return (
      <div className="h-full bg-white">
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
      <GreetingModule userName={userName} />

      {/* 2. SearchBar */}
      <div className="mt-4" style={{ paddingInline: 'var(--tgo-page-padding)' }}>
        <SearchBar showLocation={false} />
      </div>

      {/* 3. QuickFilters */}
      <div className="mt-3">
        <QuickFiltersModule
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </div>

      {/* 4. OpenNow */}
      <Section
        title="Abiertos ahora"
        subtitle="Dónde podés ir ahora"
        href="/explore?open=true"
      >
        <OpenNowModule
          restaurants={openNow}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 5. Nearby */}
      <Section
        title="Cerca tuyo"
        subtitle="Descubrimientos en tu zona"
        href="/explore"
      >
        <NearbyModule
          restaurants={nearbyTenants}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 6. Experiences */}
      {promotions.length > 0 && (
        <Section
          title="Beneficios"
          subtitle="Lo que tenés como miembro"
          href="/promociones"
        >
          <ExperiencesModule experiences={promotions} />
        </Section>
      )}

      {/* 7. Trending */}
      {nearbyTenants.length > 0 && (
        <Section
          title="Lo más pedido"
          subtitle="Los favoritos de tu zona"
        >
          <TrendingModule
            restaurants={nearbyTenants.slice(0, 6)}
            onNavigate={handleNavigate}
          />
        </Section>
      )}

      {/* 8. Categories */}
      {categories.length > 0 && (
        <Section
          title="Tipos de comida"
          subtitle="Explorá por categoría"
        >
          <CategoriesModule
            categories={categories}
            onSelect={(name) => onCategorySelect?.(name)}
          />
        </Section>
      )}

      {/* B2B CTA */}
      {onOpenLeadModal && (
        <section
          className="py-8"
          style={{ paddingInline: 'var(--tgo-page-padding)' }}
        >
          <div
            className="p-8 text-center"
            style={{
              borderRadius: 'var(--tgo-radius-2xl)',
              backgroundColor: 'var(--tgo-text-primary)',
            }}
          >
            <div className="space-y-2">
              <h3
                style={{
                  color: 'var(--tgo-text-inverse)',
                  fontSize: 'var(--tgo-type-title)',
                  fontWeight: 700,
                }}
              >
                ¿Tenés un restaurante?
              </h3>
              <p
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 'var(--tgo-type-body-sm)',
                  lineHeight: 1.5,
                }}
              >
                Sumate a la plataforma que potencia locales sin comisiones
                abusivas.
              </p>
            </div>
            <button
              onClick={onOpenLeadModal}
              className="w-full mt-4"
              style={{
                padding: '14px 24px',
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-state-interactive)',
                color: 'var(--tgo-text-inverse)',
                fontSize: 'var(--tgo-type-body-sm)',
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
