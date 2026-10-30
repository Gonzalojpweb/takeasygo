// ============================================================================
// Deliverys externos (Fase 5, 29/10/2026) — PedidosYa, Rappi, Uber Eats…
// ============================================================================
// Por sede: si la plataforma está activa, su % de comisión y quién cobra:
//   · 'platform': la plataforma cobra al cliente y le liquida al local
//     (la venta NO entra a la caja; se concilia con la liquidación).
//   · 'local': el local cobra al entregar (efectivo / posnet) y la venta
//     entra a la caja del turno como cualquier cobro.
// La comisión se calcula sobre lo vendido en la plataforma (centavos,
// redondeo al centavo) y en Ventas se muestra neto = vendido − comisión.
// ============================================================================

export const DELIVERY_PLATFORM_LIST = [
  { id: "pedidosya", label: "PedidosYa" },
  { id: "rappi", label: "Rappi" },
  { id: "uber_eats", label: "Uber Eats" },
  { id: "didi_food", label: "DiDi Food" },
] as const

export type DeliveryPlatformId = (typeof DELIVERY_PLATFORM_LIST)[number]["id"]
export type DeliverySettlement = "platform" | "local"

export interface DeliveryPlatformConfig {
  id: DeliveryPlatformId
  enabled: boolean
  /** % de comisión (0 a 60, hasta 2 decimales). */
  commissionPercent: number
  settlement: DeliverySettlement
}

export const MAX_DELIVERY_COMMISSION_PERCENT = 60

export function isDeliveryPlatformId(v: unknown): v is DeliveryPlatformId {
  return typeof v === "string" && DELIVERY_PLATFORM_LIST.some((p) => p.id === v)
}

export function deliveryPlatformName(id: string): string {
  return DELIVERY_PLATFORM_LIST.find((p) => p.id === id)?.label ?? id
}

export function validateDeliveryPlatforms(input: unknown): { ok: true; platforms: DeliveryPlatformConfig[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "La configuración debe ser una lista" }
  const seen = new Set<string>()
  const out: DeliveryPlatformConfig[] = []
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>
    if (!isDeliveryPlatformId(r.id)) return { ok: false, error: `Plataforma desconocida: ${String(r.id)}` }
    if (seen.has(r.id)) return { ok: false, error: `${deliveryPlatformName(r.id)} está repetida` }
    seen.add(r.id)
    const pct = Number(r.commissionPercent ?? 0)
    if (!Number.isFinite(pct) || pct < 0 || pct > MAX_DELIVERY_COMMISSION_PERCENT || Math.round(pct * 100) !== pct * 100) {
      return { ok: false, error: `Comisión de ${deliveryPlatformName(r.id)}: entre 0 y ${MAX_DELIVERY_COMMISSION_PERCENT} %, hasta 2 decimales` }
    }
    if (r.settlement !== "platform" && r.settlement !== "local") return { ok: false, error: `Indicá quién cobra en ${deliveryPlatformName(r.id)}` }
    out.push({ id: r.id, enabled: r.enabled !== false, commissionPercent: pct, settlement: r.settlement })
  }
  return { ok: true, platforms: out }
}

/** Comisión en centavos sobre lo vendido (redondeo al centavo). */
export function deliveryCommissionCents(revenueCents: number, commissionPercent: number): number {
  return Math.round((revenueCents * commissionPercent) / 100)
}
