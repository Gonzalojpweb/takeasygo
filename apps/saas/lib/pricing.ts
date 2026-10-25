import { resolveManualCommission, type ManualCommissionMethod, type TenantCommissionInput } from '@/lib/commission-rules'

export interface PricingResult {
  baseTotal: number
  surchargePercent: number
  surchargeAmount: number
  finalTotal: number
  platformFeeAmount: number
  /**
   * Efectivo / transferencia: parte de la comisión de plataforma que se le
   * RECARGÓ al cliente (porcentaje de plataforma × subtotal sin envío).
   * 0 = la comisión no se recargó y la absorbe el comercio. @storedAs cents
   */
  platformFeeCustomerAmount?: number
  /** Transferencia: recargo propio del comercio (queda en el negocio). @storedAs cents */
  merchantSurchargeAmount?: number
}

export type PaymentMethod = 'mercadopago' | 'kripton' | 'transfer' | 'cash'

interface TenantFees extends TenantCommissionInput {
  paymentSurcharges?: {
    mercadopago?: { feePercent: number }
    kripton?: { feePercent: number }
    transfer?: { feePercent: number }
  }
  // Mercado Pago OAuth connection status
  mpOAuth?: { isConnected?: boolean; commissionPercent?: number | null }
  // Transfer platform commission override (null = use global)
  transfer?: { commissionPercent?: number | null }
}

interface PlatformFees {
  platformFees?: {
    takeasygoCommissionPercent: number
    takeasygoTransferCommissionPercent?: number
    takeasygoCashCommissionPercent?: number
  }
}

/**
 * Shared function: computes the combined fee rate (tenant + platform) for a payment method.
 * Used by both calculateFinalTotal (server) and /payment-methods (API for frontend).
 * Returns the raw decimal fraction (e.g. 0.137 for 13.7%), never rounded.
 */
function getPlatformFeePercent(
  paymentMethod: PaymentMethod,
  tenant: TenantFees,
  platformConfig: PlatformFees,
  overridePlatformFeePercent?: number,
  orderMode?: string
): number {
  if (overridePlatformFeePercent != null) return overridePlatformFeePercent

  // Efectivo / transferencia: matriz del superadmin (lib/commission-rules).
  if (paymentMethod === 'cash' || paymentMethod === 'transfer') {
    return resolveManualCommission(paymentMethod, orderMode, tenant, platformConfig).percent
  }

  return (tenant.mpOAuth?.isConnected && tenant.mpOAuth?.commissionPercent != null)
    ? tenant.mpOAuth.commissionPercent!
    : (platformConfig.platformFees?.takeasygoCommissionPercent ?? 1)
}

export function getTotalFeesForMethod(
  paymentMethod: PaymentMethod,
  tenant: TenantFees,
  platformConfig: PlatformFees,
  overridePlatformFeePercent?: number,
  orderMode?: string
): number {
  // Efectivo / transferencia: fracción RECARGADA al cliente (si la absorbe
  // el comercio, el cliente no ve recargo de plataforma).
  if (paymentMethod === 'cash' || paymentMethod === 'transfer') {
    const c = resolveManualCommission(paymentMethod, orderMode, tenant, platformConfig, overridePlatformFeePercent)
    return c.payer === 'customer' ? c.percent / 100 : 0
  }

  const tenantFeePercent = tenant.paymentSurcharges?.[paymentMethod]?.feePercent ?? 0
  const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent, orderMode)

  const totalFees = tenantFeePercent / 100 + platformFeePercent / 100
  return totalFees >= 1 ? 0 : totalFees
}

