import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const body = await request.json()

    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant?.mercadopago?.accessToken) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)

    const payment = await paymentClient.get({ id: body.data.id })

    const order = await Order.findOne({
      orderNumber: payment.external_reference,
      tenantId: tenant._id,
    })

    if (!order) return NextResponse.json({ received: true })

    order.payment.status = payment.status as any
    order.payment.mercadopagoData = payment as any

    if (payment.status === 'approved') {
      order.status = 'confirmed'
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      order.status = 'cancelled'
    }

    await order.save()

    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}