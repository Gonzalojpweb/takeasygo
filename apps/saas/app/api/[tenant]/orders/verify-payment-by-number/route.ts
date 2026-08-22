import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const orderNumber = request.nextUrl.searchParams.get('orderNumber')
    if (!orderNumber) {
      return NextResponse.json({ error: 'orderNumber requerido' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ orderNumber, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready' || order.status === 'delivered') {
      return NextResponse.json({
        status: order.status,
        paymentStatus: order.payment.status,
        orderNumber: order.orderNumber,
        alreadyConfirmed: true,
      })
    }

    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({
        status: order.status,
        paymentStatus: order.payment.status,
        orderNumber: order.orderNumber,
      })
    }

    if (!order.payment.mercadopagoId || !tenant.mercadopago?.accessToken) {
      return NextResponse.json({
        status: order.status,
        paymentStatus: order.payment.status,
        orderNumber: order.orderNumber,
        cannotVerify: true,
      })
    }

    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)

    let mpStatus: string | undefined
    try {
      const paymentData = await paymentClient.get({ id: order.payment.mercadopagoId })
      mpStatus = paymentData.status
    } catch {
      const mpSearch = await paymentClient.search({
        options: {
          external_reference: orderNumber,
          sort: 'date_created',
          criteria: 'desc',
          limit: 1,
        },
      })
      const found = mpSearch.results?.[0] as any
      mpStatus = found?.status
      if (found?.id) {
        order.payment.mercadopagoId = String(found.id)
      }
    }

    if (mpStatus === 'approved') {
      order.payment.status = 'approved'
      order.payment.mercadopagoData = { status: mpStatus } as any
      if (order.status === 'awaiting_payment') {
        order.status = 'confirmed'
      }
      await order.save()

      finalizeHiddenRewardClaims(order._id, order.customerPhoneHash).catch(() => {})

      return NextResponse.json({
        status: 'confirmed',
        paymentStatus: 'approved',
        orderNumber: order.orderNumber,
        justConfirmed: true,
      })
    }

    order.payment.status = mpStatus as any
    if (['rejected', 'cancelled'].includes(mpStatus!)) {
      order.status = 'cancelled'
    }
    await order.save()

    return NextResponse.json({
      status: order.status,
      paymentStatus: mpStatus,
      orderNumber: order.orderNumber,
    })
  } catch (error: any) {
    console.error('[verify-payment-by-number] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
