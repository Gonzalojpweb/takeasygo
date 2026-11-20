// Comisión de envío de TakeasyGO sobre Rapiboy (20/11/2026):
//  · el % que se suma al precio de Rapiboy es comisión de TakeasyGO en TODOS
//    los medios (MP: dentro del split; transferencia/efectivo: saldo semanal);
//  · en transferencia la comisión del pedido incluye el envío (igual que MP),
//    sin cobrar comisión sobre la comisión de envío;
//  · el comercio la ve en su ticket; el superadmin, el desglose completo.
import { describe, it, expect } from 'vitest'
import { calculateFinalTotal, deliveryPlatformFeeOf } from '@/lib/pricing'
import { ticketFromOrder } from '@/lib/commission-tickets'
import { breakdownRow, buildRapiboyBreakdown, collectionChannelOf } from '@/lib/rapiboy/breakdown'

// Pedido: productos $10.000 + envío $2.400 (Rapiboy $2.000 + 20 % = $400).
const PRODUCTS = 1_000_000
const RAPIBOY = 200_000
const FEE = deliveryPlatformFeeOf(RAPIBOY, 20) // 40_000
const DELIVERY = RAPIBOY + FEE
const BASE = PRODUCTS + DELIVERY

describe('deliveryPlatformFeeOf', () => {
  it('% sobre el costo de Rapiboy; sin costo o sin % → 0', () => {
    expect(FEE).toBe(40_000)
    expect(deliveryPlatformFeeOf(0, 20)).toBe(0)
    expect(deliveryPlatformFeeOf(RAPIBOY, 0)).toBe(0)
  })
})

describe('Mercado Pago: la comisión de envío viaja en el split', () => {
  const tenant = { mpOAuth: { isConnected: true, commissionPercent: 1 } }
  const pc = { platformFees: { takeasygoCommissionPercent: 1 } }

  it('platformFeeAmount = comisión del pedido + comisión de envío', () => {
    const sin = calculateFinalTotal(BASE, 'mercadopago', tenant, pc, undefined, 'delivery', DELIVERY)
    const con = calculateFinalTotal(BASE, 'mercadopago', tenant, pc, undefined, 'delivery', DELIVERY, FEE)
    expect(con.platformFeeAmount).toBe(sin.platformFeeAmount + FEE)
    expect(con.deliveryPlatformFeeAmount).toBe(FEE)
    // El cliente paga lo mismo: la comisión de envío ya está en el envío.
    expect(con.finalTotal).toBe(sin.finalTotal)
  })

  it('sin comisión configurada igual se cobra la de envío (TakeasyGO nunca pierde)', () => {
    const r = calculateFinalTotal(BASE, 'mercadopago', {}, { platformFees: { takeasygoCommissionPercent: 0 } }, 0, 'delivery', DELIVERY, FEE)
    expect(r.platformFeeAmount).toBe(FEE)
    expect(r.finalTotal).toBe(BASE)
  })
})

describe('Transferencia: igual que Mercado Pago', () => {
  const pc = { platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 4 } }

  it('comisión del pedido sobre productos + envío (sin la comisión de envío) + comisión de envío', () => {
    const r = calculateFinalTotal(BASE, 'transfer', {}, pc, undefined, 'delivery', DELIVERY, FEE)
    const orderFee = Math.ceil((BASE - FEE) * 4 / 100) // 4 % de $12.000 = $480
    expect(orderFee).toBe(48_000)
    expect(r.platformFeeAmount).toBe(orderFee + FEE)
    expect(r.deliveryPlatformFeeAmount).toBe(FEE)
    // El cliente paga la comisión del pedido como recargo; la de envío ya va en el envío.
    expect(r.surchargeAmount).toBe(orderFee)
    expect(r.platformFeeCustomerAmount).toBe(orderFee + FEE)
    expect(r.finalTotal).toBe(BASE + orderFee)
  })

  it('el recargo propio del comercio sigue siendo solo sobre productos', () => {
    const r = calculateFinalTotal(BASE, 'transfer', { paymentSurcharges: { transfer: { feePercent: 2 } } }, pc, undefined, 'delivery', DELIVERY, FEE)
    expect(r.merchantSurchargeAmount).toBe(20_000)
  })

  it('comercio que absorbe la comisión: igual paga la de envío el cliente (va en el envío)', () => {
    const t = { commissionRules: { enabled: true, transfer: { modes: ['delivery'] } }, commissionPayer: { transfer: 'merchant' as const }, transfer: { commissionPercent: 5 } }
    const r = calculateFinalTotal(BASE, 'transfer', t, pc, undefined, 'delivery', DELIVERY, FEE)
    expect(r.platformFeeAmount).toBe(Math.ceil((BASE - FEE) * 5 / 100) + FEE)
    expect(r.platformFeeCustomerAmount).toBe(FEE)
    expect(r.surchargeAmount).toBe(0)
  })
})

