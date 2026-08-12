export interface PricingResult {
  baseTotal: number
  surchargePercent: number
  surchargeAmount: number
  finalTotal: number
  platformFeeAmount: number
}

export type PaymentMethod = 'mercadopago' | 'kripton' | 'transfer'

interface TenantFees {
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
  overridePlatformFeePercent?: number
): number {
  if (overridePlatformFeePercent != null) return overridePlatformFeePercent

  if (paymentMethod === 'transfer') {
    return tenant.transfer?.commissionPercent != null
      ? tenant.transfer.commissionPercent!
      : (platformConfig.platformFees?.takeasygoTransferCommissionPercent ?? 0)
  }

  return (tenant.mpOAuth?.isConnected && tenant.mpOAuth?.commissionPercent != null)
    ? tenant.mpOAuth.commissionPercent!
    : (platformConfig.platformFees?.takeasygoCommissionPercent ?? 1)
}

export function getTotalFeesForMethod(
  paymentMethod: PaymentMethod,
  tenant: TenantFees,
  platformConfig: PlatformFees,
  overridePlatformFeePercent?: number
): number {
  const tenantFeePercent = tenant.paymentSurcharges?.[paymentMethod]?.feePercent ?? 0
  const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent)

  const totalFees = tenantFeePercent / 100 + platformFeePercent / 100
  return totalFees >= 1 ? 0 : totalFees
}

export function calculateFinalTotal(
  baseTotal: number,
  paymentMethod: PaymentMethod,
  tenant: TenantFees,
  platformConfig: PlatformFees,
  /** Optional override for the platform commission percent (e.g. from tenant.mpOAuth.commissionPercent or platformConfig.mpOAuth.platformFeePercent) */
  overridePlatformFeePercent?: number
): PricingResult {
  const totalFees = getTotalFeesForMethod(paymentMethod, tenant, platformConfig, overridePlatformFeePercent)
  if (totalFees === 0) {
    return {
      baseTotal,
      surchargePercent: 0,
      surchargeAmount: 0,
      finalTotal: baseTotal,
      platformFeeAmount: 0,
    }
  }

  const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent)
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
