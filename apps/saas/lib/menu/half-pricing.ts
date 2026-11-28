// Regla de cobro de la mitad y mitad del comercio (Tenant.halfAndHalf.pricing).
// La usan la carta online, el checkout y el POS: todos cobran lo mismo
// (cálculo en @takeasygo/business: halfShare / halfHalfTotal).
import Tenant from '@/models/Tenant'

export type HalfPricing = 'max' | 'average' | 'half_sum'

/** Regla del comercio; sin dato o desconocida = 'max' (la Grande más cara). */
export function halfPricingOf(tenant: { halfAndHalf?: { pricing?: string | null } | null } | null | undefined): HalfPricing {
  const v = tenant?.halfAndHalf?.pricing
  return v === 'average' || v === 'half_sum' ? v : 'max'
}

export async function tenantHalfPricing(tenantId: unknown): Promise<HalfPricing> {
  const t = await Tenant.findById(tenantId).select('halfAndHalf').lean<{ halfAndHalf?: { pricing?: string } }>()
  return halfPricingOf(t)
}
