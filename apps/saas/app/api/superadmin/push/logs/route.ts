import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import PushNotificationLog from '@/models/PushNotificationLog'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')))

    const [logs, total] = await Promise.all([
      PushNotificationLog.find({ sentByRole: 'superadmin' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PushNotificationLog.countDocuments({ sentByRole: 'superadmin' }),
    ])

    return NextResponse.json({ data: logs, total, page, limit })
  } catch (error) {
    console.error('[superadmin/push/logs]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
