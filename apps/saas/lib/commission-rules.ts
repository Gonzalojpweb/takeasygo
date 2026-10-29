// ============================================================================
// Comisiones MANUALES por medio de pago × modo de pedido (2026-10-25)
// ============================================================================
// Hasta ahora TakeasyGO cobraba comisión:
//   · MercadoPago / Kripton → split automático en cada pago (NO cambia: este
//     archivo no lo toca; ver lib/pricing.ts, rama MP).
//   · Transferencia → solo en delivery, siempre recargada al cliente.
//   · Efectivo → nunca.
//
// Ahora el SUPERADMIN decide por tenant qué combinaciones pagan comisión en
// los medios "manuales" (efectivo y transferencia: el dinero entra al
// comercio y la comisión se liquida por semana), y con qué % por medio. El
// ADMIN del comercio decide, por medio, si la comisión se le RECARGA al
// cliente o la ABSORBE el comercio.
//
// Reglas:
//   · Solo pedidos online (checkout del SaaS). Las ventas del POS no pasan
//     por lib/pricing y no generan comisión.
//   · Tenant sin matriz activada (commissionRules.enabled !== true) ⇒ regla
//     histórica exacta (transferencia + delivery, la paga el cliente). Sin
//     migración: el superadmin la activa cuando quiere y desde ese pedido el
//     comercio empieza a pagar según la matriz (aunque antes no pagara).
//   · % transferencia: tenant.transfer.commissionPercent (> 0) → global
//     platformFees.takeasygoTransferCommissionPercent (igual que antes).
//   · % efectivo: commissionRules.cash.percent → global
//     platformFees.takeasygoCashCommissionPercent → 0.
//   · Base de la comisión: subtotal SIN envío (el envío es passthrough).
// ============================================================================

export const MANUAL_COMMISSION_METHODS = ['cash', 'transfer'] as const
export type ManualCommissionMethod = (typeof MANUAL_COMMISSION_METHODS)[number]

/** Modos de pedido online a los que se les puede aplicar comisión. */
export const COMMISSION_ORDER_MODES = ['delivery', 'takeaway', 'dine-in', 'business'] as const
export type CommissionOrderMode = (typeof COMMISSION_ORDER_MODES)[number]

export const COMMISSION_MODE_LABELS: Record<CommissionOrderMode, string> = {
  delivery: 'Delivery',
  takeaway: 'Take away',
  'dine-in': 'Salón (QR)',
  business: 'Empresas',
}
export const COMMISSION_METHOD_LABELS: Record<ManualCommissionMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
}

export type CommissionPayer = 'customer' | 'merchant'

export interface CommissionRulesConfig {
  enabled?: boolean | null
  cash?: { modes?: string[] | null; percent?: number | null } | null
  transfer?: { modes?: string[] | null } | null
}

export interface TenantCommissionInput {
  commissionRules?: CommissionRulesConfig | null
  commissionPayer?: Partial<Record<ManualCommissionMethod, CommissionPayer | null>> | null
  transfer?: { commissionPercent?: number | null } | null
}

export interface PlatformCommissionInput {
  platformFees?: {
    takeasygoTransferCommissionPercent?: number | null
    takeasygoCashCommissionPercent?: number | null
  } | null
}

export interface ManualCommission {
  /** % de comisión de plataforma para este pedido (0 = no paga). */
  percent: number
  /** Quién la paga: recargada al cliente o absorbida por el comercio. */
  payer: CommissionPayer
  /** 'legacy' = regla histórica (sin matriz activada). */
  source: 'legacy' | 'rules'
}

export function isManualCommissionMethod(m: string): m is ManualCommissionMethod {
  return (MANUAL_COMMISSION_METHODS as readonly string[]).includes(m)
}

function transferPercent(tenant: TenantCommissionInput, platform: PlatformCommissionInput, override?: number): number {
  const own = tenant.transfer?.commissionPercent ?? 0
  return own > 0 ? own : (override ?? platform.platformFees?.takeasygoTransferCommissionPercent ?? 0)
}

/**
 * Comisión manual de un pedido online. Pura: misma entrada ⇒ misma salida
 * (la usan el catálogo de medios, la creación del pedido y el cambio de medio).
 */
export function resolveManualCommission(
  method: ManualCommissionMethod,
  orderMode: string | undefined,
  tenant: TenantCommissionInput,
  platform: PlatformCommissionInput,
  /** Override del % de plataforma (compatibilidad con calculateFinalTotal). */
  overridePercent?: number,
): ManualCommission {
  const rules = tenant.commissionRules
  if (rules?.enabled !== true) {
    // Regla histórica: solo transferencia + delivery, recargada al cliente.
    // Sin orderMode (bug de caller) se falla al lado seguro: no cobra.
    if (method !== 'transfer' || orderMode !== 'delivery') return { percent: 0, payer: 'customer', source: 'legacy' }
    return { percent: transferPercent(tenant, platform, overridePercent), payer: 'customer', source: 'legacy' }
  }

  const modes = rules[method]?.modes ?? []
  const payer: CommissionPayer = tenant.commissionPayer?.[method] === 'merchant' ? 'merchant' : 'customer'
  if (!orderMode || !modes.includes(orderMode)) return { percent: 0, payer, source: 'rules' }

  const percent = method === 'transfer'
    ? transferPercent(tenant, platform, overridePercent)
    : (rules.cash?.percent ?? platform.platformFees?.takeasygoCashCommissionPercent ?? 0)
  return { percent: Math.max(0, Math.min(100, percent)), payer, source: 'rules' }
}

/** Sanea la matriz que manda el superadmin (solo medios y modos conocidos). */
export function sanitizeCommissionRules(input: unknown): CommissionRulesConfig {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const modesOf = (v: unknown): string[] => {
    const arr = Array.isArray((v as { modes?: unknown })?.modes) ? ((v as { modes: unknown[] }).modes) : []
    return [...new Set(arr.filter((m): m is string => typeof m === 'string' && (COMMISSION_ORDER_MODES as readonly string[]).includes(m)))]
  }
  const rawPercent = (src.cash as { percent?: unknown } | undefined)?.percent
  let cashPercent: number | null = null
  if (rawPercent !== null && rawPercent !== undefined && rawPercent !== '') {
    const n = Number(rawPercent)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('El % de comisión en efectivo debe estar entre 0 y 100')
    cashPercent = n
  }
  return {
    enabled: src.enabled === true,
    cash: { modes: modesOf(src.cash), percent: cashPercent },
    transfer: { modes: modesOf(src.transfer) },
  }
}

/** Medios manuales que hoy le generan comisión al comercio (para la UI del admin). */
export function chargedManualMethods(tenant: TenantCommissionInput): ManualCommissionMethod[] {
  const rules = tenant.commissionRules
  if (rules?.enabled !== true) return ['transfer']
  return MANUAL_COMMISSION_METHODS.filter((m) => (rules[m]?.modes ?? []).length > 0)
}
