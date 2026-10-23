import { NextRequest, NextResponse } from 'next/server'
import mongoose, { type Types } from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import MpSplitLink from '@/models/MpSplitLink'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { auth } from '@/lib/auth'
import { getBaseUrl } from '@/lib/site-url'
import { SPLIT_LINK_TTL_MS, checkSplitHealth, newSplitLinkToken, setSplitLock, splitOverview, type TenantMpLike } from '@/lib/mp-split-guard'

/**
 * /api/superadmin/tenants/{tenantId}/mp-split — split de MercadoPago del comercio
 *
 * GET   estado: candado, cuentas y su conexión, si MercadoPago está pausado,
 *       links de autorización vigentes. Sin secretos.
 * POST  { action }:
 *   link   { accountId? } → link de un solo uso (48 h) para que el dueño
 *          autorice desde su cuenta de MercadoPago. El token se muestra UNA vez.
 *   lock / unlock         → candado (unlock: el comercio vuelve a poder cobrar
 *          sin split y a cambiar la conexión; usar solo si deja la plataforma).
 *   check                 → prueba ahora cada conexión contra MercadoPago.
 */
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), accountId: z.string().max(40).nullable().optional() }),
  z.object({ action: z.literal('lock') }),
  z.object({ action: z.literal('unlock') }),
  z.object({ action: z.literal('check') }),
])

type TenantDoc = TenantMpLike & { _id: Types.ObjectId; slug: string; name: string; mercadopago?: { isConfigured?: boolean } }

async function loadTenant(tenantId: string) {
  if (!mongoose.Types.ObjectId.isValid(tenantId)) return null
  return Tenant.findById(tenantId).select('_id slug name mercadopago.isConfigured mpOAuth mpAccounts mpSplitGuard').lean<TenantDoc | null>()
}

async function view(tenant: TenantDoc) {
  const links = await MpSplitLink.find({ tenantId: tenant._id, usedAt: null, expiresAt: { $gt: new Date() } })
    .select('accountId expiresAt createdBy createdAt')
    .sort({ createdAt: -1 })
    .lean<Array<{ _id: Types.ObjectId; accountId: string | null; expiresAt: Date; createdBy: string; createdAt: Date }>>()
  return {
    tenant: { id: String(tenant._id), slug: tenant.slug, name: tenant.name },
    ...splitOverview(tenant),
    pendingLinks: links.map((l) => ({ id: String(l._id), accountId: l.accountId, expiresAt: l.expiresAt.toISOString(), createdBy: l.createdBy })),
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  await connectDB()
  const tenant = await loadTenant((await params).tenantId)
  if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  return NextResponse.json(await view(tenant), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  await connectDB()
  const tenant = await loadTenant((await params).tenantId)
  if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  const session = await auth()
  const by = session?.user?.email ?? 'superadmin'
  const body = parsed.data

  if (body.action === 'link') {
    const accountId = body.accountId ?? null
    if (accountId && accountId !== 'legacy' && !(tenant.mpAccounts ?? []).some((a) => String(a._id) === accountId)) {
      return NextResponse.json({ error: 'La cuenta no existe en este comercio' }, { status: 400 })
    }
    if (!(tenant.mpAccounts ?? []).length && !tenant.mercadopago?.isConfigured) {
      return NextResponse.json({ error: 'El comercio todavía no cargó su cuenta de MercadoPago. Primero tiene que cargar sus credenciales en Configuración → Pagos.' }, { status: 400 })
    }
    const { token, hash } = newSplitLinkToken()
    const expiresAt = new Date(Date.now() + SPLIT_LINK_TTL_MS)
    await MpSplitLink.create({ tenantId: tenant._id, accountId: accountId === 'legacy' ? null : accountId, tokenHash: hash, expiresAt, createdBy: by })
    return NextResponse.json({
      url: `${getBaseUrl(request)}/autorizar-mercadopago/${token}`,
      expiresAt: expiresAt.toISOString(),
      ...(await view(tenant)),
    })
  }
  if (body.action === 'lock' || body.action === 'unlock') {
    await setSplitLock(tenant._id, body.action === 'lock', by)
    console.warn(`[superadmin/mp-split] ${body.action} tenant=${tenant.slug} por ${by}`)
    return NextResponse.json(await view((await loadTenant(String(tenant._id)))!))
  }
  const results = await checkSplitHealth(tenant)
  return NextResponse.json({ results, ...(await view((await loadTenant(String(tenant._id)))!)) })
}
