import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { verifyMemberToken } from '@/lib/memberToken'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'

/**
 * GET /api/{tenant}/club-member/me
 * Valida el token JWT del club (x-member-token header) y retorna datos del miembro.
 * No requiere NextAuth session — usa el JWT directamente.
 * Usado por useClubMembership para saber si el usuario es miembro sin login.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const token = request.headers.get('x-member-token')

    if (!token) {
      return NextResponse.json({ member: null }, { status: 401 })
    }

    const verification = await verifyMemberToken(token)
    if (!verification.valid) {
      return NextResponse.json({ member: null }, { status: 401 })
    }

    const { payload } = verification

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean()
    if (!tenant) {
      return NextResponse.json({ member: null }, { status: 404 })
    }

    // Verify token belongs to this tenant
    if (payload.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ member: null }, { status: 403 })
    }

    const member = await LoyaltyMember.findOne({
      _id: payload.memberId,
      tenantId: tenant._id,
      status: 'active',
      tokenVersion: payload.version,
    }).lean()

    if (!member) {
      return NextResponse.json({ member: null })
    }

    return NextResponse.json({
      member: {
        id: member._id.toString(),
        name: member.name,
        phone: member.phone,
        email: member.email,
        status: member.status,
        joinedAt: member.joinedAt,
        points: member.loyalty?.points ?? 0,
        tier: member.loyalty?.tier ?? 'none',
      },
    })
  } catch (error) {
    console.error('[club-member/me] Error:', error)
    return NextResponse.json({ member: null }, { status: 500 })
  }
}
