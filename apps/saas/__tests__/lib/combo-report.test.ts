import { describe, it, expect } from 'vitest'
import { computeComboReport } from '@/lib/combos/report'

// Piloto 06/11: rendimiento de los combos (embudo + ventas).
const COMBO = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const OTRO = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const combos = [
  { _id: COMBO, name: 'Burger + papas', isActive: true, priceMode: 'fixed', fixedPrice: 1_000_000 },
  { _id: OTRO, name: 'Pizza x2', isActive: false, priceMode: 'sumItems', fixedPrice: null },
]
const at = new Date('2026-11-05T20:00:00Z')

function order(id: string, source: string, items: unknown[], extra: Record<string, unknown> = {}) {
  return { _id: id, source, status: 'delivered', payment: { status: 'approved' }, posPayments: source === 'pos' ? [{}] : null, createdAt: at, items, ...extra } as never
}
const parent = (q = 1) => ({ itemType: 'combo', comboId: COMBO, name: 'Burger + papas', quantity: q, subtotal: 1_000_000 * q })
const unit = (name: string) => ({ itemType: 'menuItem', comboId: COMBO, comboComponent: true, name, quantity: 1, subtotal: 0 })

describe('reporte de combos', () => {
  const report = computeComboReport({
    combos,
    timezone: 'America/Argentina/Buenos_Aires',
    events: [
      { comboId: COMBO, type: 'combo_impression', count: 40, sessions: 20 },
      { comboId: COMBO, type: 'combo_opened', count: 10, sessions: 8 },
      { comboId: COMBO, type: 'combo_add', count: 5, sessions: 5 },
      { comboId: 'cccccccccccccccccccccccc', type: 'combo_impression', count: 99, sessions: 99 },
    ],
    orders: [
      order('o1', 'web', [parent(2), unit('Burger'), unit('Papas')]),
      order('o2', 'pos', [parent(1), unit('Burger')], { posTableId: 'mesa-1' }),
      order('o3', 'web', [parent(1)], { status: 'cancelled' }),
      order('o4', 'pos', [parent(1)], { posPayments: null }),
    ],
  })
  const row = report.combos.find((c) => c.comboId === COMBO)!

  it('embudo online: vistas, aperturas y carrito con sus tasas', () => {
    expect(row.impressions).toBe(40)
    expect(row.uniqueViewers).toBe(20)
    expect(row.openRate).toBe(0.25)
    expect(row.addRate).toBe(0.5)
  })

  it('ventas cobradas de todos los canales (sin canceladas ni POS sin cobrar)', () => {
    expect(row.units).toBe(3)
    expect(row.orders).toBe(2)
    expect(row.revenue).toBe(3_000_000)
    expect(row.avgTicket).toBe(1_000_000)
    expect(row.byChannel.app.units).toBe(2)
    expect(row.byChannel.salon.units).toBe(1)
  })

  it('conversión online: compras online / carrito y / vistas únicas', () => {
    expect(row.checkoutRate).toBe(0.4)
    expect(row.conversionRate).toBe(0.1)
  })

  it('platos más elegidos y serie por día', () => {
    expect(row.topComponents[0]).toEqual({ name: 'Burger', quantity: 2 })
    expect(row.byDay).toEqual([{ date: '2026-11-05', units: 3, revenue: 3_000_000 }])
  })

  it('combos de otra sede no entran; un combo sin datos aparece en cero', () => {
    expect(report.combos.map((c) => c.comboId).sort()).toEqual([COMBO, OTRO].sort())
    const otro = report.combos.find((c) => c.comboId === OTRO)!
    expect(otro.units).toBe(0)
    expect(otro.openRate).toBeNull()
    expect(report.totals.impressions).toBe(40)
  })
})
