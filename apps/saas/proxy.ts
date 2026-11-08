import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { decidePosCors } from '@/lib/pos-cors'
import { parseLegacyMenuPath } from '@/lib/menu/location-ref'

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
  // Multi-marca PR 9b: panel de organización (no es un comercio).
  '/grupo',
  '/api/grupo',
]

const SLUG_REGEX = /^[a-z0-9-]{2,50}$/

/**
 * Multi-marca PR 5: `x-tenant-slug` lo pone SOLO este proxy, derivado de la
 * ruta. El que manda el cliente se borra siempre, en todos los paths
 * (incluidos /superadmin, /api/auth, /seller y slugs que no pasan el regex):
 * si no, una página o API podría leer un comercio que no es el de la URL.
 */
function stripClientTenantHeader(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  headers.delete('x-tenant-slug')
  // La 404 oficial (app/not-found.tsx) usa la dirección pedida para elegir
  // marca y botón de vuelta. Solo para mostrar: nunca para permisos.
  headers.set('x-pathname', request.nextUrl.pathname)
  return headers
}

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
  const requestHeaders = stripClientTenantHeader(request)
  const next = () => NextResponse.next({ request: { headers: requestHeaders } })

  if (EXCLUDED_PATHS.some(path => pathname.startsWith(path))) {
    return withCors(next(), corsHeaders)
  }

  const isApiRoute = pathname.startsWith('/api/')

  // Direcciones viejas del menú con el _id de la sede (QR impresos, links en
  // redes): se resuelven al nombre de la sede conservando el resto y la query.
  if (!isApiRoute && (request.method === 'GET' || request.method === 'HEAD')) {
    const legacy = parseLegacyMenuPath(pathname)
    if (legacy) {
      const target = new URL('/api/menu-link', request.url)
      for (const [k, v] of request.nextUrl.searchParams.entries()) target.searchParams.append(k, v)
      target.searchParams.set('t', legacy.tenant)
      target.searchParams.set('l', legacy.locationId)
      target.searchParams.set('rest', legacy.rest)
      return NextResponse.redirect(target, 307)
    }
  }

  const segments = pathname.split('/').filter(Boolean)
  const tenantSlug = isApiRoute ? segments[1] : segments[0]

  if (!tenantSlug) return withCors(next(), corsHeaders)

  // El POS manda el ObjectId del tenant (24 hex), que también matchea el
  // regex de slug: x-tenant-slug lo resuelve resolvePosContext por _id.
  if (!SLUG_REGEX.test(tenantSlug)) {
    return withCors(next(), corsHeaders)
  }

  requestHeaders.set('x-tenant-slug', tenantSlug)

  const isAdminRoute = pathname.includes('/admin')
  if (isAdminRoute) {
    try {
      const session = await auth()

      if (session?.user?.role === 'superadmin') {
        return next()
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

  return withCors(next(), corsHeaders)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
