import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { requireAdminRole } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { classifyOauthExpiry, MP_OAUTH_TOKEN_TTL_DAYS } from '@/lib/mp-oauth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/[tenant]/settings/mercadopago/verify?accountId=<id|legacy>
 *
 * Diagnóstico de la conexión de una cuenta MP (para el botón Verificar):
 * token usado (OAuth/manual), /users/me (titular), vencimiento del OAuth
 * y días restantes. Solo lectura — no modifica nada.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'payments.configure',
    })
    if (permError) return permError

    const accountId = request.nextUrl.searchParams.get('accountId')

    // ── Resolver la cuenta ──
    type MpAccountLike = {
      _id?: { toString(): string }
      label?: string
      isActive?: boolean
      accessToken?: string | null
      oauthAccessToken?: string | null
      oauthRefreshToken?: string | null
      oauthExpiresAt?: Date | null
      oauthIsConnected?: boolean
    }
    let account: MpAccountLike | null = null
    let legacy = false
    if (!accountId || accountId === 'legacy') {
      if (tenant.mpAccounts?.length) {
        account = tenant.mpAccounts.find((a) => a.isActive) ?? tenant.mpAccounts[0]
      } else {
        legacy = true
      }
    } else {
      account = tenant.mpAccounts?.find((a) => a._id?.toString() === accountId) ?? null
      if (!account) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    // ── Elegir token para el diagnóstico: OAuth si está conectado, si no manual ──
    let tokenEnc: string | null = null
    let tokenSource: 'oauth' | 'manual' | null = null
    let oauthExpiresAt: Date | null = null
    let oauthIsConnected = false
    let hasRefreshToken = false

    if (legacy) {
      oauthIsConnected = !!tenant.mpOAuth?.isConnected
      hasRefreshToken = !!tenant.mpOAuth?.refreshToken
      if (oauthIsConnected && tenant.mpOAuth?.accessToken) {
        tokenEnc = tenant.mpOAuth.accessToken
        tokenSource = 'oauth'
        oauthExpiresAt = tenant.mpOAuth.expiresAt ?? null
      } else if (tenant.mercadopago?.accessToken) {
        tokenEnc = tenant.mercadopago.accessToken
        tokenSource = 'manual'
      } else if (tenant.mpOAuth?.accessToken) {
        tokenEnc = tenant.mpOAuth.accessToken
        tokenSource = 'oauth'
        oauthExpiresAt = tenant.mpOAuth.expiresAt ?? null
      }
    } else {
      if (!account) {
        return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
      }
      oauthIsConnected = !!account.oauthIsConnected
      hasRefreshToken = !!account.oauthRefreshToken
      if (oauthIsConnected && account.oauthAccessToken) {
        tokenEnc = account.oauthAccessToken
        tokenSource = 'oauth'
        oauthExpiresAt = account.oauthExpiresAt ?? null
      } else if (account.accessToken) {
        tokenEnc = account.accessToken
        tokenSource = 'manual'
      }
    }

    if (!tokenEnc) {
      return NextResponse.json({
        ok: false,
        reason: 'sin_token',
        message: 'Esta cuenta no tiene token (ni OAuth ni manual) para verificar.',
        accountId: account?._id?.toString() ?? null,
        legacy,
      })
    }

    // ── Descifrar ──
    let token: string
    try {
      token = decrypt(tokenEnc)
    } catch {
      return NextResponse.json({
        ok: false,
        reason: 'decrypt_failed',
        message: 'No se pudo descifrar el token almacenado.',
        tokenSource,
        accountId: account?._id?.toString() ?? null,
        legacy,
      })
    }

    // ── /users/me con el token ──
    type MpUserMe = {
      id?: number
      nickname?: string
      email?: string
      first_name?: string
    }
    let meData: MpUserMe | null = null
    let httpStatus: number | null = null
    try {
      const meRes = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      httpStatus = meRes.status
      if (meRes.ok) meData = (await meRes.json()) as MpUserMe
    } catch {
      // red caída — se reporta abajo con meData null
    }

    // ── Vencimiento del OAuth (solo aplica al token OAuth) ──
    const oauthStatus = tokenSource === 'oauth'
      ? classifyOauthExpiry(oauthExpiresAt)
      : null
    const daysRemaining =
      tokenSource === 'oauth' && oauthExpiresAt
        ? Math.max(0, Math.floor((new Date(oauthExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null

    const valid = !!meData
    return NextResponse.json({
      ok: valid,
      reason: valid ? null : httpStatus ? `mp_http_${httpStatus}` : 'network_error',
      message: valid
        ? 'Conexión verificada contra Mercado Pago.'
        : tokenSource === 'oauth' && oauthStatus === 'expired'
          ? 'El token OAuth venció. Reconectá la cuenta con Mercado Pago.'
          : 'Mercado Pago rechazó el token. Verificá las credenciales.',
      accountId: account?._id?.toString() ?? null,
      accountLabel: account?.label ?? (legacy ? 'OAuth legacy' : null),
      legacy,
      tokenSource,
      httpStatus,
      user: meData
        ? {
            id: meData.id ?? null,
            nickname: meData.nickname ?? null,
            email: meData.email ?? null,
            firstName: meData.first_name ?? null,
          }
        : null,
      oauth: {
        isConnected: oauthIsConnected,
        hasRefreshToken,
        expiresAt: oauthExpiresAt?.toISOString() ?? null,
        status: oauthStatus,
        daysRemaining,
        ttlDays: MP_OAUTH_TOKEN_TTL_DAYS,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
