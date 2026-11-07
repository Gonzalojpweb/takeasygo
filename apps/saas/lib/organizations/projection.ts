/**
 * lib/organizations/projection.ts — proyección de membresías (multi-marca PR 8)
 *
 * Diseño §5.1–5.3 y §5 del entregable 1. Un único punto: `getSessionUser`
 * (lib/apiAuth.ts) llama a `projectSessionUser` con el usuario fresco. Si la
 * persona tiene una membresía activa que alcanza el comercio del CONTEXTO
 * (el de la URL), se devuelve el mismo usuario con `role`, `tenantId` y
 * `assignedLocations` de ese comercio. Así `requireAuth`, `requireTenantRole`,
 * `posRoute`, `inventoryRoute`, `page-scope`, `location-scope`, etc. quedan
 * intactos: reciben un usuario que ya es «del comercio».
 *
 * Reglas de seguridad:
 *   1. El comercio de contexto sale SOLO del path (/api/{slug}/…) o del header
 *      `x-tenant-slug` que escribe el proxy (el del cliente se borra, PR 5).
 *      Nunca de body, query ni cookies.
 *   2. En el comercio de origen manda el acceso de origen (legacy): ninguna
 *      membresía cambia lo que un usuario existente ya podía hacer. `consumer`
 *      y `member` nunca usan esa rama (D3 opción B: el cliente no se convierte).
 *   3. Un grant de sede NUNCA produce `assignedLocations: []` (= «todas»).
 *   4. Sin contexto, sin membresía o con org/comercio suspendido: se devuelve
 *      el usuario de origen y las guardias darán 403 (falla cerrado).
 *   5. Escrituras (método ≠ GET/HEAD) releen comercio, organización y
 *      membresía de la base, sin caché.
 *   6. El token del POS no se proyecta (lo garantiza getSessionUser).
 */
import type { NextRequest } from 'next/server'
import type { OrgRole } from '@/models/OrgMembership'
import { effectiveLocationRole } from './membership-rules'

// ── Parte pura ────────────────────────────────────────────────────────────────

export interface MembershipLite {
  id: string
  orgRole: OrgRole
  status: string
  tenantRole?: 'admin' | 'manager' | null
  scope: { allTenants: boolean; tenantIds: string[]; locations: { tenantId: string; locationId: string }[] }
}

export interface Grant {
  role: string
  /** [] = todas las sedes del comercio. Nunca [] para roles de sede. */
  locationIds: string[]
}

/** Qué da una membresía en un comercio de su organización (pura, tabla §4). */
export function effectiveGrant(m: MembershipLite, tenantId: string): Grant | null {
  if (m.status !== 'active') return null
  const covers = m.scope.allTenants || m.scope.tenantIds.includes(tenantId)
  switch (m.orgRole) {
    case 'owner':
      return { role: effectiveLocationRole('owner'), locationIds: [] }
    case 'org_admin':
    case 'accountant':
      return covers ? { role: effectiveLocationRole(m.orgRole), locationIds: [] } : null
    case 'brand_manager':
      // Nunca por allTenants: el gerente de marca es por marca concreta.
      return m.scope.tenantIds.includes(tenantId)
        ? { role: effectiveLocationRole('brand_manager', m.tenantRole), locationIds: [] }
        : null
    case 'location_manager':
    case 'operations': {
      const locs = [...new Set(m.scope.locations.filter(l => l.tenantId === tenantId).map(l => l.locationId))]
      if (locs.length === 0) return null // nunca [] = «todas» por accidente
      return { role: effectiveLocationRole(m.orgRole), locationIds: locs }
    }
    default:
      return null
  }
}

/** Segmentos de /api/* que NO son un comercio (carpetas fijas de app/api). */
export const NON_TENANT_API_SEGMENTS: ReadonlySet<string> = new Set([
  'agent', 'app-stories', 'auth', 'business', 'cis', 'crm', 'cron', 'delivery', 'directory', 'explore',
  'internal', 'leads', 'menu-link', 'mp-oauth', 'network', 'og', 'onboarding', 'push', 'superadmin',
  'tgo', 'tia', 'user', 'visits', 'wallet', 'webhooks',
  // Futuras (panel de organización)
  'grupo',
])

