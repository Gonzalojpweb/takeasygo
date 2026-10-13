import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { decrypt } from '@/lib/crypto'
import { signMpOauthState } from '@/lib/mp-oauth-state'
import { enforcePermissionForRequest } from '@/lib/rbac'

/**
 * GET /api/[tenant]/admin/mp-oauth/connect
 *
 * Redirects the tenant admin to MercadoPago OAuth authorization page.
 * The tenant will be asked to authorize TakeasyGO to act as a marketplace.
 * Uses OAuth credentials from PlatformConfig (configured by superadmin).
 *
 * Requiere sesión de admin (o superadmin) PERTENECIENTE al tenant de la URL.
 * El state va firmado (HMAC + exp) y el callback valida firma + sesión + tenant.
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

  const role = session.user.role
  const isSuperAdmin = role === 'superadmin'
  if (!isSuperAdmin && role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado. Se requiere rol de administrador.' }, { status: 403 })
  }
  if (!isSuperAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  await connectDB()

  // Matriz v3 (flag rbac.sedeScope): payments.configure es solo admin.
  // Sin doc de tenant no hay flags → se omite el enforce (conducta previa).
  const tenant = await Tenant.findOne({ slug: tenantSlug })
  const permError = await enforcePermissionForRequest(request, {
    tenant,
    tenantId: tenant?._id?.toString() ?? '',
    permission: 'payments.configure',
  })
  if (permError) return permError

  // Get OAuth credentials from PlatformConfig (configured by superadmin)
  const platformConfig = await PlatformConfig.findById('platform').lean() as any
  const mpOAuth = platformConfig?.mpOAuth ?? {}

  const MP_APP_ID = mpOAuth.appId
  const REDIRECT_URI = mpOAuth.redirectUri || `${process.env.NEXTAUTH_URL}/api/mp-oauth/callback`

  if (!MP_APP_ID) {
    return NextResponse.json({ error: 'OAuth no configurado. El superadmin debe configurar las credenciales OAuth en la plataforma.' }, { status: 500 })
  }

  // State firmado: HMAC + nonce + expiración, atado al tenant de la URL.
  // accountId es opcional — si viene, el callback guarda los tokens en esa cuenta.
  const urlAccountId = request.nextUrl.searchParams.get('accountId')
  const state = signMpOauthState({ tenantSlug, accountId: urlAccountId })

  const authUrl = new URL('https://auth.mercadopago.com/authorization')
  authUrl.searchParams.set('client_id', MP_APP_ID)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('platform_id', 'mp')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)

  return NextResponse.redirect(authUrl.toString())
}