export function calculateFinalTotal(
  baseTotal: number,
  paymentMethod: PaymentMethod,
  tenant: TenantFees,
  platformConfig: PlatformFees,
  /** Optional override for the platform commission percent (e.g. from tenant.mpOAuth.commissionPercent or platformConfig.mpOAuth.platformFeePercent) */
  overridePlatformFeePercent?: number,
  /** Order mode (takeaway/delivery/etc). Transfer commission only applies to delivery orders. */
  orderMode?: string,
  /** Delivery cost in cents. For transfer, the surcharge is calculated on (baseTotal - deliveryCost) — delivery is a passthrough and excluded from the commission base. */
  deliveryCost?: number
): PricingResult {
  // ── Efectivo / Transferencia: comisión MANUAL (lib/commission-rules) ──
  // Qué combinaciones medio × modo pagan comisión y con qué % lo decide el
  // superadmin; si se recarga al cliente o la absorbe el comercio, el admin.
  // Sin matriz activada rige la regla histórica (2026-10-22): transferencia +
  // delivery, recargada SIEMPRE al cliente — mismo resultado que antes.
  //  - comisión de plataforma: ceil(subtotal × % / 100); el cliente paga
  //    EXACTAMENTE ese monto si le corresponde (platformFeeCustomerAmount).
  //  - recargo propio del comercio por transferencia (paymentSurcharges.
  //    transfer.feePercent): queda en el negocio; como antes, solo delivery.
  // Base: subtotal sin envío (el delivery es passthrough al repartidor).
  if (paymentMethod === 'transfer' || paymentMethod === 'cash') {
    const commission = resolveManualCommission(paymentMethod as ManualCommissionMethod, orderMode, tenant, platformConfig, overridePlatformFeePercent)
    const merchantFeePercent = paymentMethod === 'transfer' && orderMode === 'delivery'
      ? (tenant.paymentSurcharges?.transfer?.feePercent ?? 0)
      : 0

    const subtotal = Math.max(0, baseTotal - (deliveryCost ?? 0))
    const platformFeeAmount = commission.percent > 0 ? Math.ceil(subtotal * commission.percent / 100) : 0
    const platformFeeCustomerAmount = commission.payer === 'customer' ? platformFeeAmount : 0
    const merchantSurchargeAmount = Math.round(subtotal * merchantFeePercent / 100)
    const surchargeAmount = platformFeeCustomerAmount + merchantSurchargeAmount
    const surchargePercent = merchantFeePercent + (commission.payer === 'customer' ? commission.percent : 0)

    return {
      baseTotal,
      surchargePercent,
      surchargeAmount,
      finalTotal: baseTotal + surchargeAmount,
      platformFeeAmount,
      platformFeeCustomerAmount,
      merchantSurchargeAmount,
    }
  }

  // ── MP / Kripton: lógica original (split automático, sin cambios) ──
  const totalFees = getTotalFeesForMethod(paymentMethod, tenant, platformConfig, overridePlatformFeePercent, orderMode)
  if (totalFees === 0) {
    return {
      baseTotal,
      surchargePercent: 0,
      surchargeAmount: 0,
      finalTotal: baseTotal,
      platformFeeAmount: 0,
    }
  }

  const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent, orderMode)
  const platformFee = platformFeePercent / 100

  const finalTotal = Math.ceil(baseTotal / (1 - totalFees))
  const surchargeAmount = finalTotal - baseTotal
  const surchargePercent = baseTotal > 0 ? Math.round((surchargeAmount / baseTotal) * 10000) / 100 : 0
  const platformFeeAmount = Math.ceil(finalTotal * platformFee)

  return {
    baseTotal,
    surchargePercent,
    surchargeAmount,
    finalTotal,
    platformFeeAmount,
  }
}

/**
 * Agrega el surplus de Rapiboy (diferencia positiva) al platformFeeAmount.
 * Cuando Rapiboy cobra MENOS de lo que el cliente pagó, la diferencia es para TakeasyGO.
 * Se suma al platformFeeAmount para que el restaurante pague la comisión total.
 */
export function addRapiboySurplus(platformFeeAmount: number, rapiboySurplus: number): number {
  if (rapiboySurplus <= 0) return platformFeeAmount
  return platformFeeAmount + rapiboySurplus
}
