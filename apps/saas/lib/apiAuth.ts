import { auth } from '@/lib/auth'
import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
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
    tenantId: payload.tenantId,
    tenantSlug: null,
    assignedLocation: payload.locationId ?? null,
    assignedLocations: payload.locationId ? [payload.locationId] : [],
    assignedTenants: [payload.tenantId],
    image: null,
  }
}

export async function getSessionUser(request?: NextRequest) {
  const session = await auth()
  if (session?.user) return session.user

  if (!request) return null

  // 2da vía: cookie de sesión NextAuth (JWT HS256 con AUTH_SECRET)
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (secret) {
    const token = await getToken({ req: request, secret })
    if (token) {
      return {
        id: token.id as string,
        role: token.role as string,
        tenantId: token.tenantId as string | null,
        tenantSlug: token.tenantSlug as string | null,
        assignedLocation: token.assignedLocation as string | null,
        assignedLocations: token.assignedLocations as string[],
        assignedTenants: token.assignedTenants as string[],
        image: token.image as string | null,
      }
    }
  }

  // 3ra vía: Bearer RS256 del POS (emitido por apps/sync).
  // Es la vía que habilita POS → SaaS sin crear un segundo login.
  const bearer = extractBearerToken(request.headers.get('authorization'))
  if (bearer) {
    const payload = verifyPosToken(bearer)
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