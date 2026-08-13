import { describe, it, expect } from 'vitest'
import { calculateFinalTotal } from '@/lib/pricing'

const platformConfig = {
  platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 0 },
}

describe('calculateFinalTotal - transferencia', () => {
  const tenant = {
    paymentSurcharges: { transfer: { feePercent: 0 } },
    transfer: { commissionPercent: 1.5 },
  }

  it('1.5% comisión → markup simple (base × 1.015), no división inversa', () => {
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig)
    expect(r.finalTotal).toBe(71050)
    expect(r.surchargeAmount).toBe(1050)
    expect(r.surchargePercent).toBe(1.5)
  })

  it('la comisión registrada es 1.5% del precio de carta (no del final)', () => {
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig)
    expect(r.platformFeeAmount).toBe(1050)
  })

  it('0% comisión → sin recargo', () => {
    const t = { paymentSurcharges: { transfer: { feePercent: 0 } }, transfer: { commissionPercent: 0 } }
    const r = calculateFinalTotal(70000, 'transfer', t, platformConfig)
    expect(r.finalTotal).toBe(70000)
    expect(r.surchargeAmount).toBe(0)
    expect(r.surchargePercent).toBe(0)
    expect(r.platformFeeAmount).toBe(0)
  })
})

describe('calculateFinalTotal - mercadopago (sin cambios)', () => {
  const tenant = {
    mpOAuth: { isConnected: true, commissionPercent: 1 },
    paymentSurcharges: { mercadopago: { feePercent: 10 } },
  }
  const pc = { platformFees: { takeasygoCommissionPercent: 1 } }

  it('MP usa división inversa (fee sobre el final, no markup simple)', () => {
    const r = calculateFinalTotal(10000, 'mercadopago', tenant, pc)
    // 10% recargo + 1% comisión = 11% total → 10000 / 0.89 = 11235.95 → ceil 11236
    expect(r.finalTotal).toBe(11236)
    // el markup sobre la base es mayor al fee raw
    expect(r.surchargePercent).toBeGreaterThan(11)
  })
})
