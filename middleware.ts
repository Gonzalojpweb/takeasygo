import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

const { auth } = NextAuth(authConfig)

const EXCLUDED_PATHS = [
  '/superadmin',
  '/api/superadmin',
  '/api/auth',
  '/_next',
  '/favicon',
  '/login',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (EXCLUDED_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const isApiRoute = pathname.startsWith('/api/')
  const segments = pathname.split('/').filter(Boolean)
  const tenantSlug = isApiRoute ? segments[1] : segments[0]

  if (!tenantSlug) return NextResponse.next()

  // Validar tenant
  const baseUrl = request.nextUrl.origin
  const res = await fetch(`${baseUrl}/api/superadmin/tenants/validate?slug=${tenantSlug}`)

  if (!res.ok) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }
    return NextResponse.rewrite(new URL('/not-found', request.url))
  }

  const { tenant } = await res.json()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-tenant-id', tenant._id)
  requestHeaders.set('x-tenant-slug', tenant.slug)

  // Proteger rutas admin
  const isAdminRoute = pathname.includes('/admin')
  if (isAdminRoute) {
    const session = await auth()

    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Verificar que el usuario pertenece a este tenant
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantId === tenant._id

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}