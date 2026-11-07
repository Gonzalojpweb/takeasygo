// ============================================================================
// Quién ve y quién paga las comisiones por transferencia del comercio
// ============================================================================
// Decisión 2026-10-22: las ven el administrador, el manager y el cajero (el
// cajero maneja la caja y las transferencias que entran). Pagar es mover
// plata del negocio: administrador y manager. Superadmin, todo.
// Multi-marca D4 (07/11): el contador de una organización las VE (lectura),
// nunca las paga. Solo por membresía: el «Solo lectura» de un comercio no
// cambia.
// ============================================================================

export const COMMISSION_VIEW_ROLES = ['admin', 'manager', 'cashier'] as const
export const COMMISSION_PAY_ROLES = ['admin', 'manager'] as const

export function canViewCommissions(role: string | null | undefined, membershipRole?: string | null): boolean {
  if (membershipRole === 'accountant') return true
  return role === 'superadmin' || (COMMISSION_VIEW_ROLES as readonly string[]).includes(role ?? '')
}

export function canPayCommissions(role: string | null | undefined): boolean {
  return role === 'superadmin' || (COMMISSION_PAY_ROLES as readonly string[]).includes(role ?? '')
}
