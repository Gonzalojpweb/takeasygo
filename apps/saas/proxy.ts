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
  '/seller',
  '/api/seller',
]

const SLUG_REGEX = /^[a-z0-9-]{2,50}$/

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (EXCLUDED_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const isApiRoute = pathname.startsWith('/api/')
  const segments = pathname.split('/').filter(Boolean)
  const tenantSlug = isApiRoute ? segments[1] : segments[0]

  if (!tenantSlug) return NextResponse.next()

  if (!SLUG_REGEX.test(tenantSlug)) {
    return NextResponse.next()
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-tenant-slug', tenantSlug)

  const isAdminRoute = pathname.includes('/admin')
  if (isAdminRoute) {
    try {
      const session = await auth()

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
