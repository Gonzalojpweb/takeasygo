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
  mpOAuth?: { isConnected?: boolean }
  // Configured split percentage for platform commission (0-100)
  paymentSplitPercentage?: number
}

interface PlatformFees {
  platformFees?: {
    takeasygoCommissionPercent: number
  }
}

export function calculateFinalTotal(
  baseTotal: number,
  paymentMethod: PaymentMethod,
  tenant: TenantFees,
  platformConfig: PlatformFees
): PricingResult {
  if (paymentMethod === 'transfer') {
    return {
      baseTotal,
      surchargePercent: 0,
      surchargeAmount: 0,
      finalTotal: baseTotal,
      platformFeeAmount: 0,
    }
  }

  const tenantFeePercent = tenant.paymentSurcharges?.[paymentMethod]?.feePercent ?? 0
  // Apply platform commission only if MP OAuth is connected and split is configured
  const platformFeePercent = (tenant.mpOAuth?.isConnected && tenant.paymentSplitPercentage != null)
    ? tenant.paymentSplitPercentage
    : (platformConfig.platformFees?.takeasygoCommissionPercent ?? 1)

  const tenantFee = tenantFeePercent / 100
  const platformFee = platformFeePercent / 100

  const totalFees = tenantFee + platformFee
  if (totalFees >= 1) {
    return {
      baseTotal,
      surchargePercent: 0,
      surchargeAmount: 0,
      finalTotal: baseTotal,
      platformFeeAmount: 0,
    }
  }

  const finalTotal = Math.round(baseTotal / (1 - totalFees))
  const surchargeAmount = finalTotal - baseTotal
  const surchargePercent = baseTotal > 0 ? Math.round((surchargeAmount / baseTotal) * 10000) / 100 : 0
  const platformFeeAmount = Math.round(finalTotal * platformFee)

  return {
    baseTotal,
    surchargePercent,
    surchargeAmount,
    finalTotal,
    platformFeeAmount,
  }
}
