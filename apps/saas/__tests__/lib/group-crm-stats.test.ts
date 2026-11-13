// Etapa 4 (F7 nivel 1): CRM del grupo — cálculos puros.
import { describe, it, expect } from 'vitest'
import { computeCrmStats, maskPhone, matchesFilter, type GroupCustomer } from '@/lib/organizations/group-crm-stats'

const NOW = new Date('2026-11-13T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
function c(key: string, brands: Array<[string, number, number, number]>): GroupCustomer {
  return { key, consumerId: null, brands: brands.map(([tenantId, orders, spent, ago]) => ({ tenantId, orders, spent, lastOrderAt: daysAgo(ago) })) }
}

// A, B, C = marcas.
const customers = [
  c('1', [['A', 2, 2000, 5]]),
  c('2', [['A', 1, 1000, 40], ['B', 3, 3000, 10]]),
  c('3', [['B', 1, 500, 200]]),
  c('4', [['A', 1, 1000, 1], ['B', 1, 1000, 1], ['C', 2, 4000, 1]]),
  c('5', [['Z', 9, 9000, 1]]), // marca fuera del alcance: no cuenta
]

describe('computeCrmStats', () => {
  it('cuenta clientes por cantidad de marcas, cruces y gasto promedio', () => {
    const s = computeCrmStats(customers, ['A', 'B', 'C'], undefined, NOW)
    expect(s.customers).toBe(4)
    expect(s.byBrandCount).toEqual([2, 1, 1])
    expect(s.multiBrandPct).toBe(50)
    expect(s.single).toEqual({ avgSpent: 1250, avgOrders: 1.5 })
    expect(s.multi).toEqual({ avgSpent: 5000, avgOrders: 4 })
    expect(s.brands.map((b) => [b.tenantId, b.customers, b.exclusive, b.shared])).toEqual([['A', 3, 1, 2], ['B', 3, 1, 2], ['C', 1, 0, 1]])
    expect(s.overlap).toEqual([[0, 2, 1], [2, 0, 1], [1, 1, 0]])
    expect(s.segment.count).toBe(4)
  })

  it('segmento «fue a A pero no a C», activo en 60 días', () => {
    const s = computeCrmStats(customers, ['A', 'B', 'C'], { went: ['A'], notWent: ['C'], minBrands: 1, activeDays: 60 }, NOW)
    expect(s.segment).toEqual({ count: 2, spent: 6000, orders: 6 }) // clientes 1 y 2
  })

  it('una marca fuera del alcance no cuenta para «varias marcas» ni para los filtros', () => {
    const only = [c('x', [['A', 1, 100, 1], ['Z', 5, 5000, 1]])]
    const s = computeCrmStats(only, ['A'], { went: [], notWent: [], minBrands: 2, activeDays: null }, NOW)
    expect(s.byBrandCount).toEqual([1, 0, 0])
    expect(s.segment.count).toBe(0)
  })
})

describe('matchesFilter y maskPhone', () => {
  it('mínimo de marcas y última compra', () => {
    expect(matchesFilter(customers[3], { went: [], notWent: [], minBrands: 3, activeDays: null }, NOW)).toBe(true)
    expect(matchesFilter(customers[2], { went: [], notWent: [], minBrands: 1, activeDays: 180 }, NOW)).toBe(false)
  })
  it('solo los últimos 4 dígitos', () => {
    expect(maskPhone('+54 9 11 5555-1234')).toBe('•••• 1234')
    expect(maskPhone('12')).toBeNull()
    expect(maskPhone(null)).toBeNull()
  })
})
