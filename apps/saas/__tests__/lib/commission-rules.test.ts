// ============================================================================
// commission-rules.test.ts — comisión manual por medio × modo (2026-10-25)
// ============================================================================
// Protege:
//   · sin matriz activada, la regla histórica EXACTA (transferencia +
//     delivery, la paga el cliente; efectivo nunca) — ningún tenant cambia
//     de precio hasta que el superadmin lo decida;
//   · con matriz: solo las combinaciones tildadas pagan, % por medio;
//   · el admin elige recargarla al cliente o absorberla;
//   · MercadoPago / Kripton no cambian (split automático);
//   · saneo de lo que manda el superadmin.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { calculateFinalTotal, getTotalFeesForMethod } from '@/lib/pricing'
import { chargedManualMethods, resolveManualCommission, sanitizeCommissionRules } from '@/lib/commission-rules'

const PLATFORM = { platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 4, takeasygoCashCommissionPercent: 2 } }
// $11.500 con $1.500 de envío ⇒ base de comisión $10.000 (centavos).
const BASE = 1_150_000
const DELIVERY = 150_000

describe('sin matriz activada: regla histórica sin cambios', () => {
  it('transferencia + delivery: la paga el cliente con el % global', () => {
    const r = calculateFinalTotal(BASE, 'transfer', {}, PLATFORM, undefined, 'delivery', DELIVERY)
    expect(r.platformFeeAmount).toBe(40_000)
    expect(r.platformFeeCustomerAmount).toBe(40_000)
    expect(r.finalTotal).toBe(BASE + 40_000)
  })
  it('transferencia take away y efectivo: sin comisión', () => {
    expect(calculateFinalTotal(1_000_000, 'transfer', { transfer: { commissionPercent: 5 } }, PLATFORM, undefined, 'takeaway', 0).platformFeeAmount).toBe(0)
    const cash = calculateFinalTotal(BASE, 'cash', {}, PLATFORM, undefined, 'delivery', DELIVERY)
    expect(cash.platformFeeAmount).toBe(0)
    expect(cash.finalTotal).toBe(BASE)
  })
  it('el admin no puede absorberla todavía: commissionPayer se ignora sin matriz', () => {
    const r = calculateFinalTotal(BASE, 'transfer', { commissionPayer: { transfer: 'merchant' } }, PLATFORM, undefined, 'delivery', DELIVERY)
    expect(r.platformFeeCustomerAmount).toBe(40_000)
  })
})

