// Re-export desde @takeasygo/business — fuente de verdad
// Este archivo se mantiene por compatibilidad con imports existentes en el SaaS
export {
  type Plan,
  type Feature,
  canAccess,
  requiredPlanFor,
  PLAN_ACCESS,
  PLAN_LABELS,
  PLAN_TAGLINES,
  PLAN_COLORS,
  PLAN_PRICE,
  LOYALTY_MEMBER_LIMIT,
  HIDDEN_REWARDS_GROWTH_LIMIT,
  HIDDEN_REWARDS_LIMIT,
  PLAN_FEATURES_LANDING,
} from '@takeasygo/business'

/** Planes que el prospecto puede elegir en el picker del onboarding.
 *  Excluye `anfitrion`: esa asignación es interna, nunca la pide el cliente. */
export type SelectablePlan = 'trial' | 'try' | 'buy' | 'full'

export const SELECTABLE_PLANS: SelectablePlan[] = ['trial', 'try', 'buy', 'full']

/**
 * Resuelve el plan inicial de una alta auto-gestionada. SIEMPRE en el server:
 * el valor que manda es este, no lo que mande el cliente.
 *
 * - `origen === 'demo'` fuerza 'trial' sin importar el plan pedido (el query
 *   param es una pista del cliente, acá es la autoridad).
 * - Un plan fuera de SELECTABLE_PLANS cae a 'trial'.
 */
export function resolveInitialPlan(
  requested?: string | null,
  origen?: string | null
): SelectablePlan {
  if (origen === 'demo') return 'trial'
  return (SELECTABLE_PLANS as string[]).includes(requested ?? '')
    ? (requested as SelectablePlan)
    : 'trial'
}
