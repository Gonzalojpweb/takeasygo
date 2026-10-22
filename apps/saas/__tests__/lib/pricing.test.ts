import { describe, it, expect } from 'vitest'
import { calculateFinalTotal, getTotalFeesForMethod } from '@/lib/pricing'

const platformConfig = {
  platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 0 },
}

describe('calculateFinalTotal - transferencia', () => {
  const tenant = {
    paymentSurcharges: { transfer: { feePercent: 0 } }, // sin recargo propio del comercio
    transfer: { commissionPercent: 1.5 }, // 1.5% comisión de plataforma TakeasyGO
  }

  it('Transferencia + Delivery → cobra únicamente la comisión de transferencia (1.5%)', () => {
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig, undefined, 'delivery')
    expect(r.finalTotal).toBe(71050) // 70000 * 1.015
    expect(r.surchargeAmount).toBe(1050)
    expect(r.surchargePercent).toBe(1.5)
    expect(r.platformFeeAmount).toBe(1050) // 1.5% de 70000
  })

  it('Transferencia + Delivery con deliveryCost → recargo SOLO sobre subtotal (sin delivery)', () => {
    // baseTotal = 70000 (subtotal 68000 + delivery 2000)
    const r = calculateFinalTotal(70000, 'transfer', tenant, platformConfig, undefined, 'delivery', 2000)
    // surcharge = 1.5% de 68000 (subtotal) = 1020, NO de 70000
    expect(r.surchargeAmount).toBe(1020)
    expect(r.platformFeeAmount).toBe(1020) // platformFeeAmount = surchargeAmount
    expect(r.finalTotal).toBe(71020) // 70000 + 1020
  })

  it('Transferencia + Delivery + recargo propio del comercio → cliente paga ambos, a TakeasyGO solo le corresponde su comisión', () => {
    const tenantConRecargo = {
      paymentSurcharges: { transfer: { feePercent: 2 } }, // 2% recargo propio (del negocio)
      transfer: { commissionPercent: 1.5 }, // 1.5% comisión TakeasyGO
    }
    const r = calculateFinalTotal(70000, 'transfer', tenantConRecargo, platformConfig, undefined, 'delivery')
    expect(r.surchargePercent).toBe(3.5) // 2% + 1.5%
    expect(r.surchargeAmount).toBe(2450) // 3.5% de 70000
    expect(r.finalTotal).toBe(72450)
    // La comisión de TakeasyGO es SOLO su 1.5%: el 2% propio queda en el negocio
    expect(r.platformFeeAmount).toBe(1050)
  })

  it('Transferencia + Takeaway + recargo propio → NO cobra NINGÚN monto extra (Precio de Carta)', () => {
    const tenantConRecargo = {
      paymentSurcharges: { transfer: { feePercent: 5 } },
      transfer: { commissionPercent: 1.5 },
    }
    const r = calculateFinalTotal(70000, 'transfer', tenantConRecargo, platformConfig, undefined, 'takeaway')
    expect(r.finalTotal).toBe(70000)
    expect(r.surchargeAmount).toBe(0)
    expect(r.platformFeeAmount).toBe(0)
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

  // Decisión de negocio 2026-10-22: la comisión de transferencia (delivery)
  // la paga SIEMPRE el cliente. Antes, con 0 % en el comercio, la comisión
  // se cobraba igual pero la absorbía el restaurante.
  it('Transferencia + 0% en el comercio → el cliente paga la comisión con el % default de plataforma', () => {
    const tenantNoSurcharge = {
      transfer: { commissionPercent: 0 },
    }
    const pcConDefault = { platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 1 } } // 1% default transfer
    // baseTotal = 50000 (subtotal 48000 + delivery 2000)
    const r = calculateFinalTotal(50000, 'transfer', tenantNoSurcharge, pcConDefault, undefined, 'delivery', 2000)
    expect(r.platformFeeAmount).toBe(480) // 1 % de 48000 (sin envío)
    expect(r.surchargeAmount).toBe(480) // lo paga el cliente
    expect(r.surchargePercent).toBe(1)
    expect(r.platformFeeCustomerAmount).toBe(480)
    expect(r.merchantSurchargeAmount).toBe(0)
    expect(r.finalTotal).toBe(50480)
  })

  it('Transferencia + delivery: el cliente paga EXACTAMENTE la comisión (nunca el restaurante), con o sin recargo propio', () => {
    const pc = { platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 3 } }
    for (const tenantCase of [
      {},
      { transfer: { commissionPercent: null } },
      { transfer: { commissionPercent: 2.5 } },
      { transfer: { commissionPercent: 2.5 }, paymentSurcharges: { transfer: { feePercent: 4 } } },
      { paymentSurcharges: { transfer: { feePercent: 4 } } },
    ]) {
      const r = calculateFinalTotal(123457, 'transfer', tenantCase as never, pc, undefined, 'delivery', 3457)
      expect(r.platformFeeAmount).toBeGreaterThan(0)
      expect(r.platformFeeCustomerAmount).toBe(r.platformFeeAmount)
      expect(r.surchargeAmount).toBe(r.platformFeeAmount + (r.merchantSurchargeAmount ?? 0))
      expect(r.finalTotal).toBe(123457 + r.surchargeAmount)
    }
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

