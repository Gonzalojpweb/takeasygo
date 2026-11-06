import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSessionUser } from '@/lib/apiAuth'
import { getAccessMode, recordShadow } from '@/lib/access-central'
import { canOperateTenant } from '@/lib/tenant-membership'

// ============================================================================
// Acceso a un comercio — punto único (multi-marca, PR 2 — 06/11/2026)
// ============================================================================
// Único lugar (junto con lib/apiAuth.ts) donde se decide «¿este usuario puede
// operar este comercio?». Hoy hay dos fuentes:
//   · el JWT de NextAuth (claims congelados hasta 8 h: rol, comercio), y
//   · el usuario leído de la base (getSessionUser: rol, comercio y estado
//     frescos, caché de 30 s).
// El interruptor `access.central` (lib/access-central.ts) elige cuál manda:
// `off` el JWT (como siempre), `log` el JWT registrando las diferencias,
// `enforce` la base. En la Fase 1 (organizaciones) la proyección de
// membresías entra acá: por eso ninguna ruta compara la sesión a mano
// (contrato __tests__/identity-access-contract.test.ts).
// ============================================================================

export { belongsTo, canOperateTenant } from '@/lib/tenant-membership'

export interface SessionIdentity {
  id: string | null
  email: string | null
  name: string | null
  role: string | null
}

/**
 * Identidad de quien llama (id, email, nombre) para registrar, vincular un
 * pedido al cliente o leer sus preferencias. NO decide acceso a un comercio:
 * para eso, authorizeTenantBySlug / requireTenantRole.
 */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const session = await auth()
  const user = session?.user as { id?: string; email?: string | null; name?: string | null; role?: string } | undefined
  if (!user) return null
  return { id: user.id ?? null, email: user.email ?? null, name: user.name ?? null, role: user.role ?? null }
}

/**
 * Misma forma que `auth()` (`session?.user?.email`) pero solo identidad:
 * reemplazo directo en las rutas que usaban `auth()` para saber quién es.
 */
export async function getIdentitySession(): Promise<{ user: SessionIdentity } | null> {
  const identity = await getSessionIdentity()
  return identity ? { user: identity } : null
}

export interface TenantPrincipal {
  id: string | null
  email: string | null
  name: string | null
  /** Rol efectivo en el comercio. */
  role: string
  tenantId: string | null
  assignedLocations: string[]
  via: 'superadmin' | 'home'
}

export type TenantAuthResult =
  | { ok: true; principal: TenantPrincipal }
  | { ok: false; response: NextResponse }

const deny = (status: 401 | 403, error: string): TenantAuthResult => ({ ok: false, response: NextResponse.json({ error }, { status }) })

function pathOf(request?: NextRequest): string | null {
  try {
    return request?.nextUrl?.pathname ?? (request ? new URL(request.url).pathname : null)
  } catch {
    return null
  }
}

interface JwtUser {
  id?: string
  email?: string | null
  name?: string | null
  role?: string
  tenantId?: string | null
  tenantSlug?: string | null
  assignedLocations?: string[] | null
}

/**
 * Autoriza por el slug del path (rutas que hoy comparan `tenantSlug` del JWT).
 * `roles`: si viene, además del comercio exige uno de esos roles (superadmin
 * siempre pasa). Respuestas iguales a las de las rutas: 401 / 403.
 */
export async function authorizeTenantBySlug(
  request: NextRequest | undefined,
  tenantSlug: string,
  opts: { family: string; roles?: readonly string[] }
): Promise<TenantAuthResult> {
  const mode = await getAccessMode()
  const session = await auth()
  const jwt = session?.user as JwtUser | undefined

  // Decisión vieja (JWT): exactamente la de las rutas antes del PR 2.
  const oldTenantOk = Boolean(jwt) && (jwt!.role === 'superadmin' || jwt!.tenantSlug === tenantSlug)
  const oldRoleOk = !opts.roles || jwt?.role === 'superadmin' || (jwt?.role ? opts.roles.includes(jwt.role) : false)
  const oldOk = oldTenantOk && oldRoleOk

  const fromJwt = (): TenantAuthResult => {
    if (!jwt) return deny(401, 'No autorizado')
    if (!oldTenantOk) return deny(403, 'Acceso denegado')
    if (!oldRoleOk) return deny(403, 'Tu rol no puede hacer esta acción')
    return {
      ok: true,
      principal: {
        id: jwt.id ?? null, email: jwt.email ?? null, name: jwt.name ?? null, role: jwt.role ?? '',
        tenantId: jwt.tenantId ?? null, assignedLocations: jwt.assignedLocations ?? [],
        via: jwt.role === 'superadmin' ? 'superadmin' : 'home',
      },
    }
  }
  if (mode === 'off') return fromJwt()

  // Decisión nueva (base): rol, comercio y estado frescos.
  const fresh = (await getSessionUser(request)) as JwtUser | null
  let tenantId: string | null = null
  try {
    const { connectDB } = await import('@/lib/mongoose')
    await connectDB()
    const Tenant = (await import('@/models/Tenant')).default
    const t = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean<{ _id: unknown }>()
    tenantId = t ? String(t._id) : null
  } catch {
    tenantId = null
  }
  const newTenantOk = canOperateTenant(fresh, tenantId)
  const newRoleOk = !opts.roles || fresh?.role === 'superadmin' || (fresh?.role ? opts.roles.includes(fresh.role) : false)
  const newOk = Boolean(fresh) && newTenantOk && newRoleOk

  if (mode === 'log') {
    recordShadow({
      family: opts.family, route: pathOf(request), userId: jwt?.id ?? fresh?.id ?? null, tenantId,
      oldDecision: oldOk, newDecision: newOk, oldRole: jwt?.role ?? null, newRole: fresh?.role ?? null,
      hadJwt: Boolean(jwt), freshFound: Boolean(fresh),
      oldTenantMatches: oldTenantOk, newTenantMatches: newTenantOk,
    })
    return fromJwt()
  }

  // enforce
  if (!fresh) return deny(401, 'No autorizado')
  if (!newTenantOk) return deny(403, 'Acceso denegado')
  if (!newRoleOk) return deny(403, 'Tu rol no puede hacer esta acción')
  return {
    ok: true,
    principal: {
      id: fresh.id ?? null, email: fresh.email ?? null, name: fresh.name ?? null, role: fresh.role ?? '',
      tenantId: fresh.tenantId ?? null, assignedLocations: fresh.assignedLocations ?? [],
      via: fresh.role === 'superadmin' ? 'superadmin' : 'home',
    },
  }
}

