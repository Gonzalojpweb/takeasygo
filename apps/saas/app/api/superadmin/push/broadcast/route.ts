import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import PushSubscription from '@/models/PushSubscription'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin, getSessionUser } from '@/lib/apiAuth'
import { sendBulkPush, logPushNotification } from '@/lib/push'

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    await connectDB()

    const body = await request.json()
    const { title, body: messageBody, url, tenantSlugs } = body

    if (!title || !messageBody) {
      return NextResponse.json({ error: 'Faltan título o mensaje' }, { status: 400 })
    }

    // If tenantSlugs provided, only target those tenants; otherwise all active
    const tenantQuery: any = { isActive: true }
    if (Array.isArray(tenantSlugs) && tenantSlugs.length > 0) {
      tenantQuery.slug = { $in: tenantSlugs }
    }

    const tenants = await Tenant.find(tenantQuery).select('_id slug').lean()

    let totalTargeted = 0
    let totalSuccess = 0
    let totalFail = 0

    for (const tenant of tenants) {
      const subs = await PushSubscription.find({
        tenantId: tenant._id,
        phoneHash: { $exists: true, $nin: [null, ''] },
      }).lean()

      if (subs.length === 0) continue

      totalTargeted += subs.length
      const result = await sendBulkPush(subs, title, messageBody, url)
      totalSuccess += result.successCount
      totalFail += result.failCount

      await logPushNotification({
        tenantId: tenant._id.toString(),
        sentBy: user.id,
        sentByRole: 'superadmin',
        title,
        body: messageBody,
        url,
        targetType: 'global_broadcast',
        targetCount: subs.length,
        successCount: result.successCount,
        failCount: result.failCount,
      })
    }

    return NextResponse.json({
      success: true,
      tenantsTargeted: tenants.length,
      totalTargeted,
      totalSuccess,
      totalFail,
    })
  } catch (error) {
    console.error('[superadmin/push/broadcast]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
