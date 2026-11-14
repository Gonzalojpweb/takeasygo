import { redirect } from 'next/navigation'
import { getAdminSession, type AdminSessionUser } from '@/lib/tenant-access'

// ============================================================================
// Guardia de las páginas de caja del panel (14/11/2026)
// ============================================================================
// Hallazgo: /admin/caja-pos (cierres Z, faltantes por empleado) solo se
// ocultaba en el menú; la página no verificaba ni el rol ni que la sesión
// fuera de ESTE comercio. Cada página se protege sola (criterio S4): sesión
// del comercio del slug (getAdminSession) y rol admin/encargado.
// ============================================================================

export const CASH_PAGE_ROLES = ['admin', 'manager'] as const

export async function requireCashPageSession(roles: readonly string[] = CASH_PAGE_ROLES): Promise<AdminSessionUser> {
  const session = await getAdminSession()
  const role = session?.user?.role ?? ''
  if (!session || (role !== 'superadmin' && !roles.includes(role))) redirect('/')
  return session.user
}
