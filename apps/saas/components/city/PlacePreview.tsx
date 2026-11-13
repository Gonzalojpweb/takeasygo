'use client'

// ── PlacePreview ────────────────────────────────────────────────────────────
//
// Ficha rápida que aparece al tocar un pin (variante «Map Preview» de la
// card). Deja ver el mapa, cuenta el presente del lugar y sus gadgets:
// cómo se pide, cómo se paga y cómo está el salón. Una sola acción primaria.

import { motion, type PanInfo } from 'framer-motion'
import { Navigation, X } from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { cityOpportunity, cityStatus, proximityLabel } from '@/lib/city/signals'
import { OpportunityPill, PlaceAvatar, StatusLine } from './Signals'
import { PlaceGadgets } from './PlaceGadgets'

export default function PlacePreview({
  place,
  onOpen,
  onClose,
}: {
  place: RestaurantCardData
  onOpen: (place: RestaurantCardData) => void
  onClose: () => void
}) {
  const status = cityStatus(place)
  const opportunity = cityOpportunity(place)
  const s = place.signals ?? null
  const network = place.type === 'network'
  const near = proximityLabel(place.distanceM)
  const kitchen = place.cuisineTypes?.slice(0, 2).join(' · ')
  const sub = [near, kitchen].filter(Boolean).join(' · ') || place.address

  const canOrder = network && place.isOperational !== false
  const mapsUrl =
    place.lat != null && place.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`
      : null

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 70 || info.velocity.y > 500) onClose()
  }

  return (
    <motion.section
      className="city-preview"
      role="dialog"
      aria-label={place.name}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={handleDragEnd}
    >
      <div className="city-preview__head">
        <PlaceAvatar place={place} size="lg" />
        <div className="city-preview__title">
          <h2>{place.name}</h2>
          <p className="city-preview__sub">{sub}</p>
        </div>
        <button type="button" className="city-preview__close" onClick={onClose} aria-label="Cerrar">
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <div className="city-preview__now" data-tone={status.tone}>
        <StatusLine status={status} size="lg" />
      </div>

      {opportunity && (
        <div className="city-preview__opp">
          <OpportunityPill opportunity={opportunity} />
        </div>
      )}

      {s && <PlaceGadgets signals={s} />}

      <div className="city-preview__actions">
        <button type="button" className="city-cta" data-variant="primary" onClick={() => onOpen(place)}>
          {canOrder ? 'Ver menú y pedir' : 'Ver el lugar'}
        </button>
        {mapsUrl && (
          <a
            className="city-cta"
            data-variant="secondary"
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Cómo llegar caminando"
          >
            <Navigation size={18} strokeWidth={2.1} />
          </a>
        )}
      </div>
    </motion.section>
  )
}
