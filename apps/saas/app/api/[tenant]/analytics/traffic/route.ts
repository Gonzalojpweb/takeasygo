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
    const dateFromParam = searchParams.get('dateFrom')
    const dateToParam = searchParams.get('dateTo')

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const visitedAtFilter: Record<string, Date> = { $gte: startDate }
    if (dateFromParam) {
      visitedAtFilter.$gte = new Date(dateFromParam)
    }
    if (dateToParam) {
      const endDate = new Date(dateToParam)
      endDate.setHours(23, 59, 59, 999)
      visitedAtFilter.$lte = endDate
    }

    const query = {
      tenantId: tenant._id,
      visitedAt: visitedAtFilter,
    }

    const [visits, total, bySource, byDevice, byDay, byPromo, tgoTraffic] = await Promise.all([
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
      MenuVisit.aggregate([
        { $match: { ...query, source: { $in: ['tgo-customer', 'tgo-explore'] } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
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
      tgoTraffic,
      summary: {
        totalVisits: total,
        days: dateFromParam || dateToParam ? undefined : days,
        dateFrom: dateFromParam || undefined,
        dateTo: dateToParam || undefined,
        bySource,
        byDevice,
        tgoTrafficTotal: tgoTraffic.reduce((sum: number, s: any) => sum + s.count, 0),
      },
    })
  } catch (error) {
    console.error('Traffic analytics error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
