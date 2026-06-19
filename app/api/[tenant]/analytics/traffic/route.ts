import { connectDB } from '@/lib/mongoose'
import MenuVisit from '@/models/MenuVisit'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { Types } from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params
    
    // Verificar que el usuario pertenece al tenant o es superadmin
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug
    
    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const query = {
      tenantId: tenant._id,
      visitedAt: { $gte: startDate }
    }

    const [visits, total, bySource, byDevice, byDay, byPromo] = await Promise.all([
      MenuVisit.find(query)
        .sort({ visitedAt: -1 })
        .limit(50)
        .lean(),
      MenuVisit.countDocuments(query),
      MenuVisit.aggregate([
        { $match: query },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      MenuVisit.aggregate([
        { $match: query },
        { $group: { _id: '$deviceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      MenuVisit.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              year: { $year: '$visitedAt' },
              month: { $month: '$visitedAt' },
              day: { $dayOfMonth: '$visitedAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
        { $limit: 30 }
      ]),
      MenuVisit.aggregate([
        { $match: { ...query, promo: { $ne: null } } },
        { $group: { _id: '$promo', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ])

    return NextResponse.json({
      visits,
      total,
      bySource,
      byDevice,
      byDay: byDay.map((d: any) => ({
        date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
        count: d.count
      })).reverse(),
      byPromo,
      summary: {
        totalVisits: total,
        days,
        bySource,
        byDevice,
      },
    })
  } catch (error) {
    console.error('Traffic analytics error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
