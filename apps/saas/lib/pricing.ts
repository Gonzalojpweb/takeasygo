export interface PricingResult {
  baseTotal: number
  surchargePercent: number
  surchargeAmount: number
  finalTotal: number
  platformFeeAmount: number
}

export type PaymentMethod = 'mercadopago' | 'kripton' | 'transfer' | 'cash'

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
  overridePlatformFeePercent?: number,
  orderMode?: string
): number {
  if (overridePlatformFeePercent != null) return overridePlatformFeePercent

  if (paymentMethod === 'cash') return 0

  if (paymentMethod === 'transfer') {
    // La comisión de plataforma por transferencia solo aplica a pedidos de delivery.
    // Si orderMode no llega (bug de caller), el sistema falla al lado seguro: no cobra.
    if (orderMode !== 'delivery') return 0
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
  overridePlatformFeePercent?: number,
  orderMode?: string
): number {
  if (paymentMethod === 'cash') return 0

  if (paymentMethod === 'transfer') {
    if (orderMode !== 'delivery') return 0
    const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent, orderMode)
    return platformFeePercent / 100
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
  // ── Transferencia: se maneja aparte porque recargo (cliente) y comisión (restaurante) pueden diferir ──
  // El recargo que paga el cliente ES la comisión de TakeasyGO cuando es > 0%.
  // Si el tenant configuró 0%, la comisión igual existe (% default de plataforma),
  // pero la absorbe el restaurante (surchargeAmount = 0, platformFeeAmount > 0).
  // El recargo se calcula solo sobre subtotal (sin delivery) — delivery es passthrough.
  if (paymentMethod === 'transfer') {
    if (orderMode !== 'delivery') {
      return { baseTotal, surchargePercent: 0, surchargeAmount: 0, finalTotal: baseTotal, platformFeeAmount: 0 }
    }

    const surchargePercent = tenant.transfer?.commissionPercent ?? 0
    const subtotal = baseTotal - (deliveryCost ?? 0)
    const surchargeAmount = Math.round(subtotal * surchargePercent / 100)
    const finalTotal = baseTotal + surchargeAmount

    // Comisión: usar % del tenant si es > 0, si no el % default de plataforma
    const commissionPercent = surchargePercent > 0
      ? surchargePercent
      : (overridePlatformFeePercent ?? platformConfig.platformFees?.takeasygoTransferCommissionPercent ?? 0)
    const platformFeeAmount = Math.ceil(subtotal * commissionPercent / 100)

    return { baseTotal, surchargePercent, surchargeAmount, finalTotal, platformFeeAmount }
  }

  // ── MP / Kripton / Efectivo: lógica original ──
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
