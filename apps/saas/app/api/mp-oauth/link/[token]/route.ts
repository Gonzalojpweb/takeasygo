import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import MpSplitLink from '@/models/MpSplitLink'
import { rateLimit } from '@/lib/rateLimit'
import { signMpOauthState } from '@/lib/mp-oauth-state'
import { hashSplitLinkToken } from '@/lib/mp-split-guard'

/**
 * GET /api/mp-oauth/link/{token} — PÚBLICO (link de autorización del superadmin)
 *
 * Valida el link (existe, no se usó, no venció) y manda al dueño del
 * restaurante a la página de autorización de MercadoPago. El state firmado
 * lleva el linkId: el callback lo vuelve a validar y lo marca usado. El
 * link en sí no da acceso a nada más que a esta autorización.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '')
  const fail = (motivo: string) => NextResponse.redirect(`${base}/autorizar-mercadopago/listo?estado=error&motivo=${motivo}`)
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await rateLimit(`mp-split-link:${ip}`, 20, 60_000)
    if (!success) return fail('rate_limited')

    const { token } = await params
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return fail('link_invalid')
    await connectDB()
    const link = await MpSplitLink.findOne({ tokenHash: hashSplitLinkToken(token), usedAt: null, expiresAt: { $gt: new Date() } })
      .select('_id tenantId accountId')
      .lean<{ _id: Types.ObjectId; tenantId: Types.ObjectId; accountId: string | null }>()
    if (!link) return fail('link_invalid')
    const tenant = await Tenant.findById(link.tenantId).select('slug').lean<{ slug: string }>()
    if (!tenant) return fail('link_invalid')

    const platform = await PlatformConfig.findById('platform').select('mpOAuth.appId mpOAuth.redirectUri').lean<{ mpOAuth?: { appId?: string; redirectUri?: string } }>()
    const appId = platform?.mpOAuth?.appId
    if (!appId) return fail('no_credentials')
    const redirectUri = platform?.mpOAuth?.redirectUri || `${process.env.NEXTAUTH_URL}/api/mp-oauth/callback`

    const state = signMpOauthState({ tenantSlug: tenant.slug, accountId: link.accountId, linkId: String(link._id) })
    const authUrl = new URL('https://auth.mercadopago.com/authorization')
    authUrl.searchParams.set('client_id', appId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('platform_id', 'mp')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    return NextResponse.redirect(authUrl.toString())
  } catch (err) {
    console.error('[mp-oauth/link]', err)
    return fail('unhandled')
  }
}
