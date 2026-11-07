import { auth } from '@/lib/auth'
import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { extractBearerToken, verifyPosToken } from '@/lib/posJwt'
import { belongsTo } from '@/lib/tenant-membership'

/**
 * Mapea un payload JWT RS256 emitido por apps/sync al mismo shape que
 * devuelve la sesión NextAuth, para que `requireAuth` / `requireAdminRole`
 * funcionen idéntico para el POS y para el panel admin.
 *
 * Nota de scopes: `assignedLocations` refleja el claim `locationId` del token.
 * Un token sin `locationId` (tenant single-sede legacy) queda con arreglo
 * vacío; las rutas `/pos/*` resuelven el scoping por su cuenta
 * (sin claim = todo el tenant, con claim = solo esa sede).
 */
function toSessionFromPosToken(payload: {
  sub: string
  tenantId: string
  role: string
  locationId?: string
}) {
  return {
    id: payload.sub,
    role: payload.role,
    // El JWT del POS no lleva email: las rutas que lo necesiten (corp)
    // lo rechazan con 401 al venir vacío.
    email: null,
    tenantId: payload.tenantId,
    tenantSlug: null,
    assignedLocation: payload.locationId ?? null,
    assignedLocations: payload.locationId ? [payload.locationId] : [],
    assignedTenants: [payload.tenantId],
    image: null,
  }
}

// ── Permisos frescos ─────────────────────────────────────────────────────────
// El JWT de NextAuth vive 8 h y congela role/tenantId/assignedLocations del
// login. Para que quitar una sede, cambiar el rol o desactivar un usuario
// tenga efecto en las APIs sin esperar a que expire, se releen de la DB con
// un caché por instancia de 20 s (multi-marca PR 8: antes 30 s). Las
// escrituras (método ≠ GET/HEAD) releen siempre de la base.
const FRESH_TTL_MS = 20_000
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

interface FreshUser {
  role: string
  tenantId: string | null
  assignedLocations: string[]
  /** Multi-marca PR 8: sesiones emitidas antes de esta fecha no valen. */
  sessionsValidAfter: number | null
}

const freshCache = new Map<string, { at: number; data: FreshUser | null }>()

/** Solo para tests: vacía el caché de permisos frescos. */
export function clearFreshUserCache() {
  freshCache.clear()
}

/**
 * undefined = no verificable (id que no es ObjectId: usuarios sintéticos de
 * tests/sistema) → se usan los claims del token. null = usuario borrado o
 * desactivado → sin sesión.
 */
async function loadFreshUser(id: string | null | undefined, noCache = false): Promise<FreshUser | null | undefined> {
  if (!id || !OBJECT_ID_RE.test(id)) return undefined
  const cached = noCache ? undefined : freshCache.get(id)
  if (cached && Date.now() - cached.at < FRESH_TTL_MS) return cached.data

  const { connectDB } = await import('@/lib/mongoose')
  await connectDB()
  const User = (await import('@/models/User')).default
  const doc = await User.findById(id)
    .select('role tenantId assignedLocations isActive sessionsValidAfter')
    .lean<{ role: string; tenantId?: unknown; assignedLocations?: unknown[]; isActive?: boolean; sessionsValidAfter?: Date | null }>()
  const data: FreshUser | null = !doc || doc.isActive === false
    ? null
    : {
        role: doc.role,
        tenantId: doc.tenantId ? String(doc.tenantId) : null,
        assignedLocations: (doc.assignedLocations ?? []).map(String),
        sessionsValidAfter: doc.sessionsValidAfter ? new Date(doc.sessionsValidAfter).getTime() : null,
      }
  freshCache.set(id, { at: Date.now(), data })
  return data
}

/**
 * ¿La sesión se emitió antes del corte `sessionsValidAfter`? `issuedAtSec` es
 * el `iat` del JWT (segundos). Sin iat y con corte: se corta (falla cerrado).
 */
