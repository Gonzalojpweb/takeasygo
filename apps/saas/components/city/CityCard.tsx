'use client'

// ── CityCard ────────────────────────────────────────────────────────────────
//
// La card de lugar en su variante de lista. No representa un restaurante:
// representa lo que está pasando ahí ahora. Lectura en tres segundos:
//   1. qué lugar es  2. qué está pasando  3. qué tan cerca  4. si hay oportunidad
// Máximo un estado + una oportunidad; el resto son íconos discretos.

import type { RestaurantCardData } from '@/types/restaurant-card'
import { cityOpportunity, cityStatus, isAwake, isWithin15, proximityLabel } from '@/lib/city/signals'
import { FactIcons, OpportunityPill, PlaceAvatar, StatusLine } from './Signals'

export default function CityCard({
  place,
  onSelect,
}: {
  place: RestaurantCardData
  onSelect: (place: RestaurantCardData) => void
}) {
  const status = cityStatus(place)
  const opportunity = cityOpportunity(place)
  const near = proximityLabel(place.distanceM)
  const asleep = place.type === 'network' ? !isAwake(place) : place.isOpenNow === false

  return (
    <button type="button" className="city-card" data-asleep={asleep} onClick={() => onSelect(place)}>
      <PlaceAvatar place={place} />
      <span className="city-card__body">
        <span className="city-card__head">
          <span className="city-card__name">{place.name}</span>
          {near && (
            <span className="city-card__near" data-close={isWithin15(place.distanceM)}>
              {near}
            </span>
          )}
        </span>
        <StatusLine status={status} />
        {(opportunity || place.signals) && (
          <span className="city-card__meta">
            {opportunity ? <OpportunityPill opportunity={opportunity} /> : <span />}
            <FactIcons place={place} max={opportunity ? 4 : 6} />
          </span>
        )}
      </span>
    </button>
  )
}
