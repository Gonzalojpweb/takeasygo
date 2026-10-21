import { describe, it, expect } from 'vitest'
import { withLocationCommercialSettings, isClubDiscountEnabledForLocation } from '@/lib/location-resolvers'
import { calculateFinalTotal } from '@/lib/pricing'

const tenant = {
  paymentSurcharges: {
    mercadopago: { feePercent: 5 },
    kripton: { feePercent: 3 },
    transfer: { feePercent: 2 },
  },
  paymentMethodsVisibility: { mercadopago: true, kripton: true },
}

describe('withLocationCommercialSettings — tenant con override por sede', () => {
  it('sin settings de sede devuelve el tenant tal cual', () => {
    expect(withLocationCommercialSettings(tenant, null)).toBe(tenant)
  })

  it('recargo propio de la sede reemplaza al del tenant; null hereda', () => {
    const t = withLocationCommercialSettings(tenant, {
      paymentSurcharges: { mercadopago: { feePercent: 8 }, kripton: { feePercent: null } },
    })
    expect(t.paymentSurcharges.mercadopago.feePercent).toBe(8)
    expect(t.paymentSurcharges.kripton.feePercent).toBe(3)
    expect(t.paymentSurcharges.transfer.feePercent).toBe(2)
  })

  it('recargo 0 en la sede es un valor propio (no hereda)', () => {
    const t = withLocationCommercialSettings(tenant, { paymentSurcharges: { mercadopago: { feePercent: 0 } } })
    expect(t.paymentSurcharges.mercadopago.feePercent).toBe(0)
  })

  it('no muta el tenant original', () => {
    withLocationCommercialSettings(tenant, { paymentSurcharges: { mercadopago: { feePercent: 9 } }, kriptonEnabled: false })
    expect(tenant.paymentSurcharges.mercadopago.feePercent).toBe(5)
    expect(tenant.paymentMethodsVisibility.kripton).toBe(true)
  })

  it('kriptonEnabled=false oculta Kripton en la sede; null hereda', () => {
    expect(withLocationCommercialSettings(tenant, { kriptonEnabled: false }).paymentMethodsVisibility.kripton).toBe(false)
    expect(withLocationCommercialSettings(tenant, { kriptonEnabled: null }).paymentMethodsVisibility.kripton).toBe(true)
  })

  it('el precio final usa el recargo de la sede', () => {
    const platform = { platformFees: { takeasygoCommissionPercent: 0 } }
    const base = calculateFinalTotal(10000, 'mercadopago', tenant, platform, 0)
    const sede = calculateFinalTotal(
      10000, 'mercadopago',
      withLocationCommercialSettings(tenant, { paymentSurcharges: { mercadopago: { feePercent: 0 } } }),
      platform, 0
    )
    expect(base.finalTotal).toBeGreaterThan(10000)
    expect(sede.finalTotal).toBe(10000)
  })
})

describe('isClubDiscountEnabledForLocation', () => {
  it('hereda (aplica) salvo que la sede lo desactive', () => {
    expect(isClubDiscountEnabledForLocation(null)).toBe(true)
    expect(isClubDiscountEnabledForLocation({ clubDiscountEnabled: null })).toBe(true)
    expect(isClubDiscountEnabledForLocation({ clubDiscountEnabled: false })).toBe(false)
  })
})
