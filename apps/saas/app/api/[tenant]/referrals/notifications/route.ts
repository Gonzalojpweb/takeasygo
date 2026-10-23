import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import PushSubscription from '@/models/PushSubscription'
import { verifyMemberToken } from '@/lib/memberToken'

/**
 * POST   /api/{tenant}/referrals/notifications — activar avisos de «Invitá y ganá»
 * DELETE /api/{tenant}/referrals/notifications — desactivarlos en este celular
 *
 * Autenticación: token del club (x-member-token). El memberId y el comercio
 * salen del TOKEN, nunca del cuerpo: así nadie puede recibir los avisos de
 * otro socio. La suscripción queda ligada a este celular (clientToken).
 */
const subscribeSchema = z.object({
  clientToken: z.string().min(8).max(100),
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
  }),
})

async function memberFromToken(request: NextRequest, slug: string) {
  const token = request.headers.get('x-member-token')
  if (!token) return { error: NextResponse.json({ error: 'Identificate en el club' }, { status: 401 }) }
  const v = await verifyMemberToken(token)
  if (!v.valid) return { error: NextResponse.json({ error: 'Tu sesión del club venció' }, { status: 401 }) }
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id').lean<{ _id: Types.ObjectId }>()
  if (!tenant || v.payload.tenantId !== String(tenant._id)) return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) }
  const member = await LoyaltyMember.findOne({ _id: v.payload.memberId, tenantId: tenant._id, status: 'active', tokenVersion: v.payload.version })
    .select('_id phoneHash')
    .lean<{ _id: Types.ObjectId; phoneHash?: string }>()
  if (!member) return { error: NextResponse.json({ error: 'Tu sesión del club venció' }, { status: 401 }) }
  return { tenant, member }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await memberFromToken(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    const parsed = subscribeSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    const { clientToken, subscription } = parsed.data
    await PushSubscription.findOneAndUpdate(
      { clientToken },
      {
        clientToken,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        tenantId: ctx.tenant._id,
        memberId: ctx.member._id,
        ...(ctx.member.phoneHash ? { phoneHash: ctx.member.phoneHash } : {}),
      },
      { upsert: true },
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[referrals/notifications POST]', error)
    return NextResponse.json({ error: 'No se pudieron activar los avisos' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await memberFromToken(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    const clientToken = request.nextUrl.searchParams.get('clientToken')
    if (!clientToken) return NextResponse.json({ error: 'Falta el celular a desactivar' }, { status: 400 })
    // Solo desliga ESTE celular de ESTE socio (no borra suscripciones ajenas).
    await PushSubscription.updateOne({ clientToken, memberId: ctx.member._id }, { $unset: { memberId: '' } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[referrals/notifications DELETE]', error)
    return NextResponse.json({ error: 'No se pudieron desactivar los avisos' }, { status: 500 })
  }
}
