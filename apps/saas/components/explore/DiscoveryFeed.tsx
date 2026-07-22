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
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { captureHomeShared } from '@/lib/tia/events'

// TGO Primitives
import { Section } from '@/components/tgo'
import { HorizontalScroller } from '@/components/tgo'
import { Chip } from '@/components/tgo'
import { EmptyState } from '@/components/tgo'

// TGO Business
import { RestaurantCard } from '@/components/tgo-business'
import { ExperienceCard } from '@/components/tgo-business'
import { CategoryCard } from '@/components/tgo-business'

// Components
import HomeHeader from './HomeHeader'

// Types
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'

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
  Pollo: { icon: '🍗', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)' },
  Sandwich: { icon: '🥪', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
  Rostisería: { icon: '🍗', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)' },
  Pastelería: { icon: '🥐', color: '#DB2777', bg: 'rgba(219, 39, 119, 0.08)' },
  Saludable: { icon: '🥗', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
  Cafetería: { icon: '☕', color: '#065D63', bg: 'rgba(6, 93, 99, 0.08)' },
  Helados: { icon: '🍦', color: '#E11D48', bg: 'rgba(225, 29, 72, 0.08)' },
  'Comida Casera': { icon: '🍲', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
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
      url: 'https://tgo.app',
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

      {/* 4. Explorar Categorías */}
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

      {/* 5. Abiertos ahora */}
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

      {/* 6. Cerca tuyo */}
      <Section
        title="Cerca tuyo"
        subtitle="Descubrimientos en tu zona"
        href="/explore"
        verticalPadding="var(--tgo-space-4)"
      >
        <NearbyModule
          restaurants={filteredNearby}
          onNavigate={handleNavigate}
        />
      </Section>

      {/* 7. Beneficios */}
      <Section
        title="Beneficios"
        subtitle={promotions.length > 0 ? 'Lo que tenés como miembro' : 'Próximamente'}
        href="/app/promociones"
        verticalPadding="var(--tgo-space-4)"
      >
        <ExperiencesModule experiences={promotions} />
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
