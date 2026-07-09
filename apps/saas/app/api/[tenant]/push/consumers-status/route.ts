import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import PushSubscription from '@/models/PushSubscription'
import { requireAuth } from '@/lib/apiAuth'

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
    const pushFilter = sp.get('pushFilter') || ''

    const query: any = {
      tenantIds: tenant._id,
      isLoyaltyMember: { $ne: true },
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
      ]
    }

    const [consumers, total] = await Promise.all([
      Consumer.find(query)
        .sort({ lastOrderAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name phone email phoneHash totalOrders totalSpent lastOrderAt')
        .lean(),
      Consumer.countDocuments(query),
    ])

    const phoneHashes = consumers.map(c => c.phoneHash).filter(Boolean)
    const subs = phoneHashes.length > 0
      ? await PushSubscription.find({ tenantId: tenant._id, phoneHash: { $in: phoneHashes } }).select('phoneHash').lean()
      : []

    const hasPushSet = new Set(subs.map(s => s.phoneHash))

    let data = consumers.map(c => ({
      _id: c._id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      lastOrderAt: c.lastOrderAt,
      hasPush: hasPushSet.has(c.phoneHash),
    }))

    if (pushFilter === 'with_push') data = data.filter(d => d.hasPush)
    else if (pushFilter === 'without_push') data = data.filter(d => !d.hasPush)

    return NextResponse.json({ data, total, page, limit })
  } catch (error) {
    console.error('[push/consumers-status]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
