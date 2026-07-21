import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { confirmOrderPayment } from '@/lib/sync-layer'

/**
 * POST /{tenant}/orders/{orderId}/confirm-internal
 *
 * Internal endpoint called by the SyncLayer when the POS confirms a transfer.
 * Auth: Bearer token = SYNC_LAYER_SECRET (internal API secret, not JWT).
 *
 * This runs confirmOrderPayment() which handles:
 *   1. confirmOrderInSyncLayer (idempotent)
 *   2. notifyCashSale (cash movement)
 *   3. captureOrderCompleted (CIS events)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params

    // Auth: Bearer token = SYNC_LAYER_SECRET
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const expectedSecret = process.env.SYNC_LAYER_SECRET ?? ''
    if (!expectedSecret || token !== expectedSecret) {
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

    // Run the shared confirmation function
    await confirmOrderPayment(order, tenant)

    return NextResponse.json({ status: 'confirmed' })
  } catch (error) {
    console.error('[confirm-internal] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
