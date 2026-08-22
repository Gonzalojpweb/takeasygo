import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant?.mercadopago?.accessToken) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    // Si ya está confirmado, no necesitamos verificar
    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({ status: order.status, paymentStatus: order.payment.status })
    }

    // Si no tiene mercadopagoId, no podemos verificar
    if (!order.payment.mercadopagoId) {
      return NextResponse.json({ status: order.status, paymentStatus: order.payment.status })
    }

    // Consultar el status del pago a Mercado Pago
    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)
    const paymentData = await paymentClient.get({ id: order.payment.mercadopagoId })

    // Actualizar el status según la respuesta de Mercado Pago
    order.payment.status = paymentData.status as any
    order.payment.mercadopagoData = paymentData as any

    if (paymentData.status === 'approved') {
      if (order.status === 'awaiting_payment') {
        order.status = 'confirmed'
      }
    } else if (['rejected', 'cancelled'].includes(paymentData.status!)) {
      order.status = 'cancelled'
    }

    await order.save()

    if (order.status === 'confirmed') {
      finalizeHiddenRewardClaims(order._id, order.customerPhoneHash).catch(() => {})
    }

    return NextResponse.json({ 
      status: order.status, 
      paymentStatus: order.payment.status,
      mpStatus: paymentData.status 
    })
  } catch (error: any) {
    console.error('[verify-payment] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
