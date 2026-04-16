import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { Types } from 'mongoose'

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

function getDeviceType(userAgent: string | null): 'mobile' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile'
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'desktop'
  if (/bot|crawler|spider|crawl/i.test(ua)) return 'unknown'
  return 'desktop'
}

async function logMenuVisit(tenantSlug: string, ip: string | null, userAgent: string | null) {
  try {
    const { connectDB } = await import('@/lib/mongoose')
    const Tenant = (await import('@/models/Tenant')).default
    const MenuVisit = (await import('@/models/MenuVisit')).default

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean()
    if (!tenant) return

    await MenuVisit.create({
      tenantId: new Types.ObjectId(tenant._id.toString()),
      visitedAt: new Date(),
      ip: ip?.split(',')[0]?.trim() || null,
      userAgent,
      deviceType: getDeviceType(userAgent),
    })
  } catch (err) {
    console.error('MenuVisit log error:', err)
  }
}

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
      console.error('Auth middleware error:', error)
    }
  }

  // Log visit to menu (public menu, not admin, not api)
  if (!isAdminRoute && !isApiRoute) {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || null
    const userAgent = request.headers.get('user-agent')
    logMenuVisit(tenantSlug, ip, userAgent)
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
