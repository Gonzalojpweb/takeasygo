import { auth } from '@/lib/auth'
import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { extractBearerToken, verifyPosToken } from '@/lib/posJwt'

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
// un caché por instancia de 30 s.
const FRESH_TTL_MS = 30_000
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

interface FreshUser {
  role: string
  tenantId: string | null
  assignedLocations: string[]
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
async function loadFreshUser(id: string | null | undefined): Promise<FreshUser | null | undefined> {
  if (!id || !OBJECT_ID_RE.test(id)) return undefined
  const cached = freshCache.get(id)
  if (cached && Date.now() - cached.at < FRESH_TTL_MS) return cached.data

  const { connectDB } = await import('@/lib/mongoose')
  await connectDB()
  const User = (await import('@/models/User')).default
  const doc = await User.findById(id)
    .select('role tenantId assignedLocations isActive')
    .lean<{ role: string; tenantId?: unknown; assignedLocations?: unknown[]; isActive?: boolean }>()
  const data: FreshUser | null = !doc || doc.isActive === false
    ? null
    : {
        role: doc.role,
        tenantId: doc.tenantId ? String(doc.tenantId) : null,
        assignedLocations: (doc.assignedLocations ?? []).map(String),
      }
  freshCache.set(id, { at: Date.now(), data })
  return data
}

async function withFreshPermissions<T extends {
  id?: string | null
  role?: string | null
  tenantId?: string | null
  assignedLocation?: string | null
  assignedLocations?: string[] | null
}>(user: T): Promise<T | null> {
  const fresh = await loadFreshUser(user.id)
  if (fresh === undefined) return user
  if (fresh === null) return null
  return {
    ...user,
    role: fresh.role,
    tenantId: fresh.tenantId,
    assignedLocations: fresh.assignedLocations,
    assignedLocation: fresh.assignedLocations[0] ?? null,
  }
}

export async function getSessionUser(request?: NextRequest) {
  const session = await auth()
  if (session?.user) return withFreshPermissions(session.user)

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
      })
    }
  }

  // 3ra vía: Bearer RS256 del POS (emitido por apps/sync).
  // Es la vía que habilita POS → SaaS sin crear un segundo login.
  const bearer = extractBearerToken(request.headers.get('authorization'))
  if (bearer) {
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

  const isSuperAdmin = user.role === 'superadmin'
  const belongsToTenant = user.tenantId === tenantId

  if (!isSuperAdmin && !belongsToTenant) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  return null
}

export async function requireSuperAdmin() {
  const session = await auth()

  if (!session || !session.user || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  return null
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
  const belongsToTenant = user.tenantId === tenantId
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
  const belongsToTenant = user.tenantId === tenantId

  if (!isSuperAdmin && !belongsToTenant) return null

  return { user, expires: '' }
}