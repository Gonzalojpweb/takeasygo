import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'

const MAX_AGE_HOURS = 24

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const authError = await requireAuth(request, tenant._id.toString())
  if (authError) return authError

  const user = await getSessionUser(request)
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const cutoffDate = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000)

  const result = await Order.deleteMany({
    tenantId: tenant._id,
    status: 'cancelled',
    updatedAt: { $lt: cutoffDate },
  })

  return NextResponse.json({
    deleted: result.deletedCount,
    cutoffDate: cutoffDate.toISOString(),
    message: `${result.deletedCount} pedidos cancelados eliminados (mayores de ${MAX_AGE_HOURS}h)`,
  })
}
