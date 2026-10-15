import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { auth } from '@/lib/auth'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { encrypt, decrypt } from '@/lib/crypto'
import { verifyMpOauthState } from '@/lib/mp-oauth-state'

/**
 * GET /api/mp-oauth/callback
 *
 * MercadoPago OAuth callback. Exchanges the authorization code for an
 * access_token + refresh_token and stores them (encrypted) in the Tenant.
 * Uses OAuth credentials from PlatformConfig (configured by superadmin).
 *
 * Seguridad:
 *  - state firmado (HMAC + exp) emitido por /admin/mp-oauth/connect;
 *  - sesión de admin obligatoria;
 *  - el tenant del state debe coincidir con el de la sesión (superadmin exceptuado).
 */
export async function GET(request: NextRequest) {
  // ── Host canónico ───────────────────────────────────────────────────
  // MercadoPago redirige al host exacto del redirect_uri registrado (puede
  // ser takeasygo.com sin www) y la cookie de sesión NextAuth es host-only.
  // Si el callback llega a un host totalmente ajeno al de NEXTAUTH_URL,
  // re-emitimos conservando query (code/state/error).
  //
  // OJO: variaciones www <-> sin-www del MISMO dominio NO redirigen aquí —
  // Vercel ya unifica con un 308 del apex al www; redirigir nosotros crearía
  // un loop infinito (308 Vercel <-> 307 app). NEXTAUTH_URL sin www en Vercel
  // + este redirect = ERR_TOO_MANY_REDIRECTS.
  const reqUrl = new URL(request.url)
  const canonicalBase = process.env.NEXTAUTH_URL
  if (canonicalBase) {
    try {
      const root = (h: string) => h.replace(/^www\./, '')
      const canonicalHost = root(new URL(canonicalBase).host)
      const requestHost = root(reqUrl.host)
      if (canonicalHost && requestHost && canonicalHost !== requestHost) {
        return NextResponse.redirect(
          `${canonicalBase.replace(/\/+$/, '')}/api/mp-oauth/callback${reqUrl.search}`,
          307
        )
      }
    } catch {
      // NEXTAUTH_URL inválido: seguir sin redirección (no romper el callback).
    }
  }

  try {
    const { searchParams } = reqUrl
    const code  = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    const session = await auth()
    const sessionUser = session?.user ?? null
    const isSuperAdmin = sessionUser?.role === 'superadmin'

    // reason = código de diagnóstico que la UI muestra al usuario (y que
    // permite identificar exactamente qué rama falló si persiste el error).
    const failRedirect = (reason: string, tenantSlugHint?: string) => {
      const slug = sessionUser?.tenantSlug ?? tenantSlugHint ?? null
      const path = slug
        ? `/${slug}/admin/settings?mp_oauth=error&reason=${encodeURIComponent(reason)}`
        : `/admin?mp_oauth=error&reason=${encodeURIComponent(reason)}`
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}${path}`)
    }
    const failAt = (reason: string, slug: string) =>
      NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/${slug}/admin/settings?mp_oauth=error&reason=${encodeURIComponent(reason)}`
      )

    if (error) {
      console.error('[MP OAuth callback] error from MP:', error)
      return failRedirect('mp_denied')
    }

    if (!code || !state) {
      return failRedirect('missing_code_or_state')
    }

    // State firmado: firma inválida, malformado o expirado → no se procesa nada.
    const stateObj = verifyMpOauthState(state)
    if (!stateObj) {
      console.error('[MP OAuth callback] state inválido o expirado')
      return failRedirect('bad_state')
    }
    const tenantSlug: string = stateObj.tenantSlug
    const accountId: string | undefined = stateObj.accountId

    // Sesión obligatoria y perteneciente al tenant del state.
    if (!sessionUser) {
      console.error('[MP OAuth callback] sin sesión')
      return failRedirect('no_session', tenantSlug)
    }
    if (!isSuperAdmin && sessionUser.tenantSlug !== tenantSlug) {
      console.error('[MP OAuth callback] sesión pertenece a otro tenant')
      return failRedirect('tenant_mismatch', tenantSlug)
    }

    await connectDB()

    // Get OAuth credentials from PlatformConfig (configured by superadmin)
    const platformConfig = await PlatformConfig.findById('platform').lean() as any
    const mpOAuth = platformConfig?.mpOAuth ?? {}

    const MP_APP_ID     = mpOAuth.appId
    const MP_APP_SECRET = mpOAuth.appSecret ? (() => { try { return decrypt(mpOAuth.appSecret) } catch { return null } })() : null
    const REDIRECT_URI  = mpOAuth.redirectUri || `${process.env.NEXTAUTH_URL}/api/mp-oauth/callback`

    if (!MP_APP_ID || !MP_APP_SECRET) {
      console.error('[MP OAuth] Missing credentials - cannot exchange code')
      return failAt('no_credentials', tenantSlug)
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
        return failAt('exchange_failed', tenantSlug)
      }
      tokenData = await res.json()
    } catch (err) {
      console.error('[MP OAuth] network error:', err)
      return failAt('exchange_network_error', tenantSlug)
    }

    const { access_token, refresh_token, expires_in } = tokenData
    if (!access_token) {
      console.error('[MP OAuth] No access_token in response')
      return failAt('no_access_token', tenantSlug)
    }

    try {
      const tenant = await Tenant.findOne({ slug: tenantSlug })
      if (!tenant) throw new Error('Tenant not found')

      // Helper seguro para encrypt
      const safeEncrypt = (val: string | undefined) => {
        try {
          return val ? encrypt(val) : null
        } catch {
          return null
        }
      }

      // If accountId provided and exists in mpAccounts, update that specific account
      if (accountId && tenant.mpAccounts?.length) {
        const account = tenant.mpAccounts.find((a: any) => a._id?.toString() === accountId)
        if (account) {
          account.oauthAccessToken = safeEncrypt(access_token)
          account.oauthRefreshToken = safeEncrypt(refresh_token)
          account.oauthExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null
          account.oauthIsConnected = true
          account.oauthAuthorizedAt = new Date()
          tenant.markModified('mpAccounts')
          await tenant.save()
          console.log(`[MP OAuth] Saved to mpAccounts[${accountId}]`)
        } else {
          console.warn(`[MP OAuth] accountId ${accountId} not found in mpAccounts, falling back to mpOAuth`)
          await saveLegacyMpOAuth(tenant, access_token, refresh_token, expires_in)
        }
      } else if (!tenant.mpAccounts?.length) {
        // No mpAccounts — legacy mode: save to mpOAuth
        await saveLegacyMpOAuth(tenant, access_token, refresh_token, expires_in)
      } else {
        // accountId not provided but mpAccounts exists — save to first active account
        const activeAccount = tenant.mpAccounts.find((a: any) => a.isActive)
        if (activeAccount) {
          activeAccount.oauthAccessToken = safeEncrypt(access_token)
          activeAccount.oauthRefreshToken = safeEncrypt(refresh_token)
          activeAccount.oauthExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null
          activeAccount.oauthIsConnected = true
          activeAccount.oauthAuthorizedAt = new Date()
          tenant.markModified('mpAccounts')
          await tenant.save()
          console.log(`[MP OAuth] Saved to active mpAccounts[${activeAccount._id}]`)
        } else {
          await saveLegacyMpOAuth(tenant, access_token, refresh_token, expires_in)
        }
      }
    } catch (dbErr: any) {
      console.error('[MP OAuth] DB save failed:', dbErr)
      // Incluir mensaje de error real en el redirect para diagnóstico
      const msg = dbErr?.message?.slice(0, 100) || 'unknown'
      return failAt(`db_save_failed:${encodeURIComponent(msg)}`, tenantSlug)
    }

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/${tenantSlug}/admin/settings?mp_oauth=success`)
  } catch (err) {
    console.error('[MP OAuth] unhandled error:', err)
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/admin?mp_oauth=error&reason=unhandled`)
  }
}

async function saveLegacyMpOAuth(
  tenant: any,
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number
) {
  await Tenant.findOneAndUpdate(
    { slug: tenant.slug },
    {
      'mpOAuth.accessToken': encrypt(accessToken),
      'mpOAuth.refreshToken': refreshToken ? encrypt(refreshToken) : null,
      'mpOAuth.expiresAt': expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      'mpOAuth.authorizedAt': new Date(),
      'mpOAuth.isConnected': true,
    }
  )
  console.log('[MP OAuth] Saved to legacy mpOAuth')
}