/** Comercio del path de una API (`/api/{slug}/…`), o null si no es de comercio. */
export function tenantSlugFromApiPath(pathname: string): string | null {
  const m = /^\/api\/([a-z0-9-]{2,50})(\/|$)/.exec(pathname)
  if (!m || NON_TENANT_API_SEGMENTS.has(m[1])) return null
  return m[1]
}

/** Roles que nunca usan el acceso de origen (D3 B y `member`). */
const NON_HOME_ROLES = new Set(['consumer', 'member'])

export function isWriteRequest(request?: NextRequest): boolean {
  const method = request?.method?.toUpperCase()
  return Boolean(method) && method !== 'GET' && method !== 'HEAD'
}

// ── Cachés por instancia (20 s, entregable 1 §5) ──────────────────────────────

const TTL_MS = 20_000
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

interface TenantMeta { id: string; slug: string; organizationId: string | null; status: string }
interface OrgMeta { status: string; membershipsVersion: number }

const tenantCache = new Map<string, { at: number; data: TenantMeta | null }>()
const orgCache = new Map<string, { at: number; data: OrgMeta | null }>()
const membershipCache = new Map<string, { at: number; data: MembershipLite | null }>()

/** Tests y cambios de vinculación (desvincular una marca invalida al instante en esta instancia). */
export function clearProjectionCaches(): void {
  tenantCache.clear()
  orgCache.clear()
  membershipCache.clear()
}

function fresh<T>(map: Map<string, { at: number; data: T }>, key: string, noCache: boolean): T | undefined {
  if (noCache) return undefined
  const hit = map.get(key)
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : undefined
}

async function db() {
  const { connectDB } = await import('@/lib/mongoose')
  await connectDB()
}

async function tenantMeta(slugOrId: string, noCache: boolean): Promise<TenantMeta | null> {
  const cached = fresh(tenantCache, slugOrId, noCache)
  if (cached !== undefined) return cached
  await db()
  const Tenant = (await import('@/models/Tenant')).default
  const filter = OBJECT_ID_RE.test(slugOrId) ? { _id: slugOrId } : { slug: slugOrId }
  const t = await Tenant.findOne(filter).select('_id slug organizationId status')
    .lean<{ _id: unknown; slug: string; organizationId?: unknown; status?: string }>()
  const data: TenantMeta | null = t
    ? { id: String(t._id), slug: t.slug, organizationId: t.organizationId ? String(t.organizationId) : null, status: t.status ?? 'active' }
    : null
  tenantCache.set(slugOrId, { at: Date.now(), data })
  return data
}

async function orgMeta(orgId: string, noCache: boolean): Promise<OrgMeta | null> {
  const cached = fresh(orgCache, orgId, noCache)
  if (cached !== undefined) return cached
  await db()
  const Organization = (await import('@/models/Organization')).default
  const o = await Organization.findById(orgId).select('status membershipsVersion')
    .lean<{ status: string; membershipsVersion?: number }>()
  const data: OrgMeta | null = o ? { status: o.status, membershipsVersion: o.membershipsVersion ?? 0 } : null
  orgCache.set(orgId, { at: Date.now(), data })
  return data
}

async function activeMembership(userId: string, orgId: string, version: number, noCache: boolean): Promise<MembershipLite | null> {
  const key = `${userId}:${orgId}:${version}`
  const cached = fresh(membershipCache, key, noCache)
  if (cached !== undefined) return cached
  await db()
  const OrgMembership = (await import('@/models/OrgMembership')).default
  const m = await OrgMembership.findOne({ organizationId: orgId, userId, status: 'active' })
    .select('orgRole status tenantRole scope')
    .lean<{ _id: unknown; orgRole: OrgRole; status: string; tenantRole?: 'admin' | 'manager' | null; scope?: { allTenants?: boolean; tenantIds?: unknown[]; locations?: { tenantId: unknown; locationId: unknown }[] } }>()
  const data: MembershipLite | null = m
    ? {
        id: String(m._id),
        orgRole: m.orgRole,
        status: m.status,
        tenantRole: m.tenantRole ?? null,
        scope: {
          allTenants: Boolean(m.scope?.allTenants),
          tenantIds: (m.scope?.tenantIds ?? []).map(String),
          locations: (m.scope?.locations ?? []).map(l => ({ tenantId: String(l.tenantId), locationId: String(l.locationId) })),
        },
      }
    : null
  membershipCache.set(key, { at: Date.now(), data })
  return data
}

// ── Contexto ──────────────────────────────────────────────────────────────────

