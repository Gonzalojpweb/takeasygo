import { connectDB } from '@/lib/mongoose'
import AuditLog from '@/models/AuditLog'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import mongoose from 'mongoose'

const ACTION_CATEGORIES: Record<string, string[]> = {
  menu:     ['menu.category.created', 'menu.category.updated', 'menu.category.deleted', 'menu.item.created', 'menu.item.updated', 'menu.item.deleted'],
  settings: ['settings.branding.updated', 'settings.profile.updated', 'settings.mercadopago.updated', 'settings.location.created', 'settings.location.updated'],
  auth:     ['auth.login', 'auth.logout'],
  orders:   ['order.status_changed'],
}

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const { searchParams } = new URL(request.url)
    const tenantId  = searchParams.get('tenantId')
    const category  = searchParams.get('category')   // menu | settings | auth | orders | all
    const dateFrom  = searchParams.get('dateFrom')
    const dateTo    = searchParams.get('dateTo')
    const page      = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit     = Math.min(100, Math.max(10, Number(searchParams.get('limit') ?? 50)))

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter: Record<string, any> = {}

    if (tenantId && mongoose.isValidObjectId(tenantId)) {
      filter.tenantId = new mongoose.Types.ObjectId(tenantId)
    }

    if (category && category !== 'all' && ACTION_CATEGORIES[category]) {
      filter.action = { $in: ACTION_CATEGORIES[category] }
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom)
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999))
    }

    // ── Fetch logs + tenant names ─────────────────────────────────────────────
    const [total, logs, tenants] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tenant.find({ isActive: true })
        .select('_id name slug plan')
        .sort({ name: 1 })
        .lean(),
    ])

    // Attach tenant name to each log row
    const tenantMap = new Map(tenants.map((t: any) => [t._id.toString(), { name: t.name, slug: t.slug, plan: t.plan }]))
    const rows = logs.map((log: any) => ({
      ...log,
      _id:        log._id.toString(),
      tenantId:   log.tenantId?.toString() ?? null,
      tenantName: tenantMap.get(log.tenantId?.toString() ?? '')?.name ?? '—',
      tenantSlug: tenantMap.get(log.tenantId?.toString() ?? '')?.slug ?? '',
      tenantPlan: tenantMap.get(log.tenantId?.toString() ?? '')?.plan ?? '',
      userId:     log.userId?.toString() ?? null,
      createdAt:  log.createdAt?.toISOString?.() ?? String(log.createdAt),
    }))

    return NextResponse.json({
      rows,
      total,
      page,
      pages: Math.ceil(total / limit),
      tenants: tenants.map((t: any) => ({ _id: t._id.toString(), name: t.name, slug: t.slug, plan: t.plan })),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
