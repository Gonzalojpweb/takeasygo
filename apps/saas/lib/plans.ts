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
  PLAN_FEATURES_LANDING,
} from '@takeasygo/business'
