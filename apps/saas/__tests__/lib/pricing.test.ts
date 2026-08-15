import { describe, it, expect } from 'vitest'
import { calculateFinalTotal, getTotalFeesForMethod } from '@/lib/pricing'

const platformConfig = {
  platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 0 },
}

describe('calculateFinalTotal - transferencia', () => {
  const tenant = {
    paymentSurcharges: { transfer: { feePercent: 2 } }, // Incluso si existiera feePercent en paymentSurcharges, transferencia no cobra recargo tenant
    transfer: { commissionPercent: 1.5 }, // 1.5% comisión de plataforma TakeasyGO
  }

  it('Transferencia + Delivery → cobra únicamente la comisión de transferencia (1.5%)', () => {
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig, undefined, 'delivery')
    expect(r.finalTotal).toBe(71050) // 70000 * 1.015
    expect(r.surchargeAmount).toBe(1050)
    expect(r.surchargePercent).toBe(1.5)
    expect(r.platformFeeAmount).toBe(1050) // 1.5% de 70000
  })

  it('Transferencia + Takeaway → NO cobra NINGÚN monto extra (0% recargo, 0% comisión = Precio de Carta)', () => {
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig, undefined, 'takeaway')
    expect(r.finalTotal).toBe(70000) // Precio de carta puro
    expect(r.surchargeAmount).toBe(0)
    expect(r.surchargePercent).toBe(0)
    expect(r.platformFeeAmount).toBe(0)
  })

  it('Transferencia + Sin mode (fallback seguro) → NO cobra NINGÚN monto extra (0%)', () => {
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig)
    expect(r.finalTotal).toBe(70000)
    expect(r.surchargeAmount).toBe(0)
    expect(r.surchargePercent).toBe(0)
    expect(r.platformFeeAmount).toBe(0)
  })

  it('getTotalFeesForMethod para transfer devuelve 0 en takeaway y commissionPercent en delivery', () => {
    const deliveryFees = getTotalFeesForMethod('transfer', tenant, platformConfig, undefined, 'delivery')
    const takeawayFees = getTotalFeesForMethod('transfer', tenant, platformConfig, undefined, 'takeaway')

    expect(deliveryFees).toBe(0.015) // 1.5%
    expect(takeawayFees).toBe(0) // 0%
  })
})

describe('calculateFinalTotal - mercadopago (sin cambios)', () => {
  const tenant = {
    mpOAuth: { isConnected: true, commissionPercent: 1 },
    paymentSurcharges: { mercadopago: { feePercent: 10 } },
  }
  const pc = { platformFees: { takeasygoCommissionPercent: 1 } }

  it('MP cobra comisión tanto en takeaway como en delivery', () => {
    const rTakeaway = calculateFinalTotal(10000, 'mercadopago', tenant, pc, undefined, 'takeaway')
    const rDelivery = calculateFinalTotal(10000, 'mercadopago', tenant, pc, undefined, 'delivery')

    expect(rTakeaway.platformFeeAmount).toBeGreaterThan(0)
    expect(rDelivery.platformFeeAmount).toBeGreaterThan(0)
    expect(rTakeaway.finalTotal).toBe(rDelivery.finalTotal)
  })
})

