import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from './apiAuth'
import CorporateAccount from '@/models/CorporateAccount'
import Tenant from '@/models/Tenant'

export type CorpRole = 'admin' | 'employee'

export interface CorpAccess {
  account: any
  role: CorpRole
  user: { id: string; email: string }
}

/**
 * Cierre de business/corp/* (opción a): requiere sesión NextAuth y que el
 * email del usuario pertenezca a una cuenta corporativa activa con acceso
 * al tenant (accessMode 'all' o tenantIds que incluyan al tenant).
 *
 * Roles:
 * - admin (companyAdminEmail): gestión completa (empleados, export,
 *   confirmar/extend/cancelar group-sessions).
 * - employee (employeeEmails): lectura (órdenes, summary) y uso del
 *   carrito grupal (crear sesión, agregar items); sin export ni gestión.
 */
export async function requireCorpAccess(
  request: NextRequest,
  tenantSlug: string,
  opts: { requireRole?: CorpRole } = {}
): Promise<{ ok: true; access: CorpAccess } | { ok: false; response: NextResponse }> {
  const deny = (error: string, status: number) =>
    ({ ok: false as const, response: NextResponse.json({ error }, { status }) })

  const user = await getSessionUser(request)
  const email = (user?.email ?? '').toLowerCase().trim()
  if (!user?.id || !email) return deny('Autenticación requerida', 401)

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
  if (!tenant) return deny('Tenant no encontrado', 404)

  const candidates = await CorporateAccount.find({
    status: 'active',
    $or: [{ companyAdminEmail: email }, { employeeEmails: email }],
  })
  const account = candidates.find(
    (a: any) =>
      a.accessMode === 'all' ||
      (a.tenantIds ?? []).some((id: unknown) => String(id) === String(tenant._id))
  )
  if (!account) return deny('Acceso denegado', 403)

  const role: CorpRole =
    account.companyAdminEmail === email ? 'admin' : 'employee'

  if (opts.requireRole === 'admin' && role !== 'admin') {
    return deny('Se requiere administrador de la cuenta corporativa', 403)
  }

  return { ok: true, access: { account, role, user: { id: String(user.id), email } } }
}