describe('Efectivo: la comisión de envío entra en el saldo', () => {
  it('sin comisión de efectivo, queda solo la de envío', () => {
    const r = calculateFinalTotal(BASE, 'cash', {}, { platformFees: { takeasygoCommissionPercent: 1 } }, undefined, 'delivery', DELIVERY, FEE)
    expect(r.platformFeeAmount).toBe(FEE)
    expect(r.surchargeAmount).toBe(0)
    expect(r.finalTotal).toBe(BASE)
  })
})

describe('Ticket semanal del comercio', () => {
  it('separa comisión del pedido y comisión de envío; el recargo no incluye la de envío', () => {
    const t = ticketFromOrder({
      _id: 'a' as never, orderNumber: 'T-1', createdAt: new Date('2026-11-20T15:00:00Z'), total: BASE + 48_000, deliveryCost: DELIVERY,
      payment: { baseTotal: BASE, surchargeAmount: 48_000, platformFeeAmount: 48_000 + FEE, platformFeeCustomerAmount: 48_000 + FEE, merchantSurchargeAmount: 0, deliveryPlatformFeeAmount: FEE },
    }, false)
    expect(t.deliveryPlatformFeeCents).toBe(FEE)
    expect(t.customerFeeCents).toBe(48_000)
    expect(t.commissionCents).toBe(88_000)
    expect(t.productsCents).toBe(PRODUCTS)
    expect(t.deliveryCents).toBe(DELIVERY)
    expect(t.origin).toBe('customer')
  })
})

describe('Desglose del superadmin', () => {
  const base = {
    _id: 'o1', tenantId: 't1', orderNumber: 'T-1', createdAt: new Date('2026-11-20T15:00:00Z'), status: 'delivered',
    deliveryCost: DELIVERY,
    payment: { method: 'mercadopago', status: 'approved', platformFeeAmount: 1_250 + FEE, deliveryPlatformFeeAmount: FEE },
    deliveryProvider: { rapiboy: { checkoutCost: RAPIBOY, quotedCost: RAPIBOY, tripId: '900001', transferBuffer: 0, platformFeePercent: 20 } },
  }

  it('fila: Rapiboy, comisión de envío, comisión del pedido y cobro por split', () => {
    const r = breakdownRow(base, { name: 'Parrilla', slug: 'parrilla' })
    expect(r).toMatchObject({
      deliveryChargedCents: DELIVERY, rapiboyQuotedCents: RAPIBOY, rapiboyActualCents: RAPIBOY,
      deliveryFeeCents: FEE, deliveryFeePercent: 20, orderFeeCents: 1_250, totalFeeCents: 1_250 + FEE,
      merchantDeliveryResultCents: 0, collection: 'mp_split', tenantName: 'Parrilla',
    })
  })

  it('si el viaje salió más caro, lo absorbe el comercio; la comisión de TakeasyGO no cambia', () => {
    const r = breakdownRow({ ...base, deliveryProvider: { rapiboy: { ...base.deliveryProvider.rapiboy, quotedCost: 230_000 } } })
    expect(r.rapiboyActualCents).toBe(230_000)
    expect(r.merchantDeliveryResultCents).toBe(-30_000)
    expect(r.deliveryFeeCents).toBe(FEE)
  })

  it('viaje sin pedir: costo real null, se usa la cotización', () => {
    const r = breakdownRow({ ...base, deliveryProvider: { rapiboy: { ...base.deliveryProvider.rapiboy, tripId: '' } } })
    expect(r.rapiboyActualCents).toBeNull()
    expect(r.merchantDeliveryResultCents).toBe(0)
  })

  it('cómo se cobra: split, saldo semanal o nada', () => {
    expect(collectionChannelOf(base)).toBe('mp_split')
    expect(collectionChannelOf({ ...base, payment: { ...base.payment, status: 'pending' } })).toBe('not_collected')
    expect(collectionChannelOf({ ...base, payment: { ...base.payment, method: 'transfer' } })).toBe('weekly_balance')
    expect(collectionChannelOf({ ...base, payment: { ...base.payment, method: 'cash', status: 'pending' } })).toBe('weekly_balance')
    expect(collectionChannelOf({ ...base, status: 'cancelled' })).toBe('not_collected')
  })

  it('totales por canal', () => {
    const b = buildRapiboyBreakdown(
      [base, { ...base, _id: 'o2', payment: { ...base.payment, method: 'transfer' } }],
      new Map([['t1', { name: 'Parrilla', slug: 'parrilla' }]]),
    )
    expect(b.totals.orders).toBe(2)
    expect(b.totals.deliveryFeeCents).toBe(2 * FEE)
    expect(b.totals.viaMpSplitCents).toBe(1_250 + FEE)
    expect(b.totals.viaWeeklyBalanceCents).toBe(1_250 + FEE)
    expect(b.totals.rapiboyCents).toBe(2 * RAPIBOY)
  })
})
