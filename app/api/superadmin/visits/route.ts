import { connectDB } from '@/lib/mongoose'
import MenuVisit from '@/models/MenuVisit'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { Types } from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')
    const days = parseInt(searchParams.get('days') || '30')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    await connectDB()

    const query: any = {}
    
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId)
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    query.visitedAt = { $gte: startDate }

    const [visits, total, byTenant] = await Promise.all([
      MenuVisit.find(query)
        .sort({ visitedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      MenuVisit.countDocuments(query),
      MenuVisit.aggregate([
        { $match: { visitedAt: { $gte: startDate } } },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ])

    const tenantIds = byTenant.map((b: any) => b._id).filter(Boolean)
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name slug')
      .lean()

    const tenantMap = new Map(tenants.map((t: any) => [t._id.toString(), t]))

    const visitsWithTenant = visits.map((v: any) => ({
      _id: v._id,
      tenantId: v.tenantId,
      tenant: tenantMap.get(v.tenantId?.toString()) || null,
      visitedAt: v.visitedAt,
      ip: v.ip,
      userAgent: v.userAgent,
      deviceType: v.deviceType,
    }))

    const byTenantWithName = byTenant.map((b: any) => ({
      tenantId: b._id,
      tenant: tenantMap.get(b._id?.toString()) || null,
      count: b.count,
    }))

    return NextResponse.json({
      visits: visitsWithTenant,
      total,
      byTenant: byTenantWithName,
      summary: {
        totalVisits: total,
        days,
        byDevice: await MenuVisit.aggregate([
          { $match: { visitedAt: { $gte: startDate } } },
          { $group: { _id: '$deviceType', count: { $sum: 1 } } },
        ]),
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
