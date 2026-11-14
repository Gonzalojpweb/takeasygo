import { describe, expect, it } from 'vitest'
import type { RestaurantCardData } from '@/types/restaurant-card'
import type { CitySignals } from '@/lib/city/signals'
import {
  isSellingOnline,
  layerGadget,
  orbitGadgets,
  orbitOffsets,
  pinTag,
  primaryGadget,
} from '@/lib/city/gadgets'

function signals(over: Partial<CitySignals> = {}): CitySignals {
  return {
    payments: { mp: false, cash: false, transfer: false },
    modes: { takeaway: true, delivery: false, dineIn: false },
    salon: null,
    pace: null,
    delayMinutes: null,
    minutesToClose: 180,
    minutesSinceOpen: 120,
    opensAt: null,
    reservations: false,
    club: null,
    promo: null,
    ...over,
  }
}

function place(over: Partial<RestaurantCardData> = {}, sig: Partial<CitySignals> = {}): RestaurantCardData {
  return {
    id: 'p1',
    type: 'network',
    name: 'Roma',
    address: '',
    lat: -34.59,
    lng: -58.41,
    distanceM: 300,
    phone: '',
    cuisineTypes: [],
    heroImage: '',
    isOpenNow: true,
    isOperational: true,
    acceptsOrders: true,
    estimatedPickupTime: 20,
    orderModes: ['takeaway'],
    signals: signals(sig),
    ...over,
  }
}

describe('órbita: solo datos reales', () => {
  it('sin señales no hay gadgets', () => {
    expect(orbitGadgets(place({ signals: undefined }))).toEqual([])
    expect(orbitGadgets(place({ type: 'listed' }))).toEqual([])
    expect(orbitGadgets(place())).toEqual([])
  })

  it('arma club, moto, pagos y salón en ese orden', () => {
    const g = orbitGadgets(
      place({}, {
        club: { name: 'Club Roma' },
        modes: { takeaway: true, delivery: true, dineIn: true },
        payments: { mp: true, cash: false, transfer: true },
        salon: { level: 'busy', freeTables: 2 },
      })
    )
    expect(g.map(x => x.id)).toEqual(['club', 'bike', 'pay-mp-transfer', 'salon-busy'])
    expect(g[2].width).toBe(10 + 2 * 19)
  })

  it('la promo vive en el cartel, no en la órbita', () => {
    const g = orbitGadgets(place({}, { promo: { title: '2x1', count: 1 } }))
    expect(g.map(x => x.id)).not.toContain('promo')
  })

  it('el salón no aparece sin dato en vivo', () => {
    const g = orbitGadgets(place({}, { modes: { takeaway: true, delivery: false, dineIn: true } }))
    expect(g.find(x => x.id.startsWith('salon'))).toBeUndefined()
  })
})

describe('gadget principal (nivel Cuadras)', () => {
  it('prioriza lo urgente', () => {
    expect(primaryGadget(place({}, { minutesToClose: 20, club: { name: null } }))?.id).toBe('closing')
    expect(primaryGadget(place({}, { salon: { level: 'full', freeTables: 0 }, club: { name: null } }))?.id).toBe('salon-full')
    expect(primaryGadget(place({ isNew: true }, { club: { name: null } }))?.id).toBe('new')
    expect(primaryGadget(place({}, { club: { name: null } }))?.id).toBe('club')
    expect(primaryGadget(place())).toBeNull()
  })

  it('un local cerrado no muestra «cierra pronto»', () => {
    expect(primaryGadget(place({ isOpenNow: false }, { minutesToClose: 10 }))).toBeNull()
  })
})

describe('cartel bajo el pin', () => {
  it('muestra el tiempo desde Tu cuadra', () => {
    expect(pinTag(place())).toEqual({ text: '20 min', tone: 'live', tier: 3 })
  })

  it('la promo va con el tiempo y se ve desde Cuadras', () => {
    expect(pinTag(place({}, { promo: { title: '2x1', count: 1 } }))).toEqual({ text: 'Promo · 20 min', tone: 'promo', tier: 2 })
  })

  it('lo urgente se ve desde Cuadras', () => {
    expect(pinTag(place({}, { minutesToClose: 15 }))).toMatchObject({ text: 'Cierra ya', tier: 2 })
  })

  it('el directorio no lleva cartel', () => {
    expect(pinTag(place({ type: 'listed' }))).toBeNull()
  })
})

describe('capas', () => {
  it('cada capa muestra su gadget', () => {
    expect(layerGadget('cash', place())?.id).toBe('g-cash')
    expect(layerGadget('mp', place())?.id).toBe('g-mp')
    expect(layerGadget('delivery', place())?.id).toBe('bike')
    expect(layerGadget('open', place())).toBeNull()
    expect(layerGadget('salon', place({}, { salon: { level: 'calm', freeTables: 6 } }))?.id).toBe('salon-calm')
  })
})

describe('vende online', () => {
  it('requiere red, operativo y Mercado Pago con split vigente', () => {
    expect(isSellingOnline(place({ isFullOperational: true }))).toBe(true)
    expect(isSellingOnline(place({ isFullOperational: false }))).toBe(false)
    expect(isSellingOnline(place({ isFullOperational: true, isOperational: false }))).toBe(false)
    expect(isSellingOnline(place({ isFullOperational: true, type: 'listed' }))).toBe(false)
  })
})

describe('posiciones de la órbita', () => {
  it('un arco simétrico sobre la cabeza', () => {
    expect(orbitOffsets(0)).toEqual([])
    const one = orbitOffsets(1)
    expect(one[0][0]).toBe(0)
    const three = orbitOffsets(3)
    expect(three[0][0]).toBe(-three[2][0])
    expect(three[1][1]).toBeLessThan(three[0][1])
  })
})
