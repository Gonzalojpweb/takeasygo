import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreRedemption from '@/models/StoreRedemption'
import StoreItem from '@/models/StoreItem'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'
import { escapeRegex } from '@takeasygo/business'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString()).catch(() =>
      NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    )
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const search = searchParams.get('search')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    const query: any = { tenantId: tenant._id }
    if (status) query.status = status
    if (from || to) {
      query.createdAt = {}
      if (from) query.createdAt.$gte = new Date(from)
      if (to) query.createdAt.$lte = new Date(to)
    }
    if (search) {
      query.$or = [
        { redemptionCode: { $regex: escapeRegex(search), $options: 'i' } },
      ]
    }

    const skip = (page - 1) * limit

    const [redemptions, total] = await Promise.all([
      StoreRedemption.find(query)
        .populate('storeItemId', 'name imageUrl pointsCost')
        .populate('memberId', 'name phone email loyalty.points')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StoreRedemption.countDocuments(query),
    ])

    return NextResponse.json({
      redemptions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('[Admin Redemptions GET] Error:', error?.message || error)
    return NextResponse.json({ error: 'Error al obtener canjes', detail: error?.message }, { status: 500 })
  }
}
