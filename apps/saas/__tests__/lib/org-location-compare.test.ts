// Etapa 2 (F4 + F6): tabla «Comparar sedes» y señales del personal — lógica pura.
import { describe, it, expect } from 'vitest'
import { buildLocationComparison, extremes } from '@/lib/organizations/location-compare'
import { emptyCounters, staffFlags, addCounters, hasActivity } from '@/lib/organizations/staff-counters'
import type { LocationRank } from '@/lib/organizations/dashboard'

function loc(over: Partial<LocationRank> = {}): LocationRank {
  return {
    brandSlug: 'alfa', brandName: 'Alfa', locationId: 'L', name: 'Sede',
    revenue: 100_000, prevRevenue: 80_000, sales: 10, prevSales: 8, avgTicket: 10_000, prevAvgTicket: 10_000,
    guests: 0, perGuest: 0, share: 50, discounts: 0, voided: { count: 0, amount: 0 }, itemVoids: { count: 0, amount: 0 },
    margin: null, byChannel: { salon: 100_000, mostrador: 0, app: 0, delivery: 0 },
    ...over,
  }
}

describe('extremes', () => {
  it('mejor y peor según la dirección; empate o un solo valor: sin marca', () => {
    expect(extremes([10, 30, 20], 'high')).toEqual({ best: 1, worst: 0 })
    expect(extremes([10, 30, 20], 'low')).toEqual({ best: 0, worst: 1 })
    expect(extremes([5, 5], 'high')).toEqual({ best: null, worst: null })
    expect(extremes([5, null], 'high')).toEqual({ best: null, worst: null })
    expect(extremes([5, 9], null)).toEqual({ best: null, worst: null })
  })
})

describe('buildLocationComparison', () => {
  it('con una sola sede con movimiento no hay tabla', () => {
    expect(buildLocationComparison([loc(), loc({ locationId: 'B', revenue: 0, prevRevenue: 0 })]).rows).toEqual([])
  })

  it('sedes en columnas; descuentos y anulaciones: menos es mejor; canales sin ventas no aparecen', () => {
    const { columns, rows } = buildLocationComparison([
      loc({ locationId: 'A', name: 'Centro', revenue: 90_000, discounts: 10_000, margin: { marginPct: 65, coveragePct: 80 }, byChannel: { salon: 90_000, mostrador: 0, app: 0, delivery: 0 } }),
      loc({ locationId: 'B', name: 'Norte', revenue: 50_000, sales: 4, avgTicket: 12_500, discounts: 0, margin: { marginPct: 70, coveragePct: 60 }, byChannel: { salon: 30_000, mostrador: 20_000, app: 0, delivery: 0 } }),
    ])
    expect(columns.map(c => c.name)).toEqual(['Centro', 'Norte'])
    const byId = Object.fromEntries(rows.map(r => [r.id, r]))
    expect(byId.revenue).toMatchObject({ values: [90_000, 50_000], best: 0, worst: 1, prev: [80_000, 80_000] })
    expect(byId.avgTicket).toMatchObject({ best: 1, worst: 0 })
    expect(byId.discounts).toMatchObject({ values: [10, 0], best: 1, worst: 0 }) // 10.000 / 100.000
    expect(byId.margin).toMatchObject({ values: [65, 70], best: 1 })
    expect(byId.perGuest.values).toEqual([null, null])
    expect(byId['channel-salon'].values).toEqual([100, 60])
    expect(byId['channel-mostrador'].values).toEqual([0, 40])
    expect(byId['channel-app']).toBeUndefined()
    expect(byId['channel-salon'].best).toBeNull()
  })
})

describe('staffFlags', () => {
  it('marca anulaciones altas, platos anulados altos y cierres con diferencia', () => {
    const c = emptyCounters()
    expect(staffFlags(c)).toEqual([])
    c.payments = { count: 20, amount: 1_000_000 }
    c.voidsRequested = { count: 2, amount: 60_000 } // 6%
    c.itemVoids = { count: 3, amount: 10_000, wasted: 0 } // 1%
    c.closesWithDifference = 1
    expect(staffFlags(c)).toEqual(['many_voids', 'cash_difference'])
    c.voidsRequested = { count: 1, amount: 900_000 } // una sola: no marca
    expect(staffFlags(c)).toEqual(['cash_difference'])
  })

  it('suma contadores y detecta si hubo actividad', () => {
    const a = emptyCounters()
    expect(hasActivity(a)).toBe(false)
    a.registersOpened = 1
    const b = emptyCounters()
    b.payments = { count: 2, amount: 500 }
    const s = addCounters(a, b)
    expect(s).toMatchObject({ registersOpened: 1, payments: { count: 2, amount: 500 } })
    expect(hasActivity(s)).toBe(true)
  })
})
