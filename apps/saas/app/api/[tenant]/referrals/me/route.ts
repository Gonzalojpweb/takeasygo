import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { verifyMemberToken } from '@/lib/memberToken'
import { loadMemberReferralView } from '@/lib/referrals'

/**
 * GET /api/{tenant}/referrals/me — pantalla «Invitá y ganá» del miembro
 *
 * Autenticación: token del club (header x-member-token), igual que
 * /club-member/me. Devuelve el código del link (lo crea la primera vez),
 * los pasos con sus puntos, el premio y el avance de cada invitado (solo
 * nombre e inicial).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const token = request.headers.get('x-member-token')
    if (!token) return NextResponse.json({ error: 'Identificate en el club para ver tus invitaciones' }, { status: 401 })
    const verification = await verifyMemberToken(token)
    if (!verification.valid) return NextResponse.json({ error: 'Tu sesión del club venció. Volvé a identificarte.' }, { status: 401 })

    await connectDB()
    const tenant = await Tenant.findOne({ slug, isActive: true })
      .select('_id name loyalty.enabled loyalty.clubName')
      .lean<{ _id: Types.ObjectId; name: string; loyalty?: { enabled?: boolean; clubName?: string } }>()
    if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
    if (verification.payload.tenantId !== String(tenant._id)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

    const member = await LoyaltyMember.findOne({
      _id: verification.payload.memberId,
      tenantId: tenant._id,
      status: 'active',
      tokenVersion: verification.payload.version,
    })
      .select('_id name loyalty.points')
      .lean<{ _id: Types.ObjectId; name: string; loyalty?: { points?: number } }>()
    if (!member) return NextResponse.json({ error: 'Tu sesión del club venció. Volvé a identificarte.' }, { status: 401 })

    const view = await loadMemberReferralView(tenant._id, member._id)
    return NextResponse.json(
      {
        member: { name: member.name, points: member.loyalty?.points ?? 0 },
        clubName: tenant.loyalty?.clubName || `Club ${tenant.name}`,
        clubEnabled: tenant.loyalty?.enabled ?? false,
        ...view,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[referrals/me]', error)
    return NextResponse.json({ error: 'Error al cargar tus invitaciones' }, { status: 500 })
  }
}
