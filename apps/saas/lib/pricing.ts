import { resolveManualCommission, resolveMpCommission, type ManualCommissionMethod, type TenantCommissionInput } from '@/lib/commission-rules'

export interface PricingResult {
  baseTotal: number
  surchargePercent: number
  surchargeAmount: number
  finalTotal: number
  platformFeeAmount: number
  /**
   * Efectivo / transferencia: parte de la comisión de plataforma que se le
   * RECARGÓ al cliente (porcentaje de plataforma × lo que paga, con envío).
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
  /**
   * 20/11/2026 — REGLA del dueño: la comisión de TakeasyGO se calcula sobre
   * el precio FULL de lista de los productos; ningún descuento ni promo del
   * comercio la baja. Esta es la parte de la base que se sumó por descuentos
   * (lista − productos cobrados). La comisión sobre ella la absorbe el
   * comercio; nunca se le recarga al cliente. @storedAs cents
   */
  commissionListGapAmount: number
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

  // MP / Kripton: % propio del comercio si el superadmin lo cargó; si no, el
  // global. (Antes exigía mpOAuth.isConnected, el flag VIEJO: los comercios con
  // cuentas en formato nuevo cobraban siempre el global.)
  return resolveMpCommission(tenant, platformConfig).percent
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
   *  - 20/11/2026 (decisión del dueño): el envío ENTRA en la base de la
   *    comisión en TODOS los medios (MP, transferencia y efectivo): TakeasyGO
   *    hace el puente y le permite al local cobrar delivery. El recargo propio
   *    del comercio sigue siendo solo sobre productos.
   */
  deliveryCost?: number,
  /**
   * Comisión de envío de TakeasyGO (centavos), ya incluida en el precio del
   * envío que paga el cliente. Se suma a platformFeeAmount en TODOS los medios
   * (en MP viaja en el marketplace_fee; en transferencia/efectivo entra en el
   * saldo de comisiones). No lleva comisión encima y no es un recargo.
   */
  deliveryPlatformFee = 0,
  /**
   * 20/11/2026: suma de los precios de LISTA de los productos (sin envío),
   * calculada por lib/commission-base. La comisión de TakeasyGO nunca se
   * calcula sobre menos que esto: promos, combos, cupones, Club, descuento por
   * efectivo o por medio de pago no la bajan. Ausente (pedidos viejos) = sin
   * ajuste.
   */
  productsListTotal?: number | null
): PricingResult {
  const deliveryPlatformFeeAmount = Math.max(0, Math.round(deliveryPlatformFee || 0))
  const productsCharged = Math.max(0, baseTotal - (deliveryCost ?? 0))
  const commissionListGapAmount = productsListTotal != null && productsListTotal > productsCharged
    ? Math.round(productsListTotal - productsCharged)
    : 0
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
  //  - transferencia y efectivo: productos + envío (sin la comisión de envío
  //    de TakeasyGO, para no cobrar comisión sobre la comisión) — igual que
  //    Mercado Pago (20/11/2026: el efectivo antes excluía el envío).
  if (paymentMethod === 'transfer' || paymentMethod === 'cash') {
    const commission = resolveManualCommission(paymentMethod as ManualCommissionMethod, orderMode, tenant, platformConfig, overridePlatformFeePercent)
    const merchantFeePercent = paymentMethod === 'transfer' && orderMode === 'delivery'
      ? (tenant.paymentSurcharges?.transfer?.feePercent ?? 0)
      : 0

    const productsSubtotal = Math.max(0, baseTotal - (deliveryCost ?? 0))
    const commissionBase = Math.max(0, baseTotal - deliveryPlatformFeeAmount)
    // Comisión de TakeasyGO: base a precio de lista (+ lo descontado). Lo que
    // se le recarga al cliente sale de lo que el cliente paga; la diferencia
    // la absorbe el comercio.
    const orderFee = commission.percent > 0 ? Math.ceil((commissionBase + commissionListGapAmount) * commission.percent / 100) : 0
    const orderFeeCustomer = commission.payer === 'customer' && commission.percent > 0
      ? Math.min(orderFee, Math.ceil(commissionBase * commission.percent / 100))
      : 0
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
      commissionListGapAmount,
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
      commissionListGapAmount,
    }
  }

  const platformFeePercent = getPlatformFeePercent(paymentMethod, tenant, platformConfig, overridePlatformFeePercent, orderMode)
  const platformFee = platformFeePercent / 100

  const finalTotal = Math.ceil(baseTotal / (1 - totalFees))
  const surchargeAmount = finalTotal - baseTotal
  const surchargePercent = baseTotal > 0 ? Math.round((surchargeAmount / baseTotal) * 10000) / 100 : 0
  // Comisión de TakeasyGO (marketplace_fee, lo fija TakeasyGO): sobre lo
  // cobrado + lo descontado a precio de lista. El recargo al cliente sigue
  // saliendo de lo que paga. MP rechaza un marketplace_fee mayor que el cobro:
  // tope en el total (solo con descuentos extremos).
  const platformFeeAmount = Math.min(
    finalTotal,
    Math.ceil((finalTotal + commissionListGapAmount) * platformFee) + deliveryPlatformFeeAmount
  )

  return {
    baseTotal,
    surchargePercent,
    surchargeAmount,
    finalTotal,
    platformFeeAmount,
    deliveryPlatformFeeAmount,
    commissionListGapAmount,
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
