/**
 * Admin Dashboard — Métodos de Pago
 *
 * GET /api/[tenant]/admin/dashboard/metodos-pago
 *
 * Returns sales breakdown by payment method (MercadoPago, Transfer, Kripton).
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
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const paymentData = await Order.aggregate([
      { $match: { tenantId, ...sedeMatch, createdAt: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: {
        _id: '$payment.method',
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
      }},
      { $sort: { revenue: -1 } },
    ])

    const methods = paymentData.map((d: any) => ({
      method: d._id || 'desconocido',
      orderCount: d.orders,
      revenue: d.revenue,
    }))

    return NextResponse.json(methods)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/metodos-pago GET]', msg)
    return NextResponse.json({ error: 'Error al obtener métodos de pago', detail: msg }, { status: 500 })
  }
}