describe('con matriz del superadmin', () => {
  const rules = { enabled: true, cash: { modes: ['delivery'], percent: null }, transfer: { modes: ['takeaway'] } }

  it('efectivo + delivery paga con el % global de efectivo; recargado al cliente', () => {
    const r = calculateFinalTotal(BASE, 'cash', { commissionRules: rules }, PLATFORM, undefined, 'delivery', DELIVERY)
    expect(r.platformFeeAmount).toBe(20_000) // 2 % de $10.000
    expect(r.platformFeeCustomerAmount).toBe(20_000)
    expect(r.surchargeAmount).toBe(20_000)
    expect(r.surchargePercent).toBe(2)
    expect(r.finalTotal).toBe(BASE + 20_000)
  })

  it('efectivo + take away no está tildado: sin comisión', () => {
    expect(calculateFinalTotal(1_000_000, 'cash', { commissionRules: rules }, PLATFORM, undefined, 'takeaway', 0).platformFeeAmount).toBe(0)
  })

  it('transferencia + take away tildado paga; transferencia + delivery (ya no tildado) deja de pagar', () => {
    const t = { commissionRules: rules, transfer: { commissionPercent: 3 } }
    expect(calculateFinalTotal(1_000_000, 'transfer', t, PLATFORM, undefined, 'takeaway', 0).platformFeeAmount).toBe(30_000)
    expect(calculateFinalTotal(BASE, 'transfer', t, PLATFORM, undefined, 'delivery', DELIVERY).platformFeeAmount).toBe(0)
  })

  it('el comercio la absorbe: TakeasyGO cobra igual, el cliente paga el precio de carta', () => {
    const r = calculateFinalTotal(BASE, 'cash', { commissionRules: { ...rules, cash: { modes: ['delivery'], percent: 5 } }, commissionPayer: { cash: 'merchant' } }, PLATFORM, undefined, 'delivery', DELIVERY)
    expect(r.platformFeeAmount).toBe(50_000)
    expect(r.platformFeeCustomerAmount).toBe(0)
    expect(r.surchargeAmount).toBe(0)
    expect(r.finalTotal).toBe(BASE)
  })

  it('transferencia absorbida: el recargo propio del comercio sigue (delivery), la comisión no se recarga', () => {
    const t = { commissionRules: { enabled: true, transfer: { modes: ['delivery'] } }, commissionPayer: { transfer: 'merchant' as const }, transfer: { commissionPercent: 5 }, paymentSurcharges: { transfer: { feePercent: 2 } } }
    const r = calculateFinalTotal(BASE, 'transfer', t, PLATFORM, undefined, 'delivery', DELIVERY)
    expect(r.platformFeeAmount).toBe(50_000)
    expect(r.platformFeeCustomerAmount).toBe(0)
    expect(r.merchantSurchargeAmount).toBe(20_000)
    expect(r.surchargeAmount).toBe(20_000)
  })

  it('catálogo: lo que ve el cliente como recargo depende de quién paga', () => {
    const t = { commissionRules: { enabled: true, cash: { modes: ['takeaway'], percent: 3 } } }
    expect(getTotalFeesForMethod('cash', t, PLATFORM, undefined, 'takeaway')).toBeCloseTo(0.03)
    expect(getTotalFeesForMethod('cash', { ...t, commissionPayer: { cash: 'merchant' } }, PLATFORM, undefined, 'takeaway')).toBe(0)
    expect(getTotalFeesForMethod('cash', t, PLATFORM, undefined, 'delivery')).toBe(0)
  })

  it('MercadoPago no cambia con la matriz', () => {
    const plain = calculateFinalTotal(1_000_000, 'mercadopago', {}, PLATFORM, undefined, 'delivery', 0)
    const withRules = calculateFinalTotal(1_000_000, 'mercadopago', { commissionRules: { enabled: true, cash: { modes: ['delivery'], percent: 9 } }, commissionPayer: { cash: 'merchant' } }, PLATFORM, undefined, 'delivery', 0)
    expect(withRules).toEqual(plain)
  })

  it('sin modo de pedido (bug de caller) no cobra', () => {
    expect(resolveManualCommission('cash', undefined, { commissionRules: rules }, PLATFORM).percent).toBe(0)
  })
})

describe('saneo y helpers', () => {
  it('solo medios y modos conocidos; % fuera de rango rechazado', () => {
    const r = sanitizeCommissionRules({ enabled: true, cash: { modes: ['delivery', 'delivery', 'pos', 1], percent: '2.5' }, transfer: { modes: ['takeaway'] }, mercadopago: { modes: ['delivery'] } })
    expect(r).toEqual({ enabled: true, cash: { modes: ['delivery'], percent: 2.5 }, transfer: { modes: ['takeaway'] } })
    expect(() => sanitizeCommissionRules({ cash: { percent: 150 } })).toThrow()
    expect(sanitizeCommissionRules(null)).toEqual({ enabled: false, cash: { modes: [], percent: null }, transfer: { modes: [] } })
  })
  it('chargedManualMethods: histórico = transferencia; con matriz = los que tienen algún modo', () => {
    expect(chargedManualMethods({})).toEqual(['transfer'])
    expect(chargedManualMethods({ commissionRules: { enabled: true, cash: { modes: ['delivery'] }, transfer: { modes: [] } } })).toEqual(['cash'])
  })
})