/**
 * Guardia de superadmin (lib/apiAuth.requireSuperAdmin delega acá). Con
 * `enforce` el rol sale de la base: quitarle el superadmin a alguien corta el
 * acceso en ≤ 30 s, no en 8 h (S5).
 */
export async function requireSuperAdminCentral(family = 'superadmin', request?: NextRequest): Promise<NextResponse | null> {
  const mode = await getAccessMode()
  const session = await auth()
  const jwtRole = (session?.user as JwtUser | undefined)?.role ?? null
  const oldOk = jwtRole === 'superadmin'
  const denied = NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  if (mode === 'off') return oldOk ? null : denied

  const fresh = (await getSessionUser(request)) as JwtUser | null
  const newOk = fresh?.role === 'superadmin'
  if (mode === 'log') {
    recordShadow({
      family, route: pathOf(request), userId: (session?.user as JwtUser | undefined)?.id ?? fresh?.id ?? null, tenantId: null,
      oldDecision: oldOk, newDecision: newOk, oldRole: jwtRole, newRole: fresh?.role ?? null,
      hadJwt: Boolean(session?.user), freshFound: Boolean(fresh),
    })
    return oldOk ? null : denied
  }
  return newOk ? null : denied
}

// ── Páginas del admin (PR 3) ────────────────────────────────────────────────

export interface AdminSessionUser {
  id: string | null
  email: string | null
  name: string | null
  role: string
  tenantId: string | null
  tenantSlug: string | null
  assignedLocations: string[]
  image?: string | null
}

/**
 * Sesión para las páginas del panel de un comercio: misma forma que `auth()`
 * (`session?.user?.role`), pero devuelve null si la persona NO puede operar
 * ese comercio (S4: cada página se protege sola, sin confiar en el layout).
 * El slug sale del parámetro o, si no viene, del encabezado `x-tenant-slug`
 * (en las rutas del comercio lo escribe el proxy; el del cliente se pisa).
 * Respeta `access.central`: off/log deciden con el JWT, enforce con la base.
 */
export async function getAdminSession(tenantSlug?: string | null): Promise<{ user: AdminSessionUser } | null> {
  let slug = tenantSlug ?? null
  if (!slug) {
    try {
      const { headers } = await import('next/headers')
      slug = (await headers()).get('x-tenant-slug')
    } catch {
      slug = null
    }
  }
  if (!slug) return null

  const mode = await getAccessMode()
  const session = await auth()
  const jwt = session?.user as (JwtUser & { image?: string | null }) | undefined
  const oldOk = Boolean(jwt) && (jwt!.role === 'superadmin' || jwt!.tenantSlug === slug)
  const fromJwt = () => (oldOk && jwt
    ? { user: { id: jwt.id ?? null, email: jwt.email ?? null, name: jwt.name ?? null, role: jwt.role ?? '', tenantId: jwt.tenantId ?? null, tenantSlug: jwt.tenantSlug ?? null, assignedLocations: jwt.assignedLocations ?? [], image: jwt.image ?? null } }
    : null)
  if (mode === 'off') return fromJwt()

  const fresh = (await getSessionUser()) as (JwtUser & { image?: string | null }) | null
  let tenantId: string | null = null
  try {
    const { connectDB } = await import('@/lib/mongoose')
    await connectDB()
    const Tenant = (await import('@/models/Tenant')).default
    const t = await Tenant.findOne({ slug }).select('_id').lean<{ _id: unknown }>()
    tenantId = t ? String(t._id) : null
  } catch {
    tenantId = null
  }
  const newOk = Boolean(fresh) && canOperateTenant(fresh, tenantId)
  if (mode === 'log') {
    recordShadow({
      family: 'admin-page', route: null, userId: jwt?.id ?? fresh?.id ?? null, tenantId,
      oldDecision: oldOk, newDecision: newOk, oldRole: jwt?.role ?? null, newRole: fresh?.role ?? null,
      hadJwt: Boolean(jwt), freshFound: Boolean(fresh), oldTenantMatches: oldOk, newTenantMatches: newOk,
    })
    return fromJwt()
  }
  return newOk && fresh
    ? { user: { id: fresh.id ?? null, email: fresh.email ?? null, name: fresh.name ?? null, role: fresh.role ?? '', tenantId: fresh.tenantId ?? null, tenantSlug: slug, assignedLocations: fresh.assignedLocations ?? [], image: fresh.image ?? null } }
    : null
}
