'use client'

import { HorizontalScroller, EmptyState } from '@/components/tgo'
import { ExperienceCard } from '@/components/tgo-business'
import { microcopy } from '@/components/tgo/microcopy'

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

interface Props {
  experiences: any[]
}

export function ExperiencesModule({ experiences }: Props) {
  const mapped = experiences.map(toExperience).filter((e) => e.tenantSlug && e.title)

  if (mapped.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 24 }}>🎁</span>}
        title={microcopy.discovery.empty.joinClub}
        subtitle="Desbloqueá beneficios exclusivos en tus lugares favoritos"
        action={{ label: microcopy.discovery.empty.exploreClubs, onClick: () => {} }}
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
