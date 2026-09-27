/**
 * Gate centralizado de visibilidad/operación pública de un tenant.
 *
 * ÚNICA fuente de verdad para: "¿este tenant puede mostrarse/operar públicamente?"
 * Ningún punto de entrada público debe volver a evaluar `isActive`, `status`
 * ni `onboarding.status` por su cuenta.
 *
 * Semántica:
 *  - onboarding.status ausente ('none') ⇒ tenant precargo, se comporta igual que 'approved'.
 *  - isActive false                     ⇒ tenant deshabilitado (404 en lecturas públicas).
 *  - status 'active' | 'paused'         ⇒ operando / pausado (ambos siguen existiendo
 *                                          públicamente; 'deleted' queda fuera).
 *  - tenant null/undefined              ⇒ nunca operativo (p.ej. $unwind sin match).
 */
export interface TenantGateInput {
  onboarding?: { status?: string } | null
  isActive: boolean
  status: string
}

export function isTenantPubliclyOperational(
  tenant: TenantGateInput | null | undefined
): boolean {
  if (!tenant) return false
  const onboardingStatus = tenant.onboarding?.status ?? 'none'
  if (!['none', 'approved'].includes(onboardingStatus)) return false
  if (!tenant.isActive) return false
  if (!['active', 'paused'].includes(tenant.status)) return false
  return true
}