export function sessionCutOff(issuedAtSec: number | null | undefined, sessionsValidAfterMs: number | null): boolean {
  if (!sessionsValidAfterMs) return false
  if (typeof issuedAtSec !== 'number' || !Number.isFinite(issuedAtSec)) return true
  return issuedAtSec * 1000 < sessionsValidAfterMs
}

async function withFreshPermissions<T extends {
  id?: string | null
  role?: string | null
  tenantId?: string | null
  tenantSlug?: string | null
  assignedLocation?: string | null
  assignedLocations?: string[] | null
}>(user: T, request?: NextRequest, issuedAtSec?: number | null) {
  const { isWriteRequest, projectSessionUser } = await import('@/lib/organizations/projection')
  const fresh = await loadFreshUser(user.id, isWriteRequest(request))
  if (fresh === undefined) return user
  if (fresh === null) return null
  if (sessionCutOff(issuedAtSec, fresh.sessionsValidAfter)) return null
  const base: T = {
    ...user,
    role: fresh.role,
    tenantId: fresh.tenantId,
    assignedLocations: fresh.assignedLocations,
    assignedLocation: fresh.assignedLocations[0] ?? null,
  }
  // Multi-marca PR 8: membresías de organización sobre el comercio del contexto
  // (lib/organizations/projection.ts; interruptor org.access, apagado = base).
  return projectSessionUser(base, request)
}

export async function getSessionUser(request?: NextRequest) {
  const session = await auth()
  if (session?.user) {
    const issuedAt = (session.user as { issuedAt?: number | null }).issuedAt ?? null
    return withFreshPermissions(session.user, request, issuedAt)
  }

  if (!request) return null

  // 2da vía: cookie de sesión NextAuth (JWT HS256 con AUTH_SECRET)
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (secret) {
    const token = await getToken({ req: request, secret })
    if (token) {
      return withFreshPermissions({
        id: token.id as string,
        role: token.role as string,
        email: (token.email as string | null | undefined) ?? null,
        tenantId: token.tenantId as string | null,
        tenantSlug: token.tenantSlug as string | null,
        assignedLocation: token.assignedLocation as string | null,
        assignedLocations: token.assignedLocations as string[],
        assignedTenants: token.assignedTenants as string[],
        image: token.image as string | null,
      }, request, typeof token.iat === 'number' ? token.iat : null)
    }
  }

  // 3ra vía: Bearer RS256 del POS (emitido por apps/sync).
  // Es la vía que habilita POS → SaaS sin crear un segundo login.
  const bearer = extractBearerToken(request.headers.get('authorization'))
  if (bearer) {
    // Auditoría 30/10/2026 (A1): el token del POS solo vale en la superficie
    // del POS (/api/{tenant}/pos/*) y en el logout. Antes abría TODO el panel
    // con el rol del token (un mozo podía cambiar settings del comercio).
    if (!isPosBearerPath(requestPathname(request))) return null
    const payload = await verifyPosToken(bearer)
    if (payload?.sub && payload.tenantId && payload.role) {
      return toSessionFromPosToken(payload)
    }
    // Bearer presente pero inválido/expirado: no intentar nada más.
    return null
  }

  return null
}

export async function requireAuth(request: NextRequest, tenantId: string) {
  const user = await getSessionUser(request)

  if (!user || !user.role) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Auditoría 30/10/2026 (C1): un consumidor (cliente final) nunca opera el
  // panel de un comercio, aunque su usuario tenga tenantId cargado.
  if (user.role === 'consumer') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const isSuperAdmin = user.role === 'superadmin'
  const belongsToTenant = belongsTo(user, tenantId)

  if (!isSuperAdmin && !belongsToTenant) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  return null
}

// ── Rol mínimo por acción (auditoría 30/10/2026, C1) ─────────────────────────
// `enforcePermission*` no valida nada con el flag `rbac.sedeScope` apagado
// (estado de todos los comercios). Estas listas son la guardia DURA, que no
// depende del flag: el permiso fino por sede se suma encima cuando se active.

