export interface PricingResult {
  baseTotal: number
  surchargePercent: number
  surchargeAmount: number
  finalTotal: number
  platformFeeAmount: number
  /**
   * Transferencia (delivery): parte de la comisión de plataforma que se le
   * RECARGÓ al cliente (porcentaje de plataforma × subtotal sin envío).
   * 0 = la comisión no se recargó y la absorbe el comercio. @storedAs cents
   */
  platformFeeCustomerAmount?: number
  /** Transferencia: recargo propio del comercio (queda en el negocio). @storedAs cents */
  merchantSurchargeAmount?: number
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
  // ── Transferencia (solo delivery) ──
  // REGLA (decisión de negocio, 2026-10-22): la comisión de TakeasyGO la paga
  // SIEMPRE el cliente, como cargo por usar la app. El restaurante nunca la
  // absorbe. El cliente paga:
  //  - la comisión de plataforma: % del comercio (tenant.transfer.commissionPercent)
  //    o, si no tiene uno (> 0), el % por defecto de la plataforma, y
  //  - el recargo propio opcional del comercio (tenant.paymentSurcharges.transfer.feePercent),
  //    que queda en el negocio.
  // A TakeasyGO le corresponde solo la comisión, y el cliente paga EXACTAMENTE
  // ese monto (mismo redondeo): platformFeeCustomerAmount === platformFeeAmount.
  // Base: subtotal sin envío (el delivery es passthrough al repartidor).
  // Antes, con % del comercio en 0, la comisión se cobraba igual pero no se le
  // recargaba al cliente: la pagaba el restaurante (bug corregido).
  if (paymentMethod === 'transfer') {
    if (orderMode !== 'delivery') {
      return { baseTotal, surchargePercent: 0, surchargeAmount: 0, finalTotal: baseTotal, platformFeeAmount: 0, platformFeeCustomerAmount: 0, merchantSurchargeAmount: 0 }
    }

    const merchantFeePercent = tenant.paymentSurcharges?.transfer?.feePercent ?? 0
    const tenantPercent = tenant.transfer?.commissionPercent ?? 0
    const platformPercent = tenantPercent > 0
      ? tenantPercent
      : (overridePlatformFeePercent ?? platformConfig.platformFees?.takeasygoTransferCommissionPercent ?? 0)

    const subtotal = baseTotal - (deliveryCost ?? 0)
    const platformFeeAmount = Math.ceil(subtotal * platformPercent / 100)
    const merchantSurchargeAmount = Math.round(subtotal * merchantFeePercent / 100)
    const surchargeAmount = platformFeeAmount + merchantSurchargeAmount
    const surchargePercent = merchantFeePercent + platformPercent
    const finalTotal = baseTotal + surchargeAmount

    return {
      baseTotal,
      surchargePercent,
      surchargeAmount,
      finalTotal,
      platformFeeAmount,
      platformFeeCustomerAmount: platformFeeAmount,
      merchantSurchargeAmount,
    }
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

/**
 * Agrega el surplus de Rapiboy (diferencia positiva) al platformFeeAmount.
 * Cuando Rapiboy cobra MENOS de lo que el cliente pagó, la diferencia es para TakeasyGO.
 * Se suma al platformFeeAmount para que el restaurante pague la comisión total.
 */
export function addRapiboySurplus(platformFeeAmount: number, rapiboySurplus: number): number {
  if (rapiboySurplus <= 0) return platformFeeAmount
  return platformFeeAmount + rapiboySurplus
}
