import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string }> }
) {
  try {
    const { tenant: tenantSlug, token } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({
      tenantId: tenant._id,
      groupSessionToken: token,
      status: 'open',
    })
    if (!order) {
      return NextResponse.json({ error: 'Sesión grupal no encontrada o ya cerrada' }, { status: 404 })
    }

    if (order.sessionExpiresAt && new Date(order.sessionExpiresAt) < new Date()) {
      return NextResponse.json({ error: 'La sesión grupal expiró. Podés extender el tiempo.' }, { status: 410 })
    }

    if ((order.items as any[]).length === 0) {
      return NextResponse.json({ error: 'No hay items en la sesión para confirmar' }, { status: 400 })
    }

    const body = await request.json()
    const email = body?.email?.toLowerCase().trim()
    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const corpAccount = await CorporateAccount.findOne({
      _id: order.corporateAccountId,
      status: 'active',
    }).lean()

    if (!corpAccount || corpAccount.companyAdminEmail.toLowerCase() !== email) {
      return NextResponse.json({ error: 'Solo el mail de empresa puede confirmar el pedido grupal' }, { status: 403 })
    }

    const isDeferred = order.paymentModeSnapshot === 'deferred'

    order.status = isDeferred ? 'confirmed' : 'awaiting_payment'
    order.statusTimestamps = {
      ...order.statusTimestamps,
      confirmedAt: isDeferred ? new Date() : null,
    }
    order.sessionExpiresAt = new Date() // Invalidate session immediately

    await order.save()

    return NextResponse.json({
      order: {
        _id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
