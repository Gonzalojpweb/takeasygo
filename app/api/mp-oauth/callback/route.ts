import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { encrypt, decrypt } from '@/lib/crypto'

/**
 * GET /api/mp-oauth/callback
 *
 * MercadoPago OAuth callback. Exchanges the authorization code for an
 * access_token + refresh_token and stores them (encrypted) in the Tenant.
 * Uses OAuth credentials from PlatformConfig (configured by superadmin).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    console.error('[MP OAuth callback] error from MP:', error)
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/admin?mp_oauth=error`)
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  // Decode state to get tenantSlug
  let tenantSlug: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'))
    tenantSlug = decoded.tenantSlug
    if (!tenantSlug) throw new Error('Missing tenantSlug')
  } catch {
    return NextResponse.json({ error: 'State inválido' }, { status: 400 })
  }

  await connectDB()

  // Get OAuth credentials from PlatformConfig (configured by superadmin)
  const platformConfig = await PlatformConfig.findById('platform').lean() as any
  const mpOAuth = platformConfig?.mpOAuth ?? {}

  const MP_APP_ID     = mpOAuth.appId
  const MP_APP_SECRET = mpOAuth.appSecret ? decrypt(mpOAuth.appSecret) : null
  const REDIRECT_URI  = mpOAuth.redirectUri || `${process.env.NEXTAUTH_URL}/api/mp-oauth/callback`

  if (!MP_APP_ID || !MP_APP_SECRET) {
    return NextResponse.json({ error: 'Credenciales OAuth no configuradas. El superadmin debe configurarlas en la plataforma.' }, { status: 500 })
  }

  // Exchange code for token
  let tokenData: any
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     MP_APP_ID,
        client_secret: MP_APP_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('[MP OAuth] token exchange failed:', detail)
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/${tenantSlug}/admin/settings?mp_oauth=error`)
    }
    tokenData = await res.json()
  } catch (err) {
    console.error('[MP OAuth] network error:', err)
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/${tenantSlug}/admin/settings?mp_oauth=error`)
  }

  const { access_token, refresh_token, expires_in } = tokenData
  if (!access_token) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/${tenantSlug}/admin/settings?mp_oauth=error`)
  }

  await Tenant.findOneAndUpdate(
    { slug: tenantSlug },
    {
      'mpOAuth.accessToken':  encrypt(access_token),
      'mpOAuth.refreshToken': refresh_token ? encrypt(refresh_token) : null,
      'mpOAuth.expiresAt':    expires_in ? new Date(Date.now() + expires_in * 1000) : null,
      'mpOAuth.authorizedAt': new Date(),
      'mpOAuth.isConnected':  true,
    }
  )

  console.log(`[MP OAuth] Tenant ${tenantSlug} connected to marketplace split payments`)
  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/${tenantSlug}/admin/settings?mp_oauth=success`)
}
