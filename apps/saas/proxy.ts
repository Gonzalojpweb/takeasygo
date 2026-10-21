import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { decidePosCors } from '@/lib/pos-cors'

const { auth } = NextAuth(authConfig)

/** Adjunta los headers CORS del POS (si los hay) a la respuesta final. */
function withCors(response: NextResponse, headers: Record<string, string> | null): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  }
  return response
}

const EXCLUDED_PATHS = [
  '/superadmin',
  '/api/superadmin',
  '/api/auth',
  '/_next',
  '/favicon',
  '/login',
  '/sso-callback',
  '/seller',
  '/api/seller',
]

const SLUG_REGEX = /^[a-z0-9-]{2,50}$/

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── CORS del POS (lib/pos-cors.ts) — antes que cualquier exclusión: ─────
  // /api/auth/logout está en EXCLUDED_PATHS y también lo llama el POS.
  const cors = decidePosCors(
    request.method,
    pathname,
    request.headers.get('origin'),
    request.nextUrl.origin
  )
  if (cors.kind === 'reject') {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Origen no permitido' } },
      { status: 403, headers: { Vary: 'Origin' } }
    )
  }
  if (cors.kind === 'preflight') {
    return new NextResponse(null, { status: 204, headers: cors.headers })
  }
  const corsHeaders = cors.kind === 'continue' ? cors.headers : null

  if (EXCLUDED_PATHS.some(path => pathname.startsWith(path))) {
    return withCors(NextResponse.next(), corsHeaders)
  }

  const isApiRoute = pathname.startsWith('/api/')
  const segments = pathname.split('/').filter(Boolean)
  const tenantSlug = isApiRoute ? segments[1] : segments[0]

  if (!tenantSlug) return withCors(NextResponse.next(), corsHeaders)

  // El POS manda el ObjectId del tenant (24 hex), que también matchea el
  // regex de slug: x-tenant-slug lo resuelve resolvePosContext por _id.
  if (!SLUG_REGEX.test(tenantSlug)) {
    return withCors(NextResponse.next(), corsHeaders)
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

  return withCors(
    NextResponse.next({
      request: { headers: requestHeaders },
    }),
    corsHeaders
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
