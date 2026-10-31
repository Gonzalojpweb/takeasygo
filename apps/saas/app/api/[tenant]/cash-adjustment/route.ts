import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, CASH_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'

/**
 * POST /{tenant}/cash-adjustment
 *
 * Marks a cash order as not collected.
 * Sets payment.cashAdjustmentApplied = true so reports exclude it.
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

    const authError = await requireTenantRole(request, tenant._id.toString(), CASH_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'cash.movements.write',
    })
    if (permError) return permError

    const body = await request.json()
    const { orderId } = body

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
    const sedeError = await guardRequestLocation(request, order.locationId, 'Pedido no encontrado o ya ajustado')
    if (sedeError) return sedeError

    const now = new Date()

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        'payment.cashAdjustmentApplied': true,
        'payment.cashAdjustmentAppliedAt': now,
        'payment.cashAdjustmentAppliedBy': tenant._id.toString(),
      },
    })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'cash.adjustment.applied',
      entity: 'order',
      entityId: order._id.toString(),
      details: {
        orderNumber: order.orderNumber,
        amount: order.total,
      },
      request,
    })

    return NextResponse.json({ ok: true, orderId: order._id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
