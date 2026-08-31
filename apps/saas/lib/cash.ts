export interface CashConfig {
  enabled: boolean
  discountPercent: number
}

export interface TenantCashConfig {
  enabled?: boolean
  discountPercent?: number
}

export interface LocationCashOverride {
  enabled?: boolean | null
  discountPercent?: number | null
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * Resuelve la configuración efectiva de pago en efectivo de una sede.
 * Prioridad: override de la sede (settings.cash) → config del tenant (cash).
 * Un campo sin setear en el override hereda el valor del tenant (fallback parcial).
 */
export function resolveCashConfig(
  tenantCash: TenantCashConfig | null | undefined,
  locationCash?: LocationCashOverride | null | undefined
): CashConfig {
  const override = locationCash && typeof locationCash === 'object' ? locationCash : undefined
  return {
    enabled:
      override?.enabled != null
        ? !!override.enabled
        : !!tenantCash?.enabled,
    discountPercent:
      override?.discountPercent != null
        ? clampPercent(override.discountPercent)
        : clampPercent(tenantCash?.discountPercent ?? 0),
  }
}