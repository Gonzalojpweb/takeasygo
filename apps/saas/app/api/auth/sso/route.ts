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
} as const

function redirectToLogin(req: NextRequest, errorKey: keyof typeof LOGIN_ERRORS) {
  const callbackUrl = new URL(req.url).searchParams.get('callbackUrl') || '/admin'
  const url = new URL(LOGIN_ERRORS[errorKey], req.url)
  url.searchParams.set('callbackUrl', callbackUrl)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const jti = searchParams.get('jti')

  if (!token || !jti) {
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

  await connectDB()
  const user = await User.findById(payload.sub)
  if (!user) {
    return redirectToLogin(req, 'sso_user_not_found')
  }

  const authCode = randomUUID()
  await redis.set(`ssoAuth:${authCode}`, JSON.stringify({ email: user.email }), { ex: 30 })

  const callbackUrl = searchParams.get('callbackUrl') || '/admin'
  const redirectUrl = new URL(`/sso-callback?code=${authCode}&callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url)
  return NextResponse.redirect(redirectUrl)
}
