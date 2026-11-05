import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { listUnbilledOrders } from '@/lib/fiscal/unbilled'

// ============================================================================
// GET /api/[tenant]/pos/fiscal/unbilled — ventas cobradas sin comprobante
// ============================================================================
// Las de los últimos 7 días de la sede. Para emitir una: POST /orders/[id]/invoice.
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  return NextResponse.json({ orders: await listUnbilledOrders(ctx.tenantId, ctx.locationId) })
})
