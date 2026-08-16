/**
 * Superadmin Comisiones API
 *
 * GET /api/superadmin/comisiones?from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import { requireSuperAdmin } from '@/lib/apiAuth'

function getDefaultDates() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const { searchParams } = request.nextUrl
    const defaults = getDefaultDates()
    const from = searchParams.get('from') || defaults.from
    const to = searchParams.get('to') || defaults.to

    const fromDate = new Date(from)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    const tenants = await Tenant.find({ isActive: true, status: 'active' }).select('name slug').lean()

    const settlements = await CommissionSettlement.find({
      from: { $lte: toDate },
      to: { $gte: fromDate },
    }).lean()

    const settlementMap = new Map<string, { settled: number; settlementIds: string[] }>()
    for (const s of settlements) {
      const key = s.tenantId.toString()
      const existing = settlementMap.get(key) || { settled: 0, settlementIds: [] }
      existing.settled += s.amountCollected
      existing.settlementIds.push(s._id.toString())
      settlementMap.set(key, existing)
    }

    const tenantResults = await Promise.all(
      tenants.map(async (tenant: any) => {
        const agg = await Order.aggregate([
          {
            $match: {
              tenantId: tenant._id,
              deletedAt: null,
              status: { $ne: 'cancelled' },
              'payment.status': 'approved',
              createdAt: { $gte: fromDate, $lte: toDate },
            },
          },
          {
            $group: {
              _id: '$payment.method',
              total: { $sum: '$payment.platformFeeAmount' },
              count: { $sum: 1 },
            },
          },
        ])

        let total = 0
        let transfer = 0
        let mercadopago = 0
        let kripton = 0

        for (const a of agg) {
          total += a.total
          if (a._id === 'transfer') transfer = a.total
          if (a._id === 'mercadopago') mercadopago = a.total
          if (a._id === 'kripton') kripton = a.total
        }

        const settled = settlementMap.get(tenant._id.toString())?.settled || 0
        const pending = total - settled

        return {
          tenantId: tenant._id.toString(),
          name: tenant.name,
          slug: tenant.slug,
          total,
          pending,
          settled,
          breakdown: { transfer, mercadopago, kripton },
          settledAmount: settled,
        }
      })
    )

    tenantResults.sort((a, b) => b.total - a.total)

    const grandTotal = tenantResults.reduce((s, t) => s + t.total, 0)
    const grandSettled = tenantResults.reduce((s, t) => s + t.settled, 0)
    const grandPending = tenantResults.reduce((s, t) => s + t.pending, 0)

    return NextResponse.json({
      tenantResults,
      settlements: settlements.map((s: any) => ({
        _id: s._id.toString(),
        tenantId: s.tenantId.toString(),
        from: s.from.toISOString(),
        to: s.to.toISOString(),
        amountCollected: s.amountCollected,
        collectedAt: s.collectedAt.toISOString(),
        collectedBy: s.collectedBy,
        notes: s.notes || '',
        status: s.status,
      })),
      tenants: tenants.map((t: any) => ({
        _id: t._id.toString(),
        name: t.name,
        slug: t.slug,
      })),
      summary: {
        grandTotal,
        grandSettled,
        grandPending,
      },
    })
  } catch (error) {
    console.error('[superadmin/comisiones GET]', error)
    return NextResponse.json({ error: 'Error al obtener comisiones' }, { status: 500 })
  }
}
