'use client'

// ── Señales (piezas chicas de la card de lugar) ─────────────────────────────
//
// Estado en una frase, oportunidad en una pastilla y «gadgets» de línea para
// lo demás. Íconos de un solo trazo y un solo color (TGO Foundations §8).

import { useState } from 'react'
import {
  Armchair,
  ArrowLeftRight,
  Banknote,
  Bike,
  CalendarCheck,
  Gift,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  SALON_FILL,
  SALON_LABEL,
  type CityOpportunity,
  type CityStatus,
  type SalonLevel,
} from '@/lib/city/signals'

export function StatusLine({ status, size }: { status: CityStatus; size?: 'lg' }) {
  return (
    <p className="city-status" data-tone={status.tone} data-size={size}>
      {status.text}
    </p>
  )
}

const OPPORTUNITY_ICON: Record<CityOpportunity['kind'], LucideIcon> = {
  promo: Tag,
  club: Gift,
  new: Sparkles,
}

export function OpportunityPill({ opportunity }: { opportunity: CityOpportunity }) {
  const Icon = OPPORTUNITY_ICON[opportunity.kind]
  return (
    <span className="city-opp" data-kind={opportunity.kind}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      <span>{opportunity.text}</span>
    </span>
  )
}

export function PlaceAvatar({ place, size }: { place: RestaurantCardData; size?: 'lg' }) {
  const src = place.logoUrl || place.heroImage || place.heroImageUrl
  // Si el logo no carga (borrado en el CDN), se muestra la inicial.
  const [broken, setBroken] = useState<string | null>(null)
  const image = src && broken !== src ? src : ''
  return (
    <span
      className="city-avatar-place"
      data-size={size}
      style={{ backgroundColor: image ? 'var(--c-surface-2)' : place.primaryColor || '#98A2B3' }}
      aria-hidden="true"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" onError={() => setBroken(image)} />
      ) : (
        place.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  )
}

interface Fact {
  key: string
  icon: LucideIcon
  label: string
}

/** Hechos del lugar en orden de utilidad para decidir. */
export function placeFacts(place: RestaurantCardData): Fact[] {
  const s = place.signals
  if (!s) {
    const facts: Fact[] = []
    if (place.orderModes?.includes('takeaway')) facts.push({ key: 'takeaway', icon: ShoppingBag, label: 'Retiro en el local' })
    if (place.deliveryEnabled) facts.push({ key: 'delivery', icon: Bike, label: 'Delivery' })
    return facts
  }
  const facts: Fact[] = []
  if (s.modes.takeaway) facts.push({ key: 'takeaway', icon: ShoppingBag, label: 'Retiro en el local' })
  if (s.modes.delivery) facts.push({ key: 'delivery', icon: Bike, label: 'Delivery' })
  if (s.modes.dineIn || s.salon) facts.push({ key: 'salon', icon: Armchair, label: 'Salón' })
  if (s.reservations) facts.push({ key: 'reservas', icon: CalendarCheck, label: 'Toma reservas' })
  if (s.payments.mp) facts.push({ key: 'mp', icon: Smartphone, label: 'Mercado Pago' })
  if (s.payments.cash) facts.push({ key: 'cash', icon: Banknote, label: 'Efectivo' })
  if (s.payments.transfer) facts.push({ key: 'transfer', icon: ArrowLeftRight, label: 'Transferencia' })
  return facts
}

/** Fila compacta de íconos para la card de lista. */
export function FactIcons({ place, max = 5 }: { place: RestaurantCardData; max?: number }) {
  const facts = placeFacts(place).slice(0, max)
  if (facts.length === 0) return null
  return (
    <span className="city-facts" role="img" aria-label={facts.map(f => f.label).join(', ')}>
      {facts.map(f => (
        <f.icon key={f.key} size={15} strokeWidth={1.9} aria-hidden="true" />
      ))}
    </span>
  )
}

const SALON_TONE: Record<SalonLevel, string> = {
  calm: 'live',
  moving: 'live',
  busy: 'busy',
  full: 'warn',
}

export function SalonMeter({ level }: { level: SalonLevel }) {
  const fill = SALON_FILL[level]
  return (
    <span className="city-meter" data-tone={SALON_TONE[level]} role="img" aria-label={SALON_LABEL[level]}>
      {[1, 2, 3, 4].map(step => (
        <i key={step} data-on={step <= fill} />
      ))}
    </span>
  )
}
