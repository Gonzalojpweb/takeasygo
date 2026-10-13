import { describe, it, expect } from 'vitest'
import { buildReportStats, isBilledOrder } from '@/lib/report-stats'

const TZ = 'America/Argentina/Buenos_Aires'

function order(overrides: Partial<Parameters<typeof buildReportStats>[0][number]> = {}) {
  return {
    status: 'confirmed',
    total: 10000,
    createdAt: new Date('2026-10-06T15:00:00Z'),
    items: [{ name: 'Pizza', quantity: 1, subtotal: 10000 }],
    payment: {
      method: 'mercadopago',
      status: 'approved',
      baseTotal: 10000,
      surchargeAmount: 0,
      platformFeeAmount: 500,
    },
    ...overrides,
  }
}

describe('buildReportStats — regla de facturación', () => {
  it('excluye órdenes canceladas de ingresos pero las contabiliza', () => {
    const stats = buildReportStats([
      order(),
      order({ status: 'cancelled', total: 5000 }),
    ], TZ)

    expect(stats.totalOrders).toBe(2)
    expect(stats.billedOrders).toBe(1)
    expect(stats.cancelledOrders).toBe(1)
    expect(stats.grossRevenue).toBe(10000)
    expect(stats.cancelledAmount).toBe(5000)
  })

  it('excluye pagos rechazados/cancelados aunque la orden esté activa (ingreso fantasma)', () => {
    const stats = buildReportStats([
      order(),
      order({ total: 7000, payment: { method: 'mercadopago', status: 'rejected', baseTotal: 7000, surchargeAmount: 0, platformFeeAmount: 0 } }),
      order({ total: 8000, payment: { method: 'mercadopago', status: 'cancelled', baseTotal: 8000, surchargeAmount: 0, platformFeeAmount: 0 } }),
    ], TZ)

    expect(stats.billedOrders).toBe(1)
    expect(stats.rejectedPaymentOrders).toBe(2)
    expect(stats.rejectedAmount).toBe(15000)
    expect(stats.grossRevenue).toBe(10000)
  })

  it('excluye órdenes awaiting_payment (esperando pago del cliente) de ingresos', () => {
    const stats = buildReportStats([
      order(),
      order({ status: 'awaiting_payment', total: 15000, payment: { method: 'mercadopago', status: 'pending', baseTotal: 15000, surchargeAmount: 0, platformFeeAmount: 0 } }),
    ], TZ)

    expect(stats.billedOrders).toBe(1)
    expect(stats.awaitingPaymentOrders).toBe(1)
    expect(stats.awaitingPaymentAmount).toBe(15000)
    expect(stats.grossRevenue).toBe(10000)
    expect(stats.pendingPaymentOrders).toBe(0)
  })

  it('incluye pagos pending en ingresos pero los reporta como pendientes de confirmar', () => {
    const stats = buildReportStats([
      order({ total: 12000, payment: { method: 'transfer', status: 'pending', baseTotal: 12000, surchargeAmount: 0, platformFeeAmount: 300 } }),
    ], TZ)

    expect(stats.billedOrders).toBe(1)
    expect(stats.pendingPaymentOrders).toBe(1)
    expect(stats.pendingPaymentAmount).toBe(12000)
    expect(stats.grossRevenue).toBe(12000)
  })

  it('las órdenes muy viejas sin estado de pago NO se excluyen (solo rechazo explícito)', () => {
    const stats = buildReportStats([
      order({ total: 9000, payment: { method: 'cash', status: null, baseTotal: 9000, surchargeAmount: 0, platformFeeAmount: 0 } }),
    ], TZ)

    expect(stats.billedOrders).toBe(1)
    expect(stats.grossRevenue).toBe(9000)
  })
})

