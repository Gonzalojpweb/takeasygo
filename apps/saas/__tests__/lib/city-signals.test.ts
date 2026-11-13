import { describe, expect, it } from 'vitest'
import {
  cityFeed,
  cityHeadline,
  cityOpportunity,
  cityPulse,
  cityStatus,
  distanceMeters,
  matchesLayer,
  openWindow,
  paceFromOrders,
  pinExpression,
  proximityLabel,
  salonFromTables,
  type CityPlace,
  type CitySignals,
} from '@/lib/city/signals'

const NOW = new Date('2026-11-13T21:00:00-03:00')

function signals(over: Partial<CitySignals> = {}): CitySignals {
  return {
    payments: { mp: true, cash: false, transfer: false },
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

function place(over: Partial<CityPlace> = {}, sig: Partial<CitySignals> = {}): CityPlace {
  return {
    type: 'network',
    isOpenNow: true,
    isOperational: true,
    acceptsOrders: true,
    estimatedPickupTime: 11,
    signals: signals(sig),
    ...over,
  }
}

describe('salonFromTables', () => {
  const recent = new Date(NOW.getTime() - 20 * 60_000)

  it('no informa salón sin mesas suficientes o sin POS en uso', () => {
    expect(salonFromTables(null, NOW)).toBeNull()
    expect(salonFromTables({ free: 1, occupied: 1, reserved: 0, needsAttention: 0, lastUpdate: recent }, NOW)).toBeNull()
    const stale = new Date(NOW.getTime() - 30 * 60 * 60_000)
    expect(salonFromTables({ free: 2, occupied: 8, reserved: 0, needsAttention: 0, lastUpdate: stale }, NOW)).toBeNull()
    expect(salonFromTables({ free: 2, occupied: 8, reserved: 0, needsAttention: 0, lastUpdate: null }, NOW)).toBeNull()
  })

  it('gradúa la ocupación', () => {
    const at = (free: number, occupied: number) =>
      salonFromTables({ free, occupied, reserved: 0, needsAttention: 0, lastUpdate: recent }, NOW)?.level
    expect(at(9, 1)).toBe('calm')
    expect(at(6, 4)).toBe('moving')
    expect(at(2, 8)).toBe('busy')
    expect(at(0, 10)).toBe('full')
  })

  it('cuenta reservadas y con atención como ocupadas', () => {
    const salon = salonFromTables({ free: 0, occupied: 2, reserved: 1, needsAttention: 1, lastUpdate: recent }, NOW)
    expect(salon).toEqual({ level: 'full', freeTables: 0 })
  })
})

describe('paceFromOrders', () => {
  it('traduce pedidos de la última hora a ritmo', () => {
    expect(paceFromOrders(null)).toBeNull()
    expect(paceFromOrders(0)).toBeNull()
    expect(paceFromOrders(1)).toBe('calm')
    expect(paceFromOrders(3)).toBe('steady')
    expect(paceFromOrders(9)).toBe('busy')
  })
})

describe('openWindow', () => {
  const slots = [
    { days: [1, 2, 3, 4, 5], open: '12:00', close: '15:30' },
    { days: [1, 2, 3, 4, 5], open: '20:00', close: '23:30' },
  ]

  it('mide el turno actual', () => {
    expect(openWindow(slots, { day: 5, minutes: 20 * 60 + 15 })).toEqual({
      minutesToClose: 195,
      minutesSinceOpen: 15,
      opensAt: null,
    })
  })

  it('cerrado: devuelve la próxima apertura, del día o del siguiente', () => {
    expect(openWindow(slots, { day: 5, minutes: 17 * 60 }).opensAt).toBe('20:00')
    // Viernes después del cierre → lunes al mediodía.
    expect(openWindow(slots, { day: 5, minutes: 23 * 60 + 50 }).opensAt).toBe('12:00')
    expect(openWindow([], { day: 5, minutes: 600 })).toEqual({ minutesToClose: null, minutesSinceOpen: null, opensAt: null })
  })
})

describe('cercanía', () => {
  it('habla en tiempo a pie', () => {
    expect(proximityLabel(90)).toBe('A la vuelta')
    expect(proximityLabel(480)).toBe('6 min a pie')
    expect(proximityLabel(2400)).toBe('2,4 km')
    expect(proximityLabel(null)).toBe('')
  })

  it('mide distancias reales', () => {
    const obelisco = { lat: -34.6037, lng: -58.3816 }
    const d = distanceMeters(obelisco, { lat: -34.6083, lng: -58.3712 }) // Plaza de Mayo
    expect(d).toBeGreaterThan(900)
    expect(d).toBeLessThan(1200)
  })
})

describe('cityStatus — una frase, la más relevante', () => {
  it('estado por defecto', () => {
    expect(cityStatus(place())).toMatchObject({ tone: 'live', text: 'Preparando pedidos en 11 min', short: '11 min' })
  })

  it('cerrado dice cuándo abre', () => {
    const s = cityStatus(place({ isOpenNow: false }, { opensAt: '19:00' }))
    expect(s).toMatchObject({ tone: 'rest', text: 'Descansando · abre 19:00' })
  })

  it('salón lleno gana sobre todo lo demás', () => {
    const s = cityStatus(place({}, { salon: { level: 'full', freeTables: 0 }, delayMinutes: 10, pace: 'busy' }))
    expect(s.tone).toBe('warn')
    expect(s.short).toBe('Lleno')
    expect(s.text).toContain('retirar')
  })

  it('demora, cierre y apertura reciente', () => {
    expect(cityStatus(place({}, { delayMinutes: 15 })).text).toBe('Con demora · unos 26 min')
    expect(cityStatus(place({}, { minutesToClose: 20 })).text).toBe('Cierra en 20 min')
    expect(cityStatus(place({}, { minutesSinceOpen: 10 })).text).toBe('Acaba de abrir')
  })

  it('ritmo', () => {
    expect(cityStatus(place({}, { pace: 'busy' })).text).toBe('Mucho movimiento · listo en 11 min')
    expect(cityStatus(place({}, { pace: 'calm' })).text).toBe('Está tranquilo · listo en 11 min')
  })

  it('catálogo y directorio no prometen pedidos', () => {
    expect(cityStatus(place({ isOperational: false })).short).toBe('Carta')
    expect(cityStatus({ ...place(), type: 'listed', signals: null, isOpenNow: null }).tone).toBe('info')
  })
})

describe('cara del pin y oportunidad', () => {
  it('tres caras, nunca una cuarta', () => {
    expect(pinExpression(place())).toBe('happy')
    expect(pinExpression(place({}, { promo: { title: '2x1', count: 1 } }))).toBe('wink')
    expect(pinExpression(place({ isOpenNow: false }, { promo: { title: '2x1', count: 1 } }))).toBe('sleepy')
    expect(pinExpression(place({ acceptsOrders: false }))).toBe('sleepy')
  })

  it('una sola oportunidad: promo > nuevo > club', () => {
    const club = { name: 'Club Roma' }
    expect(cityOpportunity(place())).toBeNull()
    expect(cityOpportunity(place({}, { club }))).toMatchObject({ kind: 'club', text: 'Sumás en Club Roma' })
    expect(cityOpportunity(place({ isNew: true }, { club }))?.kind).toBe('new')
    expect(cityOpportunity(place({ isNew: true }, { club, promo: { title: '2x1 en pizzas', count: 3 } }))).toMatchObject({
      kind: 'promo',
      text: '2x1 en pizzas +2',
    })
  })
})

describe('la ciudad en conjunto', () => {
  const places = [
    { ...place({}, { promo: { title: '2x1', count: 1 } }), id: 'a', name: 'Roma', distanceM: 300 },
    { ...place({}, { salon: { level: 'calm', freeTables: 6 }, payments: { mp: true, cash: true, transfer: false } }), id: 'b', name: 'Lima', distanceM: 900 },
    { ...place({ isOpenNow: false }), id: 'c', name: 'Oslo', distanceM: 5000 },
  ]

  it('pulso', () => {
    expect(cityPulse(places)).toMatchObject({ open: 2, promos: 1, within15: 2, salonFree: 1 })
  })

  it('capas', () => {
    const ids = (layer: Parameters<typeof matchesLayer>[1]) => places.filter(p => matchesLayer(p, layer)).map(p => p.id)
    expect(ids('open')).toEqual(['a', 'b'])
    expect(ids('walk15')).toEqual(['a', 'b'])
    expect(ids('promo')).toEqual(['a'])
    expect(ids('salon')).toEqual(['b'])
    expect(ids('cash')).toEqual(['b'])
  })

  it('titular y novedades', () => {
    expect(cityHeadline(cityPulse(places), 21)).toBe('2 lugares para esta noche a 15 min a pie')
    expect(cityHeadline(cityPulse([places[2]]), 21)).toBe('La ciudad descansa por ahora')
    const feed = cityFeed(places)
    expect(feed[0]).toMatchObject({ kind: 'promo', placeId: 'a', text: 'Roma: 2x1' })
    expect(feed.some(f => f.placeId === 'c')).toBe(false)
  })
})
