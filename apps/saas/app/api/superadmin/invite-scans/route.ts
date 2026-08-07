import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import ExploreEvent from '@/models/ExploreEvent'
import { auth } from '@/lib/auth'

async function checkSuperadmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const errorResponse = await checkSuperadmin()
    if (errorResponse) return errorResponse

    await connectDB()

    const { searchParams } = request.nextUrl
    const days = Math.min(parseInt(searchParams.get('days') || '90', 10), 90)
    const since = new Date()
    since.setDate(since.getDate() - days)

    // Total scans (unique by sessionId)
    const allScans = await ExploreEvent.find({
      source: 'invitacion',
      eventType: 'pageview',
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 }).lean()

    const uniqueSessionIds = new Set(allScans.map(s => s.sessionId))
    const totalScans = allScans.length
    const uniqueScans = uniqueSessionIds.size

    // Scans per day (last 30 days for chart)
    const chartDays = 30
    const chartSince = new Date()
    chartSince.setDate(chartSince.getDate() - chartDays)

    const dailyAgg = await ExploreEvent.aggregate([
      {
        $match: {
          source: 'invitacion',
          eventType: 'pageview',
          createdAt: { $gte: chartSince },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: 1 },
          unique: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          date: '$_id',
          total: 1,
          unique: { $size: '$unique' },
        },
      },
      { $sort: { date: 1 } },
    ])

    // Device breakdown
    const deviceAgg = await ExploreEvent.aggregate([
      {
        $match: {
          source: 'invitacion',
          eventType: 'pageview',
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: '$deviceType',
          count: { $sum: 1 },
        },
      },
    ])

    const devices = { mobile: 0, desktop: 0, unknown: 0 }
    deviceAgg.forEach(d => {
      devices[d._id as keyof typeof devices] = d.count
    })

    // Referrer breakdown
    const referrerAgg = await ExploreEvent.aggregate([
      {
        $match: {
          source: 'invitacion',
          eventType: 'pageview',
          createdAt: { $gte: since },
          'metadata.referrer': { $ne: null },
        },
      },
      {
        $group: {
          _id: '$metadata.referrer',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])

    // Last 50 individual scans
    const recentScans = allScans.slice(0, 50).map(s => ({
      sessionId: s.sessionId,
      deviceType: s.deviceType,
      ip: s.ip,
      userAgent: s.userAgent,
      referrer: s.metadata?.referrer || null,
      landingPath: s.metadata?.landingPath || null,
      createdAt: s.createdAt,
    }))

    return NextResponse.json({
      summary: {
        totalScans,
        uniqueScans,
        days,
        devices,
        mobilePercent: totalScans > 0 ? Math.round((devices.mobile / totalScans) * 100) : 0,
      },
      daily: dailyAgg,
      referrers: referrerAgg.map(r => ({ referrer: r._id, count: r.count })),
      recentScans,
    })
  } catch (error) {
    console.error('[GET /api/superadmin/invite-scans]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
