import { PLAN_ACCESS, canAccess, type Feature, type Plan } from '@/lib/plans'

// ============================================================================
// TEO — contexto inmutable (harness §«Contexto inmutable»)
// ============================================================================
// Rol, negocio y módulos activos los decide el SERVIDOR en cada mensaje (sesión
// + plan en la base). El usuario no puede cambiarlos escribiendo y el front no
// los manda como parámetros.
// ============================================================================

/** Roles de la documentación del asistente. */
export type AssistantRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen'

export interface AssistantContext {
  tenantId: string
  tenantName: string
  userId: string
  /** Rol real del usuario en TakeasyGO. */
  userRole: string
  /** Rol con el que se eligen documentos. */
  role: AssistantRole
  plan: Plan
  activeModules: Feature[]
  locationId: string | null
  language: 'es'
}

/**
 * Rol del sistema → rol de la documentación. null = rol sin acceso al
 * asistente del panel (consumidor, vendedor).
 */
export function assistantRoleFor(userRole: string | null | undefined): AssistantRole | null {
  switch (userRole) {
    case 'superadmin':
    case 'admin':
      return 'admin'
    case 'manager':
    case 'operations_manager':
    case 'auditor':
      return 'manager'
    case 'cashier':
      return 'cashier'
    case 'waiter':
    case 'host':
      return 'waiter'
    case 'kitchen_lead':
    case 'staff':
      return 'kitchen'
    default:
      return null
  }
}

/** Módulos que el plan habilita (fuente de verdad: PLAN_ACCESS). */
export function activeModulesFor(plan: Plan): Feature[] {
  return (Object.keys(PLAN_ACCESS) as Feature[]).filter((f) => canAccess(plan, f))
}

export function buildContext(input: {
  tenant: { _id: unknown; name?: string; plan?: Plan | null }
  user: { id: string; role: string; assignedLocation?: string | null }
}): AssistantContext | null {
  const role = assistantRoleFor(input.user.role)
  if (!role) return null
  const plan: Plan = input.tenant.plan ?? 'try'
  return Object.freeze({
    tenantId: String(input.tenant._id),
    tenantName: input.tenant.name ?? '',
    userId: input.user.id,
    userRole: input.user.role,
    role,
    plan,
    activeModules: activeModulesFor(plan),
    locationId: input.user.assignedLocation ?? null,
    language: 'es' as const,
  })
}
