import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'
import { findMpAccountById, getActiveMpAccount } from '@/lib/mercadopago'
import { captureCheckoutCompletedFromOrder } from '@/lib/events-server'

/** Resumen compacto para que el fallback client de order-success pueda emitir
 *  checkout_completed si el server no llegó a hacerlo (mismo dedup por orderId). */
interface CheckoutOrderSummary {
  total?: number
  payment?: { baseTotal?: number; method?: string }
  orderMode?: string
  items?: Array<{ quantity?: number }>
}

function checkoutSummary(order: CheckoutOrderSummary) {
  return {
    amount: order.payment?.baseTotal ?? order.total ?? 0,
    quantity: order.items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 0,
    orderMode: order.orderMode,
    paymentMethod: order.payment?.method,
  }
}

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
        orderId: order._id,
        checkout: checkoutSummary(order),
        alreadyConfirmed: true,
      })
    }

    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({
        status: order.status,
        paymentStatus: order.payment.status,
        orderNumber: order.orderNumber,
        orderId: order._id,
      })
    }

    // ── Resolve MP account from Order (source of truth), fallback to active ──
    let mpAccount = order.payment.mpAccountId
      ? findMpAccountById(tenant, order.payment.mpAccountId)
      : null
    if (!mpAccount) {
      mpAccount = getActiveMpAccount(tenant)
    }
    if (!order.payment.mercadopagoId || !mpAccount) {
      return NextResponse.json({
        status: order.status,
        paymentStatus: order.payment.status,
        orderNumber: order.orderNumber,
        cannotVerify: true,
      })
    }

    const accessToken = decrypt(mpAccount.accessToken)
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
      // prev del ORDER status, capturado antes de mutar (criterio único:
      // lib/events-server.ts) — polling repetido sobre pago aprobado no
      // re-emite checkout_completed.
      const previousStatus = order.status
      order.payment.status = 'approved'
      order.payment.mercadopagoData = { status: mpStatus } as any
      if (order.status === 'awaiting_payment') {
        order.status = 'confirmed'
      }
      await order.save()

      finalizeHiddenRewardClaims(order._id, order.customerPhoneHash).catch(() => {})
      const { onOrderConfirmed } = await import('@/lib/printing')
      onOrderConfirmed(order).catch(() => {})

      // checkout_completed (gate becameCompleted + dedup atómico por orderId)
      captureCheckoutCompletedFromOrder(order, tenant._id, previousStatus).catch(err =>
        console.error('[verify-payment-by-number] checkout_completed event error:', err)
      )

      return NextResponse.json({
        status: 'confirmed',
        paymentStatus: 'approved',
        orderNumber: order.orderNumber,
        orderId: order._id,
        checkout: checkoutSummary(order),
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
      orderId: order._id,
    })
  } catch (error: any) {
    console.error('[verify-payment-by-number] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
