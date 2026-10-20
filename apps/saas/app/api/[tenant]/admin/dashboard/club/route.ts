/**
 * Admin Dashboard — Club / Loyalty
 *
 * GET /api/[tenant]/admin/dashboard/club
 *
 * Returns loyalty club summary: active members, members with points, total points.
 * Uses only LoyaltyMember model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveDashboardScope } from '@/lib/dashboard-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const resolved = await resolveDashboardScope<{ _id: any }>(request, tenantSlug)
    if (!resolved.ok) return resolved.response
    const { tenant, match: sedeMatch } = resolved.scope

    const LoyaltyMemberMod = await import('@/models/LoyaltyMember')
    const LoyaltyMember = LoyaltyMemberMod.default

    const tenantId = tenant._id

    const result = await LoyaltyMember.aggregate([
      { $match: { tenantId, ...sedeMatch, status: 'active' } },
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
