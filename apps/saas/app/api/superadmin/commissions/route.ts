import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import CommissionSettlement from '@/models/CommissionSettlement'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()

  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const now = new Date()
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
  const to = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  // Get all tenants
  const tenants = await Tenant.find({ isActive: true, status: 'active' }).select('name slug').lean()

  // Get settlements in range to subtract
  const settlements = await CommissionSettlement.find({
    from: { $lte: to },
    to: { $gte: from },
  }).lean()

  const settlementMap = new Map<string, number>()
  for (const s of settlements) {
    const key = s.tenantId.toString()
    settlementMap.set(key, (settlementMap.get(key) || 0) + s.amountCollected)
  }

  // Get commission totals per tenant
  const tenantResults = await Promise.all(
    tenants.map(async (tenant) => {
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
            orderIds: { $push: { _id: '$_id', platformFeeAmount: '$payment.platformFeeAmount', method: '$payment.method' } },
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

      const settled = settlementMap.get(tenant._id.toString()) || 0
      const pending = total - settled

      return {
        tenantId: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        total: toPesos(total),
        pending: toPesos(pending),
        settled: toPesos(settled),
        breakdown: {
          transfer: toPesos(transfer),
          mercadopago: toPesos(mercadopago),
          kripton: toPesos(kripton),
        },
      }
    })
  )

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    tenants: tenantResults,
  })
}

export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()

  const body = await request.json()
  const { tenantId, from, to, notes } = body as {
    tenantId: string
    from: string
    to: string
    notes?: string
  }

  if (!tenantId || !from || !to) {
    return NextResponse.json({ error: 'tenantId, from, to requeridos' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)
  toDate.setHours(23, 59, 59, 999)

  // Get orders in range that are not yet settled
  const existingSettlements = await CommissionSettlement.find({
    tenantId,
    from: { $lte: toDate },
    to: { $gte: fromDate },
  }).lean()

  const settledOrderIds = new Set<string>()
  for (const s of existingSettlements) {
    for (const id of s.orderIds) settledOrderIds.add(id)
  }

  const orders = await Order.find({
    tenantId,
    deletedAt: null,
    status: { $ne: 'cancelled' },
    'payment.status': 'approved',
    createdAt: { $gte: fromDate, $lte: toDate },
    _id: { $nin: Array.from(settledOrderIds) },
  }).select('_id payment.platformFeeAmount payment.method').lean()

  if (orders.length === 0) {
    return NextResponse.json({ error: 'No hay órdenes nuevas para saldar en ese período' }, { status: 400 })
  }

  const orderIds = orders.map((o) => o._id.toString())
  const amountCollected = orders.reduce((sum, o) => sum + (o.payment?.platformFeeAmount || 0), 0)

  const session = (await import('@/lib/auth')).auth()
  const collectedBy = (await session)?.user?.email || 'superadmin'

  const settlement = await CommissionSettlement.create({
    tenantId,
    from: fromDate,
    to: toDate,
    amountCollected,
    collectedAt: new Date(),
    collectedBy,
    notes: notes || `Saldado ${fromDate.toLocaleDateString('es-AR')} - ${toDate.toLocaleDateString('es-AR')}`,
    orderIds,
    status: 'paid',
  })

  return NextResponse.json({
    settlement: {
      _id: settlement._id.toString(),
      tenantId: settlement.tenantId.toString(),
      from: settlement.from,
      to: settlement.to,
      amountCollected: toPesos(settlement.amountCollected),
      collectedAt: settlement.collectedAt,
      collectedBy: settlement.collectedBy,
      notes: settlement.notes,
      orderIds: settlement.orderIds,
      orderCount: orders.length,
    },
  })
}