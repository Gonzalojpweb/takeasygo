import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function requireAuth(request: NextRequest, tenantId: string) {
  const session = await auth()

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const isSuperAdmin = session.user.role === 'superadmin'
  const belongsToTenant = session.user.tenantId === tenantId

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
  const session = await auth()

  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const isSuperAdmin = session.user.role === 'superadmin'
  const belongsToTenant = session.user.tenantId === tenantId
  const isAdmin = session.user.role === 'admin'

  if (!isSuperAdmin && !(belongsToTenant && isAdmin)) {
    return NextResponse.json({ error: 'Acceso denegado. Se requiere rol de administrador.' }, { status: 403 })
  }

  return null
}

export async function getSessionForTenant(tenantId: string) {
  const session = await auth()
  if (!session) return null

  const isSuperAdmin = session.user.role === 'superadmin'
  const belongsToTenant = session.user.tenantId === tenantId

  if (!isSuperAdmin && !belongsToTenant) return null

  return session
}