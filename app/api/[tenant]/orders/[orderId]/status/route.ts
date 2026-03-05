import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['preparing', 'cancelled'],
  preparing:  ['ready', 'cancelled'],
  ready:      ['delivered'],
  delivered:  [],
  cancelled:  [],
}

// Mapeo de status → campo de timestamp (para analytics de TPP)
const STATUS_TIMESTAMP: Record<string, keyof import('@/models/Order').IStatusTimestamps> = {
  confirmed: 'confirmedAt',
  preparing: 'preparingAt',
  ready:     'readyAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

      const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { status } = await request.json()

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    const allowedTransitions = VALID_TRANSITIONS[order.status]
    if (!allowedTransitions.includes(status)) {
      return NextResponse.json(
        { error: `No se puede pasar de "${order.status}" a "${status}"` },
        { status: 400 }
      )
    }

    const previousStatus = order.status
    order.status = status
    // Registrar timestamp del cambio de estado para cálculo de TPP y Score Operativo
    const tsField = STATUS_TIMESTAMP[status]
    if (tsField) {
      order.statusTimestamps[tsField] = new Date()
    }
    await order.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'order.status_changed',
      entity: 'order',
      entityId: orderId,
      details: { orderNumber: order.orderNumber, from: previousStatus, to: status },
      request,
    })

    return NextResponse.json({ order })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