describe('buildReportStats — comisiones y neto por método', () => {
  it('suma solo comisiones auto-cobradas (MP/Kripton) en autoCollectedFee', () => {
    const stats = buildReportStats([
      order({ payment: { method: 'mercadopago', status: 'approved', baseTotal: 10000, surchargeAmount: 0, platformFeeAmount: 500 } }),
      order({ payment: { method: 'transfer', status: 'approved', baseTotal: 10000, surchargeAmount: 0, platformFeeAmount: 200 } }),
      order({ payment: { method: 'kripton', status: 'approved', baseTotal: 10000, surchargeAmount: 0, platformFeeAmount: 300 } }),
    ], TZ)

    expect(stats.autoCollectedFee).toBe(800) // MP 500 + Kripton 300, sin transfer
  })

  it('netToRestaurant: MP resta la comisión; transfer deja el bruto íntegro', () => {
    const stats = buildReportStats([
      order({ total: 10500, payment: { method: 'mercadopago', status: 'approved', baseTotal: 10000, surchargeAmount: 500, platformFeeAmount: 525 } }),
      order({ total: 10000, payment: { method: 'transfer', status: 'approved', baseTotal: 10000, surchargeAmount: 0, platformFeeAmount: 250 } }),
    ], TZ)

    const mp = stats.methods.find(m => m.method === 'mercadopago')!
    const tr = stats.methods.find(m => m.method === 'transfer')!

    expect(mp.netToRestaurant).toBe(10500 - 525)
    expect(tr.netToRestaurant).toBe(10000) // recibió el total; la comisión se paga aparte
    expect(mp.surcharge).toBe(500)
  })

  it('las sumas por método cierran exactamente contra los totales', () => {
    const stats = buildReportStats([
      order({ total: 10000, payment: { method: 'mercadopago', status: 'approved', baseTotal: 9500, surchargeAmount: 500, platformFeeAmount: 500 } }),
      order({ total: 12000, payment: { method: 'transfer', status: 'approved', baseTotal: 12000, surchargeAmount: 0, platformFeeAmount: 300 } }),
      order({ status: 'cancelled', total: 4000 }),
    ], TZ)

    const sumGross = stats.methods.reduce((s, m) => s + m.gross, 0)
    const sumNet = stats.methods.reduce((s, m) => s + m.net, 0)
    const sumSurcharge = stats.methods.reduce((s, m) => s + m.surcharge, 0)

    expect(sumGross).toBe(stats.grossRevenue)
    expect(sumNet).toBe(stats.netRevenue)
    expect(sumSurcharge).toBe(stats.surchargeRevenue)
    expect(stats.grossRevenue).toBe(22000)
  })
})

describe('buildReportStats — agrupaciones', () => {
  it('agrupa por día en la zona horaria del restaurante', () => {
    // 2026-10-06 15:00 UTC = 12:00 ART (mismo día); 2026-10-07 02:00 UTC = 23:00 ART del 6
    const stats = buildReportStats([
      order({ createdAt: new Date('2026-10-06T15:00:00Z'), total: 10000 }),
      order({ createdAt: new Date('2026-10-07T02:00:00Z'), total: 20000 }),
      order({ createdAt: new Date('2026-10-07T12:00:00Z'), total: 30000 }), // 09:00 ART del 7
    ], TZ)

    expect(stats.daily).toHaveLength(2)
    const label6 = new Date('2026-10-06T15:00:00Z').toLocaleDateString('es-AR', { timeZone: TZ })
    const label7 = new Date('2026-10-07T12:00:00Z').toLocaleDateString('es-AR', { timeZone: TZ })
    const day6 = stats.daily.find(d => d.date === label6)!
    const day7 = stats.daily.find(d => d.date === label7)!
    expect(day6.gross).toBe(30000)
    expect(day7.gross).toBe(30000)
  })

  it('los items solo salen de órdenes facturadas', () => {
    const stats = buildReportStats([
      order({ items: [{ name: 'Empanada', quantity: 3, subtotal: 6000 }] }),
      order({ status: 'cancelled', items: [{ name: 'Empanada', quantity: 10, subtotal: 20000 }] }),
      order({ items: [{ name: 'Pizza', quantity: 1, subtotal: 8000 }] }),
    ], TZ)

    const empanadas = stats.topItems.find(i => i.name === 'Empanada')!
    expect(empanadas.quantity).toBe(3)
    expect(stats.topItems[0].name).toBe('Empanada')
  })

  it('tickets promedio se calculan sobre facturadas', () => {
    const stats = buildReportStats([
      order({ total: 10000, payment: { method: 'cash', status: 'approved', baseTotal: 10000, surchargeAmount: 0, platformFeeAmount: 0 } }),
      order({ total: 20000, payment: { method: 'cash', status: 'approved', baseTotal: 18000, surchargeAmount: 2000, platformFeeAmount: 0 } }),
      order({ status: 'cancelled', total: 99999 }),
    ], TZ)

    expect(stats.avgTicketGross).toBe(15000)
    expect(stats.avgTicketNet).toBe(14000)
  })
})

describe('isBilledOrder', () => {
  it('aplica la misma regla que el builder', () => {
    expect(isBilledOrder(order())).toBe(true)
    expect(isBilledOrder(order({ status: 'cancelled' }))).toBe(false)
    expect(isBilledOrder(order({ status: 'awaiting_payment' }))).toBe(false)
    expect(isBilledOrder(order({ payment: { method: 'mp', status: 'rejected', baseTotal: 0, surchargeAmount: 0, platformFeeAmount: 0 } }))).toBe(false)
    expect(isBilledOrder(order({ payment: { method: 'mp', status: 'pending', baseTotal: 0, surchargeAmount: 0, platformFeeAmount: 0 } }))).toBe(true)
  })
})