/** Comercio de contexto: path de la API o header del proxy (server components). */
export async function contextTenantSlug(request?: NextRequest): Promise<string | null> {
  if (request) {
    let pathname = ''
    try {
      pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname
    } catch {
      pathname = ''
    }
    return tenantSlugFromApiPath(pathname)
  }
  try {
    const { headers } = await import('next/headers')
    return (await headers()).get('x-tenant-slug')
  } catch {
    return null // fuera de un request (scripts, tests sin contexto)
  }
}

// ── Proyección ────────────────────────────────────────────────────────────────

export interface ProjectableUser {
  id?: string | null
  role?: string | null
  tenantId?: string | null
  tenantSlug?: string | null
  assignedLocation?: string | null
  assignedLocations?: string[] | null
}

export interface ProjectedFields {
  via: 'membership'
  membershipId: string
  membershipRole: OrgRole
  organizationId: string
}

export interface ProjectionResult {
  tenant: { id: string; slug: string }
  grant: Grant
  membership: MembershipLite
  organizationId: string
}

/**
 * ¿Qué da la organización a este usuario en el comercio de contexto?
 * null = nada (sin org, org/comercio no activos, sin membresía o fuera de alcance).
 * No mira el flag ni el acceso de origen: eso lo decide `projectSessionUser`.
 */
export async function resolveMembershipAccess(userId: string, slugOrId: string, noCache: boolean): Promise<ProjectionResult | null> {
  const tenant = await tenantMeta(slugOrId, noCache)
  if (!tenant || !tenant.organizationId || tenant.status === 'deleted') return null
  const org = await orgMeta(tenant.organizationId, noCache)
  if (!org || org.status !== 'active') return null
  const m = await activeMembership(userId, tenant.organizationId, org.membershipsVersion, noCache)
  if (!m) return null
  const grant = effectiveGrant(m, tenant.id)
  if (!grant) return null
  return { tenant: { id: tenant.id, slug: tenant.slug }, grant, membership: m, organizationId: tenant.organizationId }
}

/**
 * Proyecta al usuario fresco sobre el comercio de contexto según `org.access`.
 * Devuelve el mismo objeto si no corresponde proyectar.
 */
export async function projectSessionUser<T extends ProjectableUser>(base: T, request?: NextRequest, explicitSlug?: string | null): Promise<T | (T & ProjectedFields)> {
  if (!base?.id || !OBJECT_ID_RE.test(base.id) || base.role === 'superadmin') return base

  const { getOrgAccessMode } = await import('@/lib/org-access')
  const mode = await getOrgAccessMode()
  if (mode === 'off') return base

  try {
    // explicitSlug: comercio que el servidor ya validó (p. ej. el del state
    // firmado del callback de Mercado Pago); nunca algo que mande el cliente.
    const slug = explicitSlug || (await contextTenantSlug(request))
    if (!slug) return base
    const noCache = isWriteRequest(request)
    const tenant = await tenantMeta(slug, noCache)
    if (!tenant) return base

    // Acceso de origen: manda siempre en su comercio (staff, no consumer/member).
    const isHome = Boolean(base.tenantId) && String(base.tenantId) === tenant.id && !NON_HOME_ROLES.has(base.role ?? '')
    if (isHome) return base

    const access = await resolveMembershipAccess(base.id, slug, noCache)
    if (!access) return base

    if (mode === 'log') {
      const { recordShadow } = await import('@/lib/access-central')
      recordShadow({
        family: 'org-projection',
        route: request?.nextUrl?.pathname ?? null,
        userId: base.id,
        tenantId: tenant.id,
        oldDecision: false,
        newDecision: true,
        oldRole: base.role ?? null,
        newRole: access.grant.role,
        hadJwt: true,
        freshFound: true,
        reason: 'org_membership',
      })
      return base
    }

    return {
      ...base,
      role: access.grant.role,
      tenantId: access.tenant.id,
      tenantSlug: access.tenant.slug,
      assignedLocations: access.grant.locationIds,
      assignedLocation: access.grant.locationIds[0] ?? null,
      via: 'membership' as const,
      membershipId: access.membership.id,
      membershipRole: access.membership.orgRole,
      organizationId: access.organizationId,
    }
  } catch (err) {
    // Ante un error de base, el usuario de origen: nunca abre de más.
    console.warn('[org-projection] sin proyección por error:', (err as Error)?.message)
    return base
  }
}
