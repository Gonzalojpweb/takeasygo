/**
 * Admin Dashboard — Pedidos Recientes
 *
 * GET /api/[tenant]/admin/dashboard/pedidos-recientes
 *
 * Returns last 5 orders with customer info.
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

    const orders = await Order.find({ tenantId: tenant._id, ...sedeMatch, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber total status customer.name createdAt')
      .lean()

    return NextResponse.json(orders)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/pedidos-recientes GET]', msg)
    return NextResponse.json({ error: 'Error al obtener pedidos', detail: msg }, { status: 500 })
  }
}
