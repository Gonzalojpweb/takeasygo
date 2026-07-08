// Endpoint público — no requiere auth — solo expone datos seguros del estado del pedido
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'

// Cache simple: evita múltiples verificaciones a MP en poco tiempo
const mpStatusCache = new Map<string, { status: string; timestamp: number }>()
const MP_CHECK_CACHE_TTL = 30_000 // 30 seg caching

async function verifyPaymentStatus(order: any, accessToken: string, tenantId: string) {
  if (!order.payment.mercadopagoId || !accessToken) return order.status

  const cacheKey = order.payment.mercadopagoId
  const cached = mpStatusCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < MP_CHECK_CACHE_TTL) {
    return cached.status
  }

  try {
    // Buscar payments por external_reference (orderNumber) - el más reciente primero
    const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${order.orderNumber}&sort=date_created&criteria=desc&limit=1`
    
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log(`[track] MP API error:`, response.status)
      return order.payment.status
    }

    const searchResult = await response.json() as any
    console.log(`[track] MP search for order ${order.orderNumber}:`, searchResult.paging?.total || 0, 'results')

    // Obtener el payment
    const paymentData = searchResult.results?.[0]

    if (!paymentData) {
      console.log(`[track] No payment found for order ${order.orderNumber}`)
      return 'pending'
    }

    console.log(`[track] Found payment ${paymentData.id} with status ${paymentData.status},collector ${paymentData.collector?.id}`)
    
    mpStatusCache.set(cacheKey, { status: paymentData.status || 'pending', timestamp: Date.now() })
    return paymentData.status || 'pending'
  } catch (err) {
    console.error('[track] Error verifying MP payment:', err)
    return order.payment.status
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasMpConfigured = tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken
    console.log(`[track] Tenant ${tenantSlug}: mpConfigured=${hasMpConfigured}`)

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('status statusTimestamps orderNumber total items customer.name notes payment.status payment.method payment.mercadopagoId payment.baseTotal payment.surchargePercent payment.surchargeAmount payment.transferConfirmed orderTiming scheduledPickupAt scheduledStatus deliveryConfirmation deliveryAddress')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let currentStatus = order.status
    console.log(`[track] Order ${order.orderNumber}:status=${order.status}, method=${order.payment?.method}`)

    // Si es transferencia, no verificar MP — el flujo es manual
    if (order.payment?.method === 'transfer') {
      return NextResponse.json({
        status: currentStatus,
        orderNumber: order.orderNumber,
        confirmedAt: order.statusTimestamps?.confirmedAt ?? null,
        estimatedReadyAt: order.statusTimestamps?.estimatedReadyAt ?? null,
        customerEstimatedReadyAt: order.statusTimestamps?.customerEstimatedReadyAt ?? null,
        orderTiming: order.orderTiming ?? 'immediate',
        scheduledPickupAt: order.scheduledPickupAt ?? null,
        scheduledStatus: order.scheduledStatus ?? null,
        deliveryAddress: order.deliveryAddress ? {
          street: order.deliveryAddress.street,
          number: order.deliveryAddress.number,
          apt: order.deliveryAddress.apt ?? null,
          city: order.deliveryAddress.city,
          coordinates: order.deliveryAddress.coordinates ?? null,
        } : null,
        deliveryConfirmation: order.deliveryConfirmation ? {
          customerCode: order.deliveryConfirmation.customerCode?.code ?? null,
          status: order.deliveryConfirmation.status,
          deliveryPersonName: order.deliveryConfirmation.deliveryPersonName ?? null,
          arrivalAt: order.deliveryConfirmation.arrivalAt ?? null,
          completedAt: order.deliveryConfirmation.completedAt ?? null,
        } : null,
        payment: {
          method: order.payment.method,
          baseTotal: order.payment.baseTotal,
          surchargePercent: order.payment.surchargePercent,
          surchargeAmount: order.payment.surchargeAmount,
          transferConfirmed: order.payment.transferConfirmed,
        },
      }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    // Si el pedido está esperando pago, verificamos el estado real en MercadoPago
    if (order.status === 'awaiting_payment' && order.payment?.mercadopagoId && hasMpConfigured && tenant.mercadopago?.accessToken) {
      const accessToken = decrypt(tenant.mercadopago.accessToken) as string
      const tenantId = (tenant as any)._id?.toString()
      console.log(`[track] Calling MP verify for order ${order.orderNumber}, token exists=${!!accessToken}`)
      const mpStatus = await verifyPaymentStatus(order, accessToken, tenantId)
      console.log(`[track] MP status: ${mpStatus}`)

      // Si MP aprobó el pago, actualizamos el pedido en DB
      if (mpStatus === 'approved') {
        const dbOrder = await Order.findOne({ _id: order._id, status: 'awaiting_payment' })
        if (dbOrder) {
          dbOrder.payment.status = 'approved'
          dbOrder.status = 'confirmed'
          await dbOrder.save()
          currentStatus = 'confirmed'
          console.log(`[track] Order ${order.orderNumber} confirmed via MP verification`)
        } else {
          // El pedido ya fue actualizado por el webhook
          const updatedOrder = await Order.findById(order._id)
          currentStatus = updatedOrder?.status || 'confirmed'
          console.log(`[track] Order ${order.orderNumber} status from DB: ${currentStatus}`)
        }
      } else if (['rejected', 'cancelled'].includes(mpStatus)) {
        const dbOrder = await Order.findById(order._id)
        if (dbOrder && dbOrder.status === 'awaiting_payment') {
          dbOrder.payment.status = mpStatus
          dbOrder.status = 'cancelled'
          await dbOrder.save()
          currentStatus = 'cancelled'
        }
      }
    }

    return NextResponse.json({
      status:              currentStatus,
      orderNumber:         order.orderNumber,
      confirmedAt:         order.statusTimestamps?.confirmedAt ?? null,
      estimatedReadyAt:    order.statusTimestamps?.estimatedReadyAt ?? null,
      customerEstimatedReadyAt: order.statusTimestamps?.customerEstimatedReadyAt ?? null,
      readyAt:             order.statusTimestamps?.readyAt ?? null,
      orderTiming:         order.orderTiming ?? 'immediate',
      scheduledPickupAt:   order.scheduledPickupAt ?? null,
      scheduledStatus:     order.scheduledStatus ?? null,
      deliveryAddress: order.deliveryAddress ? {
        street: order.deliveryAddress.street,
        number: order.deliveryAddress.number,
        apt: order.deliveryAddress.apt ?? null,
        city: order.deliveryAddress.city,
        coordinates: order.deliveryAddress.coordinates ?? null,
      } : null,
      deliveryConfirmation: order.deliveryConfirmation ? {
        customerCode: order.deliveryConfirmation.customerCode?.code ?? null,
        status: order.deliveryConfirmation.status,
        deliveryPersonName: order.deliveryConfirmation.deliveryPersonName ?? null,
        arrivalAt: order.deliveryConfirmation.arrivalAt ?? null,
        completedAt: order.deliveryConfirmation.completedAt ?? null,
      } : null,
      payment: {
        method: order.payment?.method ?? 'mercadopago',
        baseTotal: order.payment?.baseTotal ?? 0,
        surchargePercent: order.payment?.surchargePercent ?? 0,
        surchargeAmount: order.payment?.surchargeAmount ?? 0,
        transferConfirmed: order.payment?.transferConfirmed ?? false,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
