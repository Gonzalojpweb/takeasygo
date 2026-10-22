// ============================================================================
// Quién ve y quién paga las comisiones por transferencia del comercio
// ============================================================================
// Decisión 2026-10-22: las ven el administrador, el manager y el cajero (el
// cajero maneja la caja y las transferencias que entran). Pagar es mover
// plata del negocio: administrador y manager. Superadmin, todo.
// ============================================================================

export const COMMISSION_VIEW_ROLES = ['admin', 'manager', 'cashier'] as const
export const COMMISSION_PAY_ROLES = ['admin', 'manager'] as const

export function canViewCommissions(role: string | null | undefined): boolean {
  return role === 'superadmin' || (COMMISSION_VIEW_ROLES as readonly string[]).includes(role ?? '')
}

export function canPayCommissions(role: string | null | undefined): boolean {
  return role === 'superadmin' || (COMMISSION_PAY_ROLES as readonly string[]).includes(role ?? '')
}
