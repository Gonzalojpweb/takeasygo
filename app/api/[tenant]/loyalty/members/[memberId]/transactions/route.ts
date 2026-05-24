import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreRedemption from '@/models/StoreRedemption'
import Order from '@/models/Order'
import { calculatePoints } from '@/lib/loyalty'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; memberId: string }> }
) {
  try {
    const { tenant: tenantSlug, memberId } = await params
    const { searchParams } = request.nextUrl

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id pointsConfig')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const skip = (page - 1) * limit

    const member = await LoyaltyMember.findById(memberId)
      .select('phoneHash name')
      .lean()
    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    const [redemptions, orders] = await Promise.all([
      StoreRedemption.find({
        memberId: member._id,
        tenantId: tenant._id,
      })
        .populate('storeItemId', 'name')
        .sort({ createdAt: -1 })
        .lean(),

      Order.find({
        tenantId: tenant._id,
        'customer.phoneHash': member.phoneHash,
        $or: [
          { loyaltyPointsCredited: true },
          { 'rewardItems.0': { $exists: true } },
        ],
      })
        .select('orderNumber total items rewardItems loyaltyPointsCredited createdAt')
        .sort({ createdAt: -1 })
        .lean(),
    ]) as any[]

    const transactions: any[] = []

    for (const r of redemptions) {
      transactions.push({
        _id: `redemption_${r._id}`,
        type: 'redeem',
        points: -(r.pointsUsed ?? 0),
        description: (r.storeItemId as any)?.name ?? 'Item canjeado',
        orderNumber: null,
        storeItemName: (r.storeItemId as any)?.name ?? null,
        status: r.status,
        createdAt: r.createdAt ?? r._id.getTimestamp(),
      })
    }

    for (const o of orders) {
      if (o.loyaltyPointsCredited) {
        const saleItemsTotal = (o.items as any[])
          ?.filter((i: any) => i.itemType !== 'reward')
          ?.reduce((sum: number, i: any) => sum + (i.subtotal ?? 0), 0)
          ?? o.total ?? 0
        const earnedPoints = calculatePoints(saleItemsTotal, (tenant as any).pointsConfig)

        if (earnedPoints > 0) {
          transactions.push({
            _id: `${o._id}_earn`,
            type: 'earn',
            points: earnedPoints,
            description: `Compra #${o.orderNumber}`,
            orderNumber: o.orderNumber,
            storeItemName: null,
            status: 'completed',
            createdAt: o.createdAt,
          })
        }
      }

      if ((o.rewardItems as any[])?.length > 0) {
        for (const ri of o.rewardItems as any[]) {
          transactions.push({
            _id: `${o._id}_redeem_${ri.storeItemId}`,
            type: 'redeem',
            points: -(ri.pointsCost ?? 0),
            description: `${ri.storeItemName ?? 'Item'} (#${o.orderNumber})`,
            orderNumber: o.orderNumber,
            storeItemName: ri.storeItemName ?? null,
            status: 'completed',
            createdAt: o.createdAt,
          })
        }
      }
    }

    transactions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    const total = transactions.length
    const totalPages = Math.ceil(total / limit)
    const paginated = transactions.slice(skip, skip + limit)

    return NextResponse.json({
      transactions: paginated,
      pagination: { page, limit, total, totalPages },
    })
  } catch (err: any) {
    console.error('[Transactions API] Error:', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
