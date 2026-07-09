import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import PushNotificationLog from '@/models/PushNotificationLog'
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
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')))

    const [logs, total] = await Promise.all([
      PushNotificationLog.find({ tenantId: tenant._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PushNotificationLog.countDocuments({ tenantId: tenant._id }),
    ])

    return NextResponse.json({ data: logs, total, page, limit })
  } catch (error) {
    console.error('[push/logs]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
