import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const { searchParams } = request.nextUrl
    const tenantId = searchParams.get('tenantId')

    if (tenantId) {
      // Stats for a specific tenant
      const tenant = await Tenant.findById(tenantId).select('name slug loyalty pointsConfig store plan').lean()
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
      }

      const [members, activeMembers] = await Promise.all([
        LoyaltyMember.countDocuments({ tenantId }),
        LoyaltyMember.countDocuments({ tenantId, status: 'active' }),
      ])

      const pointsStats = await LoyaltyMember.aggregate([
        { $match: { tenantId: (tenant as any)._id } },
        { $group: { _id: null, totalPoints: { $sum: '$loyalty.points' }, avgPoints: { $avg: '$loyalty.points' } } },
      ])

      return NextResponse.json({
        tenant,
        stats: {
          totalMembers: members,
          activeMembers,
          totalPoints: pointsStats[0]?.totalPoints || 0,
          avgPoints: Math.round(pointsStats[0]?.avgPoints || 0),
        },
      })
    }

    // Global club stats across all tenants
    const tenants = await Tenant.find({ isActive: true }).select('name slug plan loyalty pointsConfig store').lean()

    const tenantStats = await Promise.all(
      tenants.map(async (t: any) => {
        const [members, activeMembers] = await Promise.all([
          LoyaltyMember.countDocuments({ tenantId: t._id }),
          LoyaltyMember.countDocuments({ tenantId: t._id, status: 'active' }),
        ])
        return {
          tenantId: t._id,
          tenantName: t.name,
          tenantSlug: t.slug,
          plan: t.plan,
          clubEnabled: t.loyalty?.enabled || false,
          clubName: t.loyalty?.clubName || '',
          totalMembers: members,
          activeMembers,
          storeEnabled: t.store?.enabled || false,
          pointsEnabled: t.pointsConfig?.enabled || false,
        }
      })
    )

    const globalTotals = tenantStats.reduce(
      (acc, t) => ({
        totalMembers: acc.totalMembers + t.totalMembers,
        activeMembers: acc.activeMembers + t.activeMembers,
        tenantsWithClub: acc.tenantsWithClub + (t.clubEnabled ? 1 : 0),
        tenantsWithStore: acc.tenantsWithStore + (t.storeEnabled ? 1 : 0),
      }),
      { totalMembers: 0, activeMembers: 0, tenantsWithClub: 0, tenantsWithStore: 0 }
    )

    return NextResponse.json({
      globalTotals,
      tenantStats,
    })
  } catch (error) {
    console.error('[superadmin/club GET]', error)
    return NextResponse.json({ error: 'Error al obtener estadísticas del club' }, { status: 500 })
  }
}
