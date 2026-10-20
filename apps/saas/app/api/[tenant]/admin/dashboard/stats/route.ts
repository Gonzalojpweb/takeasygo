/**
 * Admin Dashboard — Stats
 *
 * GET /api/[tenant]/admin/dashboard/stats
 *
 * Returns total, pending, confirmed, cancelled order counts.
 * Uses only Order model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveDashboardScope } from '@/lib/dashboard-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const resolved = await resolveDashboardScope<{ _id: any }>(request, tenantSlug)
    if (!resolved.ok) return resolved.response
    const { tenant, match: sedeMatch } = resolved.scope

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const tenantId = tenant._id

    const [total, pending, confirmed, cancelled] = await Promise.all([
      Order.countDocuments({ tenantId, ...sedeMatch, deletedAt: null }),
      Order.countDocuments({ tenantId, ...sedeMatch, deletedAt: null, status: 'pending' }),
      Order.countDocuments({ tenantId, ...sedeMatch, deletedAt: null, status: 'confirmed' }),
      Order.countDocuments({ tenantId, ...sedeMatch, deletedAt: null, status: 'cancelled' }),
    ])

    return NextResponse.json({ total, pending, confirmed, cancelled })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/stats GET]', msg)
    return NextResponse.json({ error: 'Error al obtener stats', detail: msg }, { status: 500 })
  }
}
