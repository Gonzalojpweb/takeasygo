import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

export const runtime = 'nodejs'

const { auth } = NextAuth(authConfig)

const EXCLUDED_PATHS = [
  '/superadmin',
  '/api/superadmin',
  '/api/auth',
  '/_next',
  '/favicon',
  '/login',
  '/seller',
  '/api/seller',
]

// R-MT-04 — Sanitización de slug antes de usar como identificador de tenant
const SLUG_REGEX = /^[a-z0-9-]{2,50}$/

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (EXCLUDED_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const isApiRoute = pathname.startsWith('/api/')
  const segments = pathname.split('/').filter(Boolean)
  const tenantSlug = isApiRoute ? segments[1] : segments[0]

  if (!tenantSlug) return NextResponse.next()

  // Rechazar slugs que no cumplan el patrón esperado (R-MT-04)
  if (!SLUG_REGEX.test(tenantSlug)) {
    return NextResponse.next()
  }

  // Solo pasamos el slug via header — la validación real la hace cada página
  // contra la DB. No hacemos fetch() aquí para evitar loops de red.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-tenant-slug', tenantSlug)

  // Proteger rutas admin
  const isAdminRoute = pathname.includes('/admin')
  if (isAdminRoute) {
    try {
      const session = await auth()

      // SECURITY: Superadmin puede acceder a cualquier tenant admin sin sesión específica del tenant
      if (session?.user?.role === 'superadmin') {
        return NextResponse.next({
          request: { headers: requestHeaders },
        })
      }

      if (!session) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('callbackUrl', pathname)
        return NextResponse.redirect(loginUrl)
      }
    } catch (error) {
      // Si falla la verificación de sesión, permitir acceso y dejar que la página lo maneje
      console.error('Auth middleware error:', error)
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
