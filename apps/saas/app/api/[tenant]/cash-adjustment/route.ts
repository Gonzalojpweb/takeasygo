import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CashRegister from '@/models/CashRegister'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * POST /{tenant}/cash-adjustment
 *
 * Marks a cash order as not collected. Creates a negative cash movement
 * (cash_order_not_collected) to reconcile the expected amount.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { orderId, type } = body

    if (!orderId) {
      return NextResponse.json({ error: 'orderId requerido' }, { status: 400 })
    }

    const order = await Order.findOne({
      _id: orderId,
      tenantId: tenant._id,
      'payment.method': 'cash',
      'payment.cashAdjustmentApplied': { $ne: true },
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Pedido no encontrado o ya ajustado' },
        { status: 404 }
      )
    }

    const now = new Date()

    // Mark the order as adjusted
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        'payment.cashAdjustmentApplied': true,
        'payment.cashAdjustmentAppliedAt': now,
        'payment.cashAdjustmentAppliedBy': tenant._id.toString(),
      },
    })

    // Create a negative cash movement to subtract from expected
    // Find the most recent open cash register
    const openRegister = await CashRegister.findOne({
      tenantId: tenant._id,
      status: 'open',
    }).sort({ openDate: -1 })

    if (openRegister) {
      await CashRegister.findByIdAndUpdate(openRegister._id, {
        $push: {
          movements: {
            type: 'cash_order_not_collected',
            amount: -order.total, // negative to subtract
            description: `Pedido ${order.orderNumber} no cobrado`,
            date: now,
            relatedOrderId: order._id,
          },
        },
      })
    }

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'cash.adjustment.applied',
      entity: 'order',
      entityId: order._id.toString(),
      details: {
        orderNumber: order.orderNumber,
        type,
        amount: order.total,
      },
      request,
    })

    return NextResponse.json({ ok: true, orderId: order._id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
