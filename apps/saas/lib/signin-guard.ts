/**
 * lib/signin-guard.ts — ¿esta cuenta puede iniciar sesión con contraseña/SSO?
 *
 * - superadmin: siempre (acceso global, sin comercio).
 * - member (multi-marca PR 9b): sin comercio de origen; necesita al menos una
 *   membresía activa en una organización activa.
 * - resto: su comercio de origen debe existir y no estar dado de baja (una
 *   cuenta huérfana tras borrar un comercio no entra).
 */
export async function isSignInAllowed(user: { _id?: unknown; role?: string; tenantId?: unknown }): Promise<boolean> {
  if (user.role === 'superadmin') return true
  if (user.role === 'member') {
    if (!user._id) return false
    const { hasUsableMembership } = await import('@/lib/organizations/me')
    return hasUsableMembership(String(user._id))
  }
  if (!user.tenantId) return false
  const { default: Tenant } = await import('@/models/Tenant')
  const tenant = await Tenant.findById(user.tenantId).select('_id status').lean<{ status?: string }>()
  return Boolean(tenant) && tenant!.status !== 'deleted'
}
