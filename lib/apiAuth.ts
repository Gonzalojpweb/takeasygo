import { auth } from '@/lib/auth'
import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'

async function getSessionUser(request?: NextRequest) {
  const session = await auth()
  if (session?.user) return session.user

  if (!request) return null

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) return null

  const token = await getToken({ req: request as any, secret })
  if (!token) return null

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

export async function requireAuth(request: NextRequest, tenantId: string) {
  const user = await getSessionUser(request)

  if (!user) {
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

  if (!session || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  return null
}

export async function requireAdminRole(request: NextRequest, tenantId: string) {
  const user = await getSessionUser(request)

  if (!user) {
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
  if (!user) return null

  const isSuperAdmin = user.role === 'superadmin'
  const belongsToTenant = user.tenantId === tenantId

  if (!isSuperAdmin && !belongsToTenant) return null

  return { user, expires: '' }
}