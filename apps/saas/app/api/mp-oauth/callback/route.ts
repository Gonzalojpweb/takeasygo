import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { auth } from '@/lib/auth'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { encrypt, decrypt } from '@/lib/crypto'
import { verifyMpOauthState } from '@/lib/mp-oauth-state'
import MpSplitLink from '@/models/MpSplitLink'
import { setSplitLock } from '@/lib/mp-split-guard'

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

    // Link de autorización del superadmin (lib/mp-split-guard): el dueño del
    // restaurante lo abre sin sesión del panel. El resultado se muestra en
    // una página pública, no en el panel.
    const earlyState = state ? verifyMpOauthState(state) : null
    const viaLink = !!earlyState?.linkId
    const linkResult = (estado: 'ok' | 'error', reason?: string) =>
      NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/autorizar-mercadopago/listo?estado=${estado}${reason ? `&motivo=${encodeURIComponent(reason)}` : ''}`
      )

    // reason = código de diagnóstico que la UI muestra al usuario (y que
    // permite identificar exactamente qué rama falló si persiste el error).
    const failRedirect = (reason: string, tenantSlugHint?: string) => {
      if (viaLink) return linkResult('error', reason)
      const slug = sessionUser?.tenantSlug ?? tenantSlugHint ?? null
      const path = slug
        ? `/${slug}/admin/settings?mp_oauth=error&reason=${encodeURIComponent(reason)}`
        : `/admin?mp_oauth=error&reason=${encodeURIComponent(reason)}`
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}${path}`)
    }
    const failAt = (reason: string, slug: string) =>
      viaLink
        ? linkResult('error', reason)
        : NextResponse.redirect(
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

    await connectDB()

    // Sesión obligatoria y perteneciente al tenant del state — salvo el link
    // del superadmin, que se valida acá: existe, es de este comercio, no se
    // usó y no venció. Se reclama (usedAt) para que sirva una sola vez; si
    // algo falla más abajo, se libera para reintentar.
    let claimedLinkId: string | null = null
    if (stateObj.linkId) {
      const linkTenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean<{ _id: import('mongoose').Types.ObjectId }>()
      const claimed = linkTenant
        ? await MpSplitLink.findOneAndUpdate(
            { _id: stateObj.linkId, tenantId: linkTenant._id, usedAt: null, expiresAt: { $gt: new Date() } },
            { $set: { usedAt: new Date() } },
            { returnDocument: 'after' }
          ).lean()
        : null
      if (!claimed) {
        console.error('[MP OAuth callback] link de autorización inválido, usado o vencido')
        return failRedirect('link_invalid', tenantSlug)
      }
      claimedLinkId = String(stateObj.linkId)
    } else {
      if (!sessionUser) {
        console.error('[MP OAuth callback] sin sesión')
        return failRedirect('no_session', tenantSlug)
      }
      if (!isSuperAdmin && sessionUser.tenantSlug !== tenantSlug) {
        console.error('[MP OAuth callback] sesión pertenece a otro tenant')
        return failRedirect('tenant_mismatch', tenantSlug)
      }
    }
    // Libera el link si la conexión no se completa (para poder reintentar).
    const releaseLink = async () => {
      if (claimedLinkId) await MpSplitLink.updateOne({ _id: claimedLinkId }, { $set: { usedAt: null } }).catch(() => undefined)
    }
    const failLink = async (reason: string) => {
      await releaseLink()
      return failAt(reason, tenantSlug)
    }

    // Get OAuth credentials from PlatformConfig (configured by superadmin)
    const platformConfig = await PlatformConfig.findById('platform').lean() as any
    const mpOAuth = platformConfig?.mpOAuth ?? {}

    const MP_APP_ID     = mpOAuth.appId
    const MP_APP_SECRET = mpOAuth.appSecret ? (() => { try { return decrypt(mpOAuth.appSecret) } catch { return null } })() : null
    const REDIRECT_URI  = mpOAuth.redirectUri || `${process.env.NEXTAUTH_URL}/api/mp-oauth/callback`

    if (!MP_APP_ID || !MP_APP_SECRET) {
      console.error('[MP OAuth] Missing credentials - cannot exchange code')
      return await failLink('no_credentials')
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
        return await failLink('exchange_failed')
      }
      tokenData = await res.json()
    } catch (err) {
      console.error('[MP OAuth] network error:', err)
      return await failLink('exchange_network_error')
    }

    const { access_token, refresh_token, expires_in } = tokenData
    if (!access_token) {
      console.error('[MP OAuth] No access_token in response')
      return await failLink('no_access_token')
    }

    // ── Identificar el user_id de MP del token OAuth nuevo ──────────────────
    // Sin esta validación, el token queda atado a la cuenta MP con sesión
    // abierta en el navegador del admin (bug: pagos acreditados en cuenta
    // ajena/del dueño de la plataforma).
    let oauthUserId: number | null = null
    try {
      const meRes = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      if (meRes.ok) {
        const meData = await meRes.json()
        oauthUserId = typeof meData?.id === 'number' ? meData.id : null
      } else {
        console.warn(`[MP OAuth] /users/me HTTP ${meRes.status} para token nuevo`)
      }
    } catch (meErr: any) {
      console.warn('[MP OAuth] /users/me network error:', meErr?.message)
    }

    try {
      const tenant = await Tenant.findOne({ slug: tenantSlug })
      if (!tenant) throw new Error('Tenant not found')

      // Resolver la cuenta destino (misma lógica que antes)
      let targetAccount: any = null
      if (accountId && tenant.mpAccounts?.length) {
        targetAccount = tenant.mpAccounts.find((a: any) => a._id?.toString() === accountId)
        if (!targetAccount) {
          console.warn(`[MP OAuth] accountId ${accountId} not found in mpAccounts, falling back to mpOAuth`)
        }
      } else if (!tenant.mpAccounts?.length) {
        targetAccount = null // legacy
      } else {
        targetAccount = tenant.mpAccounts.find((a: any) => a.isActive) ?? null
        if (!targetAccount) {
          console.warn('[MP OAuth] no active account found, falling back to mpOAuth')
        }
      }

      // ── Validación 1: user_id del OAuth vs user_id del token manual ───────
      // Si la cuenta tiene credenciales manuales, el OAuth debe apuntar al
      // MISMO user_id de MP. Si difiere, NO se guarda (el admin autorizó
      // con la cuenta MP equivocada).
      if (targetAccount?.accessToken) {
        let manualUserId: number | null = null
        try {
          const manualToken = decrypt(targetAccount.accessToken)
          const manualRes = await fetch('https://api.mercadopago.com/users/me', {
            headers: { Authorization: `Bearer ${manualToken}` },
          })
          if (manualRes.ok) {
            const manualData = await manualRes.json()
            manualUserId = typeof manualData?.id === 'number' ? manualData.id : null
          }
        } catch {
          // Token manual no descifra o /users/me falla — no se puede comparar.
          // No bloqueamos por eso (token manual puede estar vencido), pero se loguea.
          console.warn('[MP OAuth] no se pudo resolver user_id del token manual para comparar')
        }

        if (oauthUserId != null && manualUserId != null && oauthUserId !== manualUserId) {
          console.error(
            `[MP OAuth] user_id_mismatch tenant=${tenantSlug} account=${targetAccount._id} ` +
            `oauth=${oauthUserId} manual=${manualUserId} — NO se guarda`
          )
          return await failLink('user_id_mismatch')
        }
      }

      // ── Validación 2: unicidad — ese user_id no puede estar en OTRO tenant ─
      if (oauthUserId != null) {
        const otherTenant = await Tenant.findOne({
          _id: { $ne: tenant._id },
          $or: [
            { 'mpAccounts.oauthMpUserId': oauthUserId },
            { 'mpAccounts.mpUserId': oauthUserId },
            { 'mpOAuth.mpUserId': oauthUserId },
            { 'mercadopago.mpUserId': oauthUserId },
          ],
        }).select('slug').lean()

        if (otherTenant) {
          console.error(
            `[MP OAuth] user_id_conflict tenant=${tenantSlug} user_id=${oauthUserId} ` +
            `ya asociado a tenant=${(otherTenant as any).slug} — NO se guarda`
          )
          return await failLink('user_id_conflict')
        }
      }

      // ── Cifrar ANTES de asignar: si encrypt falla, NO se pisa nada ────────
      // (antes safeEncrypt devolvía null y se guardaba null encima del token)
      let encAccessToken: string, encRefreshToken: string | null = null
      try {
        encAccessToken = encrypt(access_token)
        encRefreshToken = refresh_token ? encrypt(refresh_token) : null
      } catch (encErr: any) {
        console.error('[MP OAuth] encrypt failed — token NO sobrescrito:', encErr?.message)
        return await failLink('encrypt_failed')
      }

      if (targetAccount) {
        targetAccount.oauthAccessToken = encAccessToken
        targetAccount.oauthRefreshToken = encRefreshToken
        targetAccount.oauthExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null
        targetAccount.oauthIsConnected = true
        targetAccount.oauthAuthorizedAt = new Date()
        targetAccount.oauthMpUserId = oauthUserId
        targetAccount.oauthRevokedAt = null
        tenant.markModified('mpAccounts')
        await tenant.save()
        console.log(
          `[MP OAuth] Saved to mpAccounts[${targetAccount._id}] oauthMpUserId=${oauthUserId ?? 'unknown'}`
        )
      } else {
        await saveLegacyMpOAuth(tenant, access_token, refresh_token, expires_in, oauthUserId)
      }
    } catch (dbErr: any) {
      console.error('[MP OAuth] DB save failed:', dbErr)
      // Incluir mensaje de error real en el redirect para diagnóstico
      const msg = dbErr?.message?.slice(0, 100) || 'unknown'
      return await failLink(`db_save_failed:${encodeURIComponent(msg)}`)
    }

    // Candado del split: conectado = administrado por TakeasyGO desde ahora.
    const lockTenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean<{ _id: string }>()
    if (lockTenant) {
      await setSplitLock(lockTenant._id, true, claimedLinkId ? `link:${claimedLinkId}` : (sessionUser?.email ?? sessionUser?.role ?? 'admin'))
    }

    if (viaLink) return linkResult('ok')
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
  expiresIn: number,
  mpUserId: number | null
) {
  await Tenant.findOneAndUpdate(
    { slug: tenant.slug },
    {
      'mpOAuth.accessToken': encrypt(accessToken),
      'mpOAuth.refreshToken': refreshToken ? encrypt(refreshToken) : null,
      'mpOAuth.expiresAt': expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      'mpOAuth.authorizedAt': new Date(),
      'mpOAuth.isConnected': true,
      'mpOAuth.mpUserId': mpUserId,
      'mpOAuth.revokedAt': null,
    }
  )
  console.log(`[MP OAuth] Saved to legacy mpOAuth mpUserId=${mpUserId ?? 'unknown'}`)
}
