import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import PushSubscription from '@/models/PushSubscription'
import { requireAuth } from '@/lib/apiAuth'
import { escapeRegex } from '@takeasygo/business'

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

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50')))
    const search = sp.get('search') || ''
    const statusFilter = sp.get('status') || ''

    const query: any = { tenantId: tenant._id }
    if (statusFilter === 'active') query.status = 'active'
    else if (statusFilter === 'inactive') query.status = 'inactive'

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i')
      query.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
      ]
    }

    const [members, total] = await Promise.all([
      LoyaltyMember.find(query)
        .sort({ joinedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name phone email phoneHash status joinedAt cache.totalOrders cache.totalSpent loyalty.points loyalty.tier')
        .lean(),
      LoyaltyMember.countDocuments(query),
    ])

    const phoneHashes = members.map(m => m.phoneHash).filter(Boolean)
    const subs = phoneHashes.length > 0
      ? await PushSubscription.find({ tenantId: tenant._id, phoneHash: { $in: phoneHashes } }).select('phoneHash').lean()
      : []

    const hasPushSet = new Set(subs.map(s => s.phoneHash))

    const data = members.map(m => ({
      _id: m._id,
      name: m.name,
      phone: m.phone,
      email: m.email,
      status: m.status,
      joinedAt: m.joinedAt,
      totalOrders: m.cache?.totalOrders || 0,
      totalSpent: m.cache?.totalSpent || 0,
      points: m.loyalty?.points || 0,
      tier: m.loyalty?.tier || 'none',
      hasPush: hasPushSet.has(m.phoneHash),
    }))

    return NextResponse.json({ data, total, page, limit })
  } catch (error) {
    console.error('[push/members-status]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
