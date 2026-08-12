import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import CommissionSettlement from '@/models/CommissionSettlement'
import { requireAuth } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const now = new Date()
    const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const to = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Get settlements in range to subtract
    const settlements = await CommissionSettlement.find({
      tenantId: tenant._id,
      from: { $lte: to },
      to: { $gte: from },
    }).lean()

    const settledOrderIds = new Set<string>()
    let settledAmount = 0
    for (const s of settlements) {
      settledAmount += s.amountCollected
      for (const id of s.orderIds) settledOrderIds.add(id)
    }

    // Aggregate commissions by method
    const agg = await Order.aggregate([
      {
        $match: {
          tenantId: tenant._id,
          deletedAt: null,
          status: { $ne: 'cancelled' },
          'payment.status': 'approved',
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$payment.method',
          total: { $sum: '$payment.platformFeeAmount' },
          count: { $sum: 1 },
          daily: {
            $push: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              amount: '$payment.platformFeeAmount',
              method: '$payment.method',
              orderId: '$_id',
            },
          },
        },
      },
    ])

    let total = 0
    const breakdown: Record<string, { amount: number; count: number }> = {}
    const dailyMap: Record<string, { date: string; amount: number; method: string }[]> = {}

    for (const a of agg) {
      total += a.total
      breakdown[a._id || 'unknown'] = { amount: a.total, count: a.count }
      for (const d of a.daily) {
        if (!dailyMap[d.date]) dailyMap[d.date] = []
        dailyMap[d.date].push({ date: d.date, amount: d.amount, method: d.method })
      }
    }

    const dailyBreakdown = Object.entries(dailyMap)
      .map(([date, items]) => ({
        date,
        total: items.reduce((s, i) => s + i.amount, 0),
        breakdown: items.reduce((acc, i) => {
          acc[i.method] = (acc[i.method] || 0) + i.amount
          return acc
        }, {} as Record<string, number>),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const pending = total - settledAmount

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      total: toPesos(total),
      settled: toPesos(settledAmount),
      pending: toPesos(pending),
      breakdown: Object.entries(breakdown).map(([method, data]) => ({
        method,
        amount: toPesos(data.amount),
        count: data.count,
      })),
      dailyBreakdown: dailyBreakdown.map((d) => ({
        date: d.date,
        total: toPesos(d.total),
        breakdown: Object.entries(d.breakdown).map(([method, amount]) => ({
          method,
          amount: toPesos(amount),
        })),
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}