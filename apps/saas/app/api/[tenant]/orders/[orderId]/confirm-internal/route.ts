import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { confirmOrderPaymentCore } from '@/lib/sync-layer'
import { matchesInternalSecret } from '@/lib/internal-secret'

/**
 * POST /{tenant}/orders/{orderId}/confirm-internal
 *
 * Internal endpoint called by the SyncLayer worker when confirming an order.
 * Auth: X-Internal-Secret = SYNC_LAYER_SECRET o INTERNAL_API_SECRET (no JWT).
 *
 * Uses confirmOrderPaymentCore() which skips confirmOrderInSyncLayer
 * (already done by the SyncLayer) and goes directly to:
 *   1. notifyCashSale (cash movement)
 *   2. captureOrderCompleted (CIS events)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params

    // Auth: X-Internal-Secret — acepta SYNC_LAYER_SECRET o INTERNAL_API_SECRET
    // (los dos nombres ya conviven entre despliegues; debe coincidir el valor).
    if (!matchesInternalSecret(request.headers.get('x-internal-secret'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.status !== 'confirmed' && order.status !== 'awaiting_confirmation') {
      return NextResponse.json({ error: 'El pedido ya fue procesado' }, { status: 400 })
    }

    // Core confirmation: notifyCashSale + captureOrderCompleted (no SyncLayer roundtrip)
    await confirmOrderPaymentCore(order, tenant)

    return NextResponse.json({ status: 'confirmed' })
  } catch (error) {
    console.error('[confirm-internal] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
