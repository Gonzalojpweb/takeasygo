/**
 * Admin Dashboard — Club / Loyalty
 *
 * GET /api/[tenant]/admin/dashboard/club
 *
 * Returns loyalty club summary: active members, members with points, total points.
 * Uses only LoyaltyMember model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const token = await getToken({
      req: request as any,
      secret,
      secureCookie: process.env.NODE_ENV === 'production',
    })

    if (!token) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id')
      .lean<{ _id: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (token.role !== 'superadmin' && token.tenantId?.toString() !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const LoyaltyMemberMod = await import('@/models/LoyaltyMember')
    const LoyaltyMember = LoyaltyMemberMod.default

    const tenantId = tenant._id

    const result = await LoyaltyMember.aggregate([
      { $match: { tenantId, status: 'active' } },
      { $group: {
        _id: null,
        totalMembers: { $sum: 1 },
        membersWithPoints: { $sum: { $cond: [{ $gt: ['$loyalty.points', 0] }, 1, 0] } },
        totalPoints: { $sum: '$loyalty.points' },
      }},
    ])

    const stats = result[0] || { totalMembers: 0, membersWithPoints: 0, totalPoints: 0 }

    return NextResponse.json({
      totalMembers: stats.totalMembers,
      membersWithPoints: stats.membersWithPoints,
      totalPoints: stats.totalPoints,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/club GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos del club', detail: msg }, { status: 500 })
  }
}
