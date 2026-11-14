import { useCallback, useEffect, useState } from "react"
import {
  DEFAULT_DISCOUNT_POLICY,
  discountActorRole,
  evaluateDiscount,
  normalizeDiscountPolicy,
  type DiscountAmounts,
  type DiscountDecision,
  type DiscountPolicy,
} from "@takeasygo/business/browser"
import { posApi } from "./pos-api"
import { currentPosUser } from "./offline/offline-auth"

// ============================================================================
// Política de descuentos del comercio en el POS (14/11/2026)
// ============================================================================
// La define el admin en el panel (Cajas POS › Descuentos). El POS guarda una
// copia por comercio en el equipo para:
//   · avisar en el diálogo ANTES de confirmar si hace falta PIN (y de quién)
//     o si el descuento supera el máximo del rol;
//   · pedir el PIN correcto SIN internet (etapa 7 del modo offline).
// Es solo una guía: el server vuelve a decidir siempre con la política que
// corresponda, también al reprocesar lo hecho sin internet. Una copia vieja
// o tocada a mano en el equipo no habilita nada: el server la rechaza.
// ============================================================================

export interface CachedDiscountPolicy {
  version: number
  policy: DiscountPolicy
}

const EVENT = "pos:discount-policy"
const key = (tenantId: string) => `pos.discountPolicy.${tenantId}`
const FALLBACK: CachedDiscountPolicy = { version: 0, policy: normalizeDiscountPolicy(DEFAULT_DISCOUNT_POLICY) }

export function readCachedDiscountPolicy(tenantId: string | undefined): CachedDiscountPolicy {
  if (!tenantId) return FALLBACK
  try {
    const raw = localStorage.getItem(key(tenantId))
    if (!raw) return FALLBACK
    const data = JSON.parse(raw) as { version?: unknown; policy?: unknown }
    return { version: typeof data.version === "number" ? data.version : 0, policy: normalizeDiscountPolicy(data.policy) }
  } catch {
    return FALLBACK
  }
}

function store(tenantId: string, value: CachedDiscountPolicy): void {
  try {
    localStorage.setItem(key(tenantId), JSON.stringify(value))
  } catch {
    // Sin almacenamiento: igual se usa en esta sesión.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { tenantId, value } }))
}

/** Trae la política vigente del server y la guarda en el equipo. */
export async function refreshDiscountPolicy(tenantId: string): Promise<CachedDiscountPolicy> {
  const res = await posApi<{ version: number; policy: unknown }>(tenantId, "/config/discounts")
  const value = { version: res.version, policy: normalizeDiscountPolicy(res.policy) }
  store(tenantId, value)
  return value
}

/**
 * Política del comercio para la pantalla: la copia del equipo al instante y
 * la del server apenas llega (sin conexión queda la copia).
 */
export function useDiscountPolicy(tenantId: string | undefined): CachedDiscountPolicy {
  const [state, setState] = useState(() => ({ tenantId, value: readCachedDiscountPolicy(tenantId) }))

  const onChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ tenantId: string; value: CachedDiscountPolicy }>).detail
    if (detail?.tenantId === tenantId) setState({ tenantId, value: detail.value })
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    window.addEventListener(EVENT, onChange)
    // La respuesta llega por el evento (store): si la pantalla ya se cerró,
    // solo se actualiza la copia del equipo.
    refreshDiscountPolicy(tenantId).catch(() => { /* sin conexión o sin permiso: queda la copia */ })
    return () => window.removeEventListener(EVENT, onChange)
  }, [tenantId, onChange])

  return state.tenantId === tenantId ? state.value : readCachedDiscountPolicy(tenantId)
}

/**
 * Decisión para quien está operando ahora (con o sin internet). Con un rol
 * que la política no conoce (otra forma de sesión) devuelve null: la pantalla
 * no bloquea nada y decide el server.
 */
export function evaluateForCurrentUser(policy: DiscountPolicy, amounts: DiscountAmounts): DiscountDecision | null {
  const role = currentPosUser().role
  if (!discountActorRole(role) && role !== "waiter") return null
  return evaluateDiscount(policy, role, amounts)
}
