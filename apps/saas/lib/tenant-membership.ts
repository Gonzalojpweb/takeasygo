// ============================================================================
// Pertenencia a un comercio — funciones puras (multi-marca, PR 2)
// ============================================================================
// Sin imports: las usan lib/apiAuth.ts y lib/tenant-access.ts sin crear
// dependencias circulares. En la Fase 1 la pertenencia por membresía de
// organización se resuelve antes (proyección en getSessionUser) y llega acá
// como el `tenantId` efectivo del usuario.
// ============================================================================

interface SessionLike {
  role?: string | null
  tenantId?: string | null
}

/** ¿El usuario es de este comercio? (sin contar superadmin). */
export function belongsTo(user: SessionLike | null | undefined, tenantId: unknown): boolean {
  if (!user?.tenantId || tenantId === null || tenantId === undefined) return false
  return String(user.tenantId) === String(tenantId)
}

/** ¿Puede operar el comercio? Superadmin sí; un consumidor nunca. */
export function canOperateTenant(user: SessionLike | null | undefined, tenantId: unknown): boolean {
  if (!user?.role || user.role === 'consumer') return false
  return user.role === 'superadmin' || belongsTo(user, tenantId)
}