/** Solo el dueño/administrador: dinero, usuarios, datos fiscales y del comercio. */
export const ADMIN_ROLES = ['admin'] as const
/** Gestión del comercio: menú, promociones, impresoras, club, comunicaciones. */
export const MANAGE_ROLES = ['admin', 'manager'] as const
/** Caja: ajustes de cobro (mismo alcance que `cash.movements.write` en la matriz v3). */
export const CASH_ROLES = ['admin', 'manager', 'cashier'] as const
/** Operación en el salón/mostrador: reservas, reimpresión, canjes del club. */
export const FLOOR_ROLES = ['admin', 'manager', 'cashier', 'staff', 'host', 'waiter'] as const

/**
 * requireAuth + rol permitido. Superadmin siempre pasa. Mismo contrato que
 * requireAuth: null si puede, o la respuesta de error.
 */
export async function requireTenantRole(
  request: NextRequest,
  tenantId: string,
  roles: readonly string[]
) {
  const authError = await requireAuth(request, tenantId)
  if (authError) return authError
  const user = await getSessionUser(request)
  if (user?.role === 'superadmin') return null
  if (!user?.role || !roles.includes(user.role)) {
    return NextResponse.json({ error: 'Tu rol no puede hacer esta acción' }, { status: 403 })
  }
  return null
}

/** Path del request (NextRequest.nextUrl o, si no está, la URL cruda). */
function requestPathname(request: NextRequest): string {
  if (request.nextUrl?.pathname) return request.nextUrl.pathname
  try {
    return new URL(request.url).pathname
  } catch {
    return ''
  }
}

/** Rutas donde el Bearer del POS es válido (ver getSessionUser, 3ra vía). */
export function isPosBearerPath(pathname: string): boolean {
  return /^\/api\/[^/]+\/pos(\/|$)/.test(pathname) || pathname === '/api/auth/logout'
}

/**
 * Multi-marca PR 2 (06/11/2026): decide lib/tenant-access según el
 * interruptor `access.central` (off = rol del JWT como siempre; enforce = rol
 * fresco de la base, cierra S5). `family` agrupa las divergencias del modo
 * sombra en el reporte del superadmin.
 */
export async function requireSuperAdmin(family = 'superadmin', request?: NextRequest) {
  const { requireSuperAdminCentral } = await import('@/lib/tenant-access')
  return requireSuperAdminCentral(family, request)
}

/**
 * Bearer contra CRON_SECRET (comparación timing-safe). Fail-closed: sin
 * secreto configurado no matchea nada. Mismo patrón que los crons de
 * /api/cron/* (p.ej. purge-soft-deleted, reconcile-payments).
 */
export async function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || !authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const provided = Buffer.from(authHeader.slice(7))
  const expected = Buffer.from(secret)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * Para rutas legacy sin sesión que también las corre un cron/worker:
 * acepta CRON_SECRET (proceso de servidor) o sesión admin del tenant
 * (futuro botón de panel). Anónimo y otros roles quedan fuera.
 */
export async function requireCronSecretOrAdmin(request: NextRequest, tenantId: string) {
  const cronError = await requireCronSecret(request)
  if (!cronError) return null
  return requireAdminRole(request, tenantId)
}

export async function requireAdminRole(request: NextRequest, tenantId: string) {
  const user = await getSessionUser(request)

  if (!user || !user.role) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const isSuperAdmin = user.role === 'superadmin'
  const belongsToTenant = belongsTo(user, tenantId)
  const isAdmin = user.role === 'admin'

  if (!isSuperAdmin && !(belongsToTenant && isAdmin)) {
    return NextResponse.json({ error: 'Acceso denegado. Se requiere rol de administrador.' }, { status: 403 })
  }

  return null
}

export async function getSessionForTenant(tenantId: string, request?: NextRequest) {
  const user = await getSessionUser(request)
  if (!user || !user.role) return null

  const isSuperAdmin = user.role === 'superadmin'
  const belongsToTenant = belongsTo(user, tenantId)

  if (!isSuperAdmin && !belongsToTenant) return null

  return { user, expires: '' }
}