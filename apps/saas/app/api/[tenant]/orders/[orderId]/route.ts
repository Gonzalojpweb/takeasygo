import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { safeDecrypt } from '@/lib/crypto'

/**
 * GET /api/[tenant]/orders/[orderId]
 * Detalle completo de una orden (items, precios, descuentos, pago).
 * Mismos permisos que el historial: admin, manager, cashier.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id, deletedAt: null }).lean()
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    // Restringir por sedes asignadas (mismo criterio que history)
    const sessionUser = await getSessionUser(request)
    if (sessionUser && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
      const locs = sessionUser.assignedLocations ?? []
      if (locs.length > 0 && !locs.includes(order.locationId?.toString())) {
        return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
      }
    }

    const location = await Location.findById(order.locationId).select('name').lean()

    const o = order as any
    const decrypted = {
      ...o,
      customer: o.customer
        ? {
            ...o.customer,
            name: safeDecrypt(o.customer.name ?? ''),
            phone: safeDecrypt(o.customer.phone ?? ''),
            email: safeDecrypt(o.customer.email ?? ''),
          }
        : o.customer,
      locationName: location?.name ?? '—',
    }

    return NextResponse.json({ order: decrypted })
  } catch (error) {
    console.error('[orders/get] Error:', error)
    return NextResponse.json({ error: 'Error al obtener la orden' }, { status: 500 })
  }
}

export async function DELETE(
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

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.deletedAt) {
      return NextResponse.json({ error: 'La orden ya fue eliminada' }, { status: 400 })
    }

    await Order.updateOne(
      { _id: orderId, tenantId: tenant._id },
      { $set: { deletedAt: new Date() } }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'order.deleted',
      entity: 'Order',
      entityId: orderId,
      details: { orderNumber: order.orderNumber },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[orders/delete] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar la orden' }, { status: 500 })
  }
}
