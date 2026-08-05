import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { verifyJwt } from '@takeasygo/business'
import { Redis } from '@upstash/redis'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'

const SSO_REDIS_PREFIX = 'ssoToken:'

const LOGIN_ERRORS = {
  sso_invalid_params: '/login?error=sso_invalid_params',
  sso_config_error: '/login?error=sso_config_error',
  sso_invalid_token: '/login?error=sso_invalid_token',
  sso_expired: '/login?error=sso_expired',
  sso_user_not_found: '/login?error=sso_user_not_found',
  sso_auth_failed: '/login?error=sso_auth_failed',
  sso_forbidden_route: '/login?error=sso_forbidden_route',
  sso_forbidden_tenant: '/login?error=sso_forbidden_tenant',
} as const

// POS roles → allowed SaaS routes (server-side guard)
// '/' = SaaS home (accessible from "Ir al SaaS" POS button)
const ROLE_ALLOWED_ROUTES: Record<string, string[]> = {
  admin:    ['/', '/analytics', '/ico', '/tia', '/cis'],
  manager:  ['/', '/analytics', '/ico', '/tia', '/cis'],
  cashier:  ['/'],
  waiter:   ['/'],
}

function redirectToLogin(req: NextRequest, errorKey: keyof typeof LOGIN_ERRORS) {
  const url = new URL(LOGIN_ERRORS[errorKey], req.url)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const jti = searchParams.get('jti')
  const callbackUrl = searchParams.get('callbackUrl')

  if (!token || !jti || !callbackUrl) {
    return redirectToLogin(req, 'sso_invalid_params')
  }

  const publicKey = process.env.SSO_JWT_PUBLIC_KEY
  if (!publicKey) {
    console.error('[sso] SSO_JWT_PUBLIC_KEY not configured')
    return redirectToLogin(req, 'sso_config_error')
  }

  const payload = verifyJwt(token, publicKey)
  if (!payload) {
    return redirectToLogin(req, 'sso_invalid_token')
  }

  // Server-side: validate tenantId matches
  const user = await connectDB().then(() => User.findById(payload.sub))
  if (!user) {
    return redirectToLogin(req, 'sso_user_not_found')
  }
  if (user.tenantId?.toString() !== payload.tenantId) {
    return redirectToLogin(req, 'sso_forbidden_tenant')
  }

  // Server-side: validate POS role has permission for the requested route
  const posRole = payload.role as string
  const allowedRoutes = ROLE_ALLOWED_ROUTES[posRole]
  if (!allowedRoutes) {
    return redirectToLogin(req, 'sso_forbidden_route')
  }
  const normalizedCallback = callbackUrl.startsWith('/') ? callbackUrl : `/${callbackUrl}`
  if (!allowedRoutes.includes(normalizedCallback)) {
    return redirectToLogin(req, 'sso_forbidden_route')
  }

  let redis: Redis
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  } catch {
    return redirectToLogin(req, 'sso_config_error')
  }

  const redisKey = `${SSO_REDIS_PREFIX}${jti}`
  const stored = await redis.get(redisKey).catch(() => null)
  if (!stored) {
    return redirectToLogin(req, 'sso_expired')
  }

  await redis.del(redisKey).catch(() => {})

  const authCode = randomUUID()
  await redis.set(`ssoAuth:${authCode}`, JSON.stringify({ email: user.email }), { ex: 30 })

  const redirectUrl = new URL(`/sso-callback?code=${authCode}&callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url)
  const response = NextResponse.redirect(redirectUrl)

  // Set cookie to indicate this session originated from POS (8h TTL)
  response.cookies.set('pos_origin', 'true', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 28800, // 8 hours
    path: '/',
  })

  return response
}
