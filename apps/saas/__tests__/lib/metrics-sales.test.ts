import { describe, it, expect } from 'vitest'
import { computeSalesMetrics, saleChannelOf, isBilledSale, type MetricOrder } from '@/lib/metrics/sales'

/** Fase G (2026-10): métricas de ventas — fuente única, por canal. */
const at = (iso: string) => new Date(iso)
const base = (o: Partial<MetricOrder>): MetricOrder => ({ status: 'delivered', total: 0, createdAt: at('2026-10-24T23:00:00Z'), items: [], ...o })

const ORDERS: MetricOrder[] = [
  // Salón: mesa con 4 comensales (primera ronda) + segunda ronda sin comensales
  base({ source: 'pos', posTableId: 'm1', total: 10000, guests: 4, posPayments: [{ method: 'cash', amount: 10000 }],
    items: [{ name: 'Bife', categoryName: 'Principales', quantity: 2, subtotal: 10000 }] }),
  base({ source: 'pos', posTableId: 'm1', total: 2000, posPayments: [{ method: 'posnet_debit', amount: 2000 }],
    items: [{ name: 'Flan', categoryName: 'Postres', quantity: 2, subtotal: 2000, posDiscount: { amountCents: 500 } }] }),
  // Mostrador
  base({ source: 'pos', total: 3000, posPayments: [{ method: 'cash', amount: 3000 }], items: [{ name: 'Café', quantity: 3, subtotal: 3000, menuItemId: 'cafe' }] }),
  // App TakeasyGO
  base({ source: 'takeasygo', total: 5000, payment: { method: 'mercadopago', status: 'approved' }, items: [{ name: 'Pizza', categoryName: 'Pizzas', quantity: 1, subtotal: 5000 }] }),
  // Delivery externo
  base({ source: 'external', channel: 'rappi', total: 4000, payment: { method: 'mercadopago', status: 'approved' } }),
  // No cuentan: ronda del POS sin cobrar, pedido cancelado, pago rechazado
  base({ source: 'pos', posTableId: 'm2', status: 'confirmed', total: 9999 }),
  base({ source: 'takeasygo', status: 'cancelled', total: 7777 }),
  base({ source: 'takeasygo', total: 6666, payment: { status: 'rejected' } }),
  // Anulada: se informa aparte
  base({ source: 'pos', total: 1500, posPayments: [{ method: 'cash', amount: 1500 }], voided: { at: at('2026-10-24T23:30:00Z') },
    itemVoids: [{ quantity: 1, unitPrice: 800, wasted: true }] }),
]

describe('saleChannelOf / isBilledSale', () => {
  it('mesa → salón, POS sin mesa → mostrador, online → app, plataforma → delivery', () => {
    expect(saleChannelOf({ source: 'pos', posTableId: 'x' })).toBe('salon')
    expect(saleChannelOf({ source: 'pos' })).toBe('mostrador')
    expect(saleChannelOf({ source: 'takeasygo' })).toBe('app')
    expect(saleChannelOf({ source: 'external', channel: 'pedidosya' })).toBe('delivery')
  })
  it('una ronda del POS sin cobrar no es venta', () => {
    expect(isBilledSale(base({ source: 'pos', status: 'confirmed', total: 1 }))).toBe(false)
  })
})

describe('computeSalesMetrics', () => {
  const m = computeSalesMetrics(ORDERS, { categoryByItem: new Map([['cafe', 'Cafetería']]) })

  it('totales y desglose por canal, sin mezclar', () => {
    expect(m.totals).toMatchObject({ sales: 5, revenue: 24000, avgTicket: 4800 })
    expect(m.byChannel.salon).toMatchObject({ sales: 2, revenue: 12000, avgTicket: 6000, guests: 4 })
    expect(m.byChannel.mostrador).toMatchObject({ sales: 1, revenue: 3000 })
    expect(m.byChannel.app).toMatchObject({ sales: 1, revenue: 5000 })
    expect(m.byChannel.delivery).toMatchObject({ sales: 1, revenue: 4000 })
  })

  it('comensales solo de salón y ticket por comensal = ingresos de salón ÷ comensales', () => {
    expect(m.totals.guests).toBe(4)
    expect(m.totals.perGuest).toBe(3000)
  })

  it('anuladas y platos quitados aparte; descuentos sumados', () => {
    expect(m.totals.voided).toEqual({ count: 1, amount: 1500 })
    expect(m.totals.itemVoids).toEqual({ count: 1, amount: 800, wasteAmount: 800 })
    expect(m.totals.discounts).toBe(500)
  })

  it('métodos de pago (cobro partido del POS por método) y categorías (con la vigente de la carta)', () => {
    expect(m.byPayment.find((p) => p.method === 'cash')).toMatchObject({ amount: 13000, count: 2 })
    expect(m.byPayment.find((p) => p.method === 'mercadopago')).toMatchObject({ amount: 9000 })
    expect(m.byCategory.map((c) => c.category)).toEqual(['Principales', 'Pizzas', 'Cafetería', 'Postres'])
  })

  it('ventas por hora en la zona de la sede (23:00 UTC = 20 h en Argentina)', () => {
    expect(m.byHour[20]).toMatchObject({ sales: 5, revenue: 24000 })
  })
})
