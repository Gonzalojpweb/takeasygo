'use client'

// ── PlaceGadgets / PlaceNow ─────────────────────────────────────────────────
//
// Los «gadgets» de un lugar: cómo se pide, cómo se paga y cómo está el salón.
// Se usan en la ficha rápida del mapa y en la ficha completa del lugar, así
// las dos hablan igual.

import { Armchair, ArrowLeftRight, Banknote, Bike, CalendarCheck, ShoppingBag, Smartphone } from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { cityOpportunity, cityStatus, type CitySignals, type SalonLevel } from '@/lib/city/signals'
import { OpportunityPill, SalonMeter, StatusLine } from './Signals'
import './city.css'

const SALON_SHORT: Record<SalonLevel, string> = {
  calm: 'Hay lugar',
  moving: 'Con movimiento',
  busy: 'Casi lleno',
  full: 'Lleno',
}

const list = (items: Array<string | false>) => items.filter(Boolean).join(' · ')

export function PlaceGadgets({ signals: s }: { signals: CitySignals }) {
  const modes = list([s.modes.takeaway && 'Retiro', s.modes.delivery && 'Delivery', s.modes.dineIn && 'Salón'])
  const pays = list([s.payments.mp && 'MP', s.payments.cash && 'Efectivo', s.payments.transfer && 'Transf.'])

  return (
    <div className="city-gadgets">
      <div className="city-gadget">
        <p className="city-gadget__label">Cómo pedir</p>
        <div className="city-gadget__icons">
          <ShoppingBag size={17} strokeWidth={1.9} data-off={!s.modes.takeaway} aria-hidden="true" />
          <Bike size={17} strokeWidth={1.9} data-off={!s.modes.delivery} aria-hidden="true" />
          <Armchair size={17} strokeWidth={1.9} data-off={!s.modes.dineIn} aria-hidden="true" />
        </div>
        <p className="city-gadget__text">{modes || 'Consultá en el local'}</p>
      </div>

      <div className="city-gadget">
        <p className="city-gadget__label">Cómo pagar</p>
        <div className="city-gadget__icons">
          <Smartphone size={17} strokeWidth={1.9} data-off={!s.payments.mp} aria-hidden="true" />
          <Banknote size={17} strokeWidth={1.9} data-off={!s.payments.cash} aria-hidden="true" />
          <ArrowLeftRight size={17} strokeWidth={1.9} data-off={!s.payments.transfer} aria-hidden="true" />
        </div>
        <p className="city-gadget__text">{pays || 'En el local'}</p>
      </div>

      <div className="city-gadget">
        <p className="city-gadget__label">Salón</p>
        <div className="city-gadget__icons">
          {s.salon ? (
            <SalonMeter level={s.salon.level} />
          ) : (
            <CalendarCheck size={17} strokeWidth={1.9} data-off={!s.reservations} aria-hidden="true" />
          )}
        </div>
        <p className="city-gadget__text">
          {s.salon
            ? SALON_SHORT[s.salon.level]
            : s.reservations
              ? 'Toma reservas'
              : s.modes.dineIn
                ? 'Sin dato ahora'
                : 'Solo para llevar'}
        </p>
      </div>
    </div>
  )
}

/** Bloque «Ahora» para la ficha completa del lugar (fuera del mapa). */
export function PlaceNow({ place }: { place: RestaurantCardData }) {
  const status = cityStatus(place)
  const opportunity = cityOpportunity(place)
  return (
    <section className="city-scope city-now" aria-label="Qué está pasando ahora">
      <div className="city-preview__now" data-tone={status.tone}>
        <StatusLine status={status} size="lg" />
      </div>
      {opportunity && (
        <div className="city-preview__opp">
          <OpportunityPill opportunity={opportunity} />
        </div>
      )}
      {place.signals && <PlaceGadgets signals={place.signals} />}
    </section>
  )
}
