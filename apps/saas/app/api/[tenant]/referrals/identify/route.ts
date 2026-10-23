import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { signMemberToken } from '@/lib/memberToken'
import { rateLimit } from '@/lib/rateLimit'

/**
 * POST /api/{tenant}/referrals/identify — CONSUMIDOR (sin sesión)
 *
 * Para entrar a «Invitá y ganá» desde un celular que no tiene guardada la
 * sesión del club. Pide teléfono Y email, y los dos tienen que coincidir con
 * el mismo miembro (más estricto que el registro, que re-emite por teléfono).
 * Rate limit: 5 por hora por IP y 5 por hora por teléfono. La respuesta de
 * error es la misma si no existe o si no coincide (no revela quién es socio).
 */
const bodySchema = z.object({
  phone: z.string().min(6).max(30),
  email: z.string().email().max(200),
})

const NOT_FOUND = 'No encontramos un socio con ese teléfono y email. Revisalos o sumate al club.'

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Ingresá tu teléfono y tu email' }, { status: 400 })
    const { phone, email } = parsed.data

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const phoneHash = hashPhone(phone)
    const [byIp, byPhone] = await Promise.all([
      rateLimit(`referral-identify-ip:${ip}`, 5, 3_600_000),
      rateLimit(`referral-identify-phone:${phoneHash}`, 5, 3_600_000),
    ])
    if (!byIp.success || !byPhone.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Probá de nuevo en una hora.' }, { status: 429 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id').lean<{ _id: Types.ObjectId }>()
    if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })

    const member = await LoyaltyMember.findOne({ tenantId: tenant._id, phoneHash, status: 'active' })
      .select('_id phone email name tokenVersion locationId')
      .lean<{ _id: Types.ObjectId; phone: string; email?: string; name: string; tokenVersion?: number; locationId?: Types.ObjectId | null }>()
    if (!member || (member.email || '').toLowerCase().trim() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
    }

    const memberToken = await signMemberToken(String(member._id), String(tenant._id), member.phone, member.tokenVersion ?? 1)
    return NextResponse.json({
      memberToken,
      member: { name: member.name, locationId: member.locationId ? String(member.locationId) : null },
    })
  } catch (error) {
    console.error('[referrals/identify]', error)
    return NextResponse.json({ error: 'No pudimos identificarte. Probá de nuevo.' }, { status: 500 })
  }
}
