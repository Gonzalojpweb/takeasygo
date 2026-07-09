import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import PushSubscription from '@/models/PushSubscription'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const totalSubscriptions = await PushSubscription.countDocuments({})
    const totalLinked = await PushSubscription.countDocuments({
      phoneHash: { $ne: null, $exists: true, $ne: '' },
    })
    const totalUnlinked = await PushSubscription.countDocuments({
      $or: [
        { phoneHash: { $exists: false } },
        { phoneHash: null },
        { phoneHash: '' },
      ],
    })

    const tenants = await Tenant.find({ isActive: true }).select('slug name').sort({ name: 1 }).lean()

    const tenantStats = await Promise.all(
      tenants.map(async (t) => {
        const subs = await PushSubscription.countDocuments({ tenantId: t._id })
        const linked = await PushSubscription.countDocuments({
          tenantId: t._id,
          phoneHash: { $ne: null, $exists: true, $ne: '' },
        })
        return {
          _id: t._id,
          slug: t.slug,
          name: t.name,
          total: subs,
          linked,
        }
      })
    )

    return NextResponse.json({
      totalSubscriptions,
      totalLinked,
      totalUnlinked,
      tenants: tenantStats,
    })
  } catch (error) {
    console.error('[superadmin/push/stats]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
