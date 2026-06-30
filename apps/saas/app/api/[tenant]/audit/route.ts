import { connectDB } from '@/lib/mongoose'
import AuditLog from '@/models/AuditLog'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'

const PAGE_SIZE = 50

/**
 * GET /api/[tenant]/audit?page=1&entity=order&action=status_changed
 * Admin-only. Returns paginated audit log entries for the tenant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page') ?? 1))
    const entity = sp.get('entity') ?? ''
    const action = sp.get('action') ?? ''
    const userId = sp.get('userId') ?? ''

    const filter: Record<string, any> = { tenantId: tenant._id }
    if (entity) filter.entity = entity
    if (action) filter.action = { $regex: action, $options: 'i' }
    if (userId) filter.userId = userId

    const [entries, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      AuditLog.countDocuments(filter),
    ])

    return NextResponse.json({
      entries,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener auditoría' }, { status: 500 })
  }
}
