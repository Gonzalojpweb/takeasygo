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
  /**
   * Comisión de TakeasyGO por gestionar el envío tercerizado (Rapiboy): el %
   * que se suma al precio de Rapiboy. YA está incluida en platformFeeAmount;
   * se informa aparte para el desglose. @storedAs cents
   */
  deliveryPlatformFeeAmount: number
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
  /**
   * Costo de envío en centavos (ya incluido en baseTotal).
   *  - Transferencia (20/11/2026): el envío ENTRA en la base de la comisión,
   *    igual que en Mercado Pago. El recargo propio del comercio sigue siendo
   *    solo sobre productos.
   *  - Efectivo: el envío sigue fuera de la base de la comisión.
   */
  deliveryCost?: number,
  /**
   * Comisión de envío de TakeasyGO (centavos), ya incluida en el precio del
   * envío que paga el cliente. Se suma a platformFeeAmount en TODOS los medios
   * (en MP viaja en el marketplace_fee; en transferencia/efectivo entra en el
   * saldo de comisiones). No lleva comisión encima y no es un recargo.
   */
  deliveryPlatformFee = 0
): PricingResult {
  const deliveryPlatformFeeAmount = Math.max(0, Math.round(deliveryPlatformFee || 0))
  // ── Efectivo / Transferencia: comisión MANUAL (lib/commission-rules) ──
  // Qué combinaciones medio × modo pagan comisión y con qué % lo decide el
  // superadmin; si se recarga al cliente o la absorbe el comercio, el admin.
  // Sin matriz activada rige la regla histórica (2026-10-22): transferencia +
  // delivery, recargada SIEMPRE al cliente — mismo resultado que antes.
  //  - comisión de plataforma: ceil(subtotal × % / 100); el cliente paga
  //    EXACTAMENTE ese monto si le corresponde (platformFeeCustomerAmount).
  //  - recargo propio del comercio por transferencia (paymentSurcharges.
  //    transfer.feePercent): queda en el negocio; como antes, solo delivery.
  // Base de la comisión:
  //  - transferencia: productos + envío (sin la comisión de envío de TakeasyGO,
  //    para no cobrar comisión sobre la comisión) — igual que Mercado Pago.
  //  - efectivo: productos sin envío (regla histórica).
  if (paymentMethod === 'transfer' || paymentMethod === 'cash') {
    const commission = resolveManualCommission(paymentMethod as ManualCommissionMethod, orderMode, tenant, platformConfig, overridePlatformFeePercent)
    const merchantFeePercent = paymentMethod === 'transfer' && orderMode === 'delivery'
      ? (tenant.paymentSurcharges?.transfer?.feePercent ?? 0)
      : 0

    const productsSubtotal = Math.max(0, baseTotal - (deliveryCost ?? 0))
    const commissionBase = paymentMethod === 'transfer'
      ? Math.max(0, baseTotal - deliveryPlatformFeeAmount)
      : productsSubtotal
    const orderFee = commission.percent > 0 ? Math.ceil(commissionBase * commission.percent / 100) : 0
    const orderFeeCustomer = commission.payer === 'customer' ? orderFee : 0
    const merchantSurchargeAmount = Math.round(productsSubtotal * merchantFeePercent / 100)
    const surchargeAmount = orderFeeCustomer + merchantSurchargeAmount
    const surchargePercent = merchantFeePercent + (commission.payer === 'customer' ? commission.percent : 0)

    return {
      baseTotal,
      surchargePercent,
      surchargeAmount,
      finalTotal: baseTotal + surchargeAmount,
      platformFeeAmount: orderFee + deliveryPlatformFeeAmount,
      // La comisión de envío la paga siempre el cliente (va dentro del envío).
      platformFeeCustomerAmount: orderFeeCustomer + deliveryPlatformFeeAmount,
      merchantSurchargeAmount,
      deliveryPlatformFeeAmount,
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
      platformFeeAmount: deliveryPlatformFeeAmount,
      deliveryPlatformFeeAmount,
    }
  }

  const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent, orderMode)
  const platformFee = platformFeePercent / 100

  const finalTotal = Math.ceil(baseTotal / (1 - totalFees))
  const surchargeAmount = finalTotal - baseTotal
  const surchargePercent = baseTotal > 0 ? Math.round((surchargeAmount / baseTotal) * 10000) / 100 : 0
  const platformFeeAmount = Math.ceil(finalTotal * platformFee) + deliveryPlatformFeeAmount

  return {
    baseTotal,
    surchargePercent,
    surchargeAmount,
    finalTotal,
    platformFeeAmount,
    deliveryPlatformFeeAmount,
  }
}

/**
 * Comisión de envío de TakeasyGO sobre el costo real de Rapiboy (centavos).
 * Es el % que se suma al precio de Rapiboy («Margen» de la sede).
 */
export function deliveryPlatformFeeOf(rapiboyCostCents: number, percent: number): number {
  if (!(rapiboyCostCents > 0) || !(percent > 0)) return 0
  return Math.round(rapiboyCostCents * (percent / 100))
}
