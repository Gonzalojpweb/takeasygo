import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsApp } from '@/lib/whatsapp'
import { safeDecrypt } from '@/lib/crypto'
import { toPesos } from '@takeasygo/business'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.payment.method !== 'transfer') {
      return NextResponse.json({ error: 'Esta orden no es de tipo transferencia' }, { status: 400 })
    }

    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'El pedido no está esperando pago' }, { status: 400 })
    }

    order.status = 'awaiting_confirmation'
    await order.save()

    // ── Notificar al restaurante via WhatsApp ───────────────────────
    if (tenant.notifications?.whatsappPhone && tenant.notifications.notifyOnOrder) {
      const baseUrl = process.env.NEXT_PUBLIC_URL || request.nextUrl.origin
      const customerName = safeDecrypt(order.customer?.name) || 'Cliente'
      const amount = order.total || 0
      const waMessage =
`🔔 *${customerName}* reportó una transferencia de *$${toPesos(amount).toLocaleString('es-AR')}* (pedido #${order.orderNumber}).

Ingresá al panel para confirmar el pago:
${baseUrl}/${tenantSlug}/admin/orders`

      sendWhatsApp(tenant.notifications.whatsappPhone, waMessage)
        .catch(e => console.error('[whapi] transfer notification error:', e))
    }

    return NextResponse.json({ status: order.status })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
