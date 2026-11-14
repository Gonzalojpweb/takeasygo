// ── Gadgets del mapa (TGO Ciudad Viva) ──────────────────────────────────────
//
// Qué muestra cada pin según el nivel de zoom. Lógica PURA: el mapa dibuja,
// este archivo decide. Prototipo aprobado el 13/11/2026.
//
// Niveles:
//   1 · Barrio    (zoom < ZOOM_BLOCKS)   pines chicos, grupos, brillo en abiertos.
//   2 · Cuadras   (ZOOM_BLOCKS..STREET)  un gadget principal + cartel urgente o de promo.
//   3 · Tu cuadra (zoom ≥ ZOOM_STREET)   órbita de gadgets + cartel con el tiempo.
//
// Reglas:
//   · nunca se muestra un dato que no existe (sin señal = sin gadget);
//   · el pin sigue siendo el protagonista: los gadgets son insignias chicas;
//   · si dos gadgets chocan, el mapa esconde uno (lo resuelve el motor).

import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  cityOpportunity,
  cityStatus,
  hasClub,
  hasPromo,
  isAwake,
  type CityLayer,
  type SalonLevel,
  type StatusTone,
} from './signals'

export const ZOOM_BLOCKS = 14.3
export const ZOOM_STREET = 16

/** Ancho estándar de un gadget redondo, en píxeles de ícono. */
export const GADGET_SIZE = 28
/** Centro de la cabeza del pin respecto de la punta, en píxeles de ícono. */
export const PIN_HEAD_Y = -38

export interface Gadget {
  /** Nombre del dibujo: promo, club, new, bike, closing, pay-mp-cash, salon-busy, g-cash… */
  id: string
  width: number
}

const round = (id: string): Gadget => ({ id, width: GADGET_SIZE })

/** El local vende online de verdad: Mercado Pago activo con split vigente. */
export function isSellingOnline(p: RestaurantCardData): boolean {
  return p.type === 'network' && p.isFullOperational === true && p.isOperational !== false
}

function salonLevel(p: RestaurantCardData): SalonLevel | null {
  return p.signals?.salon?.level ?? null
}

function paymentGadget(p: RestaurantCardData): Gadget | null {
  const pay = p.signals?.payments
  if (!pay) return null
  const methods = (['mp', 'cash', 'transfer'] as const).filter(k => pay[k])
  if (methods.length === 0) return null
  return { id: `pay-${methods.join('-')}`, width: 10 + methods.length * 19 }
}

/**
 * Órbita completa (nivel 3 o pin elegido), de izquierda a derecha.
 * La promo no entra: vive en el cartel del pin, con el tiempo.
 */
export function orbitGadgets(p: RestaurantCardData): Gadget[] {
  if (p.type !== 'network' || !p.signals) return []
  const out: Gadget[] = []
  const opportunity = cityOpportunity(p)
  if (opportunity?.kind === 'club') out.push(round('club'))
  else if (opportunity?.kind === 'new') out.push(round('new'))
  else if (opportunity?.kind === 'promo' && hasClub(p)) out.push(round('club'))
  if (p.signals.modes.delivery) out.push(round('bike'))
  const pay = paymentGadget(p)
  if (pay) out.push(pay)
  const salon = salonLevel(p)
  if (salon) out.push({ id: `salon-${salon}`, width: 50 })
  return out
}

/** El gadget del nivel 2: lo que más cambia la decisión en este momento. */
export function primaryGadget(p: RestaurantCardData): Gadget | null {
  if (p.type !== 'network' || !p.signals) return null
  const s = p.signals
  if (isAwake(p) && s.minutesToClose != null && s.minutesToClose <= 30) return round('closing')
  const salon = salonLevel(p)
  if (isAwake(p) && (salon === 'full' || salon === 'busy')) return { id: `salon-${salon}`, width: 50 }
  if (p.isNew) return round('new')
  if (hasClub(p)) return round('club')
  return null
}

/** Con una capa encendida, todos los pines que cumplen muestran su gadget. */
export function layerGadget(layer: CityLayer | null, p: RestaurantCardData): Gadget | null {
  switch (layer) {
    case 'delivery':
      return round('bike')
    case 'cash':
      return round('g-cash')
    case 'mp':
      return round('g-mp')
    case 'transfer':
      return round('g-transfer')
    case 'club':
      return round('club')
    case 'salon': {
      const level = salonLevel(p)
      return level ? { id: `salon-${level}`, width: 50 } : null
    }
    default:
      return null
  }
}

export type TagTone = StatusTone | 'promo'

export interface PinTag {
  text: string
  tone: TagTone
  /** 2 = se ve desde Cuadras (urgente o promo); 3 = desde Tu cuadra. */
  tier: 2 | 3
}

/** Cartel bajo el pin: el tiempo, y la promo cuando hay. */
export function pinTag(p: RestaurantCardData): PinTag | null {
  if (p.type !== 'network') return null
  const status = cityStatus(p)
  if (!status.short) return null
  const urgent = status.tone === 'warn' || status.tone === 'busy'
  if (isAwake(p) && hasPromo(p) && !urgent) {
    return { text: `Promo · ${status.short}`, tone: 'promo', tier: 2 }
  }
  return { text: status.short, tone: status.tone, tier: urgent ? 2 : 3 }
}

/**
 * Posiciones de la órbita: un arco sobre la cabeza del pin.
 * Devuelve [x, y] en píxeles de ícono para cada lugar de `count`.
 */
export function orbitOffsets(count: number): Array<[number, number]> {
  if (count <= 0) return []
  const radius = 40
  const span = Math.min(156, 52 * (count - 1))
  return Array.from({ length: count }, (_, i) => {
    const deg = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1)
    const a = (deg * Math.PI) / 180
    return [Math.round(radius * Math.sin(a) * 1.45), Math.round(PIN_HEAD_Y - 4 - radius * Math.cos(a))]
  })
}

/** Clave de la órbita para el estilo: cantidad × 10 + posición. */
export const orbitKey = (count: number, index: number) => count * 10 + index

/** Máximo de gadgets en una órbita (con el salón en vivo: club, moto, pagos, salón). */
export const ORBIT_MAX = 4
