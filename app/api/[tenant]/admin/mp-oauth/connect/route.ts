import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { decrypt } from '@/lib/crypto'

/**
 * GET /api/[tenant]/admin/mp-oauth/connect
 *
 * Redirects the tenant admin to MercadoPago OAuth authorization page.
 * The tenant will be asked to authorize TakeasyGO to act as a marketplace.
 * Uses OAuth credentials from PlatformConfig (configured by superadmin).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await connectDB()

  // Get OAuth credentials from PlatformConfig (configured by superadmin)
  const platformConfig = await PlatformConfig.findById('platform').lean() as any
  const mpOAuth = platformConfig?.mpOAuth ?? {}

  const MP_APP_ID = mpOAuth.appId
  const REDIRECT_URI = mpOAuth.redirectUri || `${process.env.NEXTAUTH_URL}/api/mp-oauth/callback`

  if (!MP_APP_ID) {
    return NextResponse.json({ error: 'OAuth no configurado. El superadmin debe configurar las credenciales OAuth en la plataforma.' }, { status: 500 })
  }

  // State includes tenant slug for verification in callback
  const state = Buffer.from(JSON.stringify({ tenantSlug, ts: Date.now() })).toString('base64url')

  const authUrl = new URL('https://auth.mercadopago.com/authorization')
  authUrl.searchParams.set('client_id', MP_APP_ID)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('platform_id', 'mp')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)

  return NextResponse.redirect(authUrl.toString())
}
