// Endpoint público — no requiere auth — solo expone datos seguros del estado del pedido
// Seguridad: requiere header x-tracking-token (bearer del pedido). Nunca se envía por query string.
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import ImpactEvent from '@/models/ImpactEvent'
import { decrypt } from '@/lib/crypto'
import { rateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'

// Cache simple: evita múltiples verificaciones a MP en poco tiempo
const mpStatusCache = new Map<string, { status: string; timestamp: number }>()
const MP_CHECK_CACHE_TTL = 30_000 // 30 seg caching

const TRACKING_HEADER = 'x-tracking-token'

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
      return order.payment.status
    }

    const searchResult = await response.json() as any

    // Obtener el payment
    const paymentData = searchResult.results?.[0]

    if (!paymentData) {
      return 'pending'
    }

    mpStatusCache.set(cacheKey, { status: paymentData.status || 'pending', timestamp: Date.now() })
    return paymentData.status || 'pending'
  } catch (err) {
    console.error('[track] Error verifying MP payment:', err)
    return order.payment.status
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params

    // Rate limit por IP + orderId (Vercel sanea x-forwarded-for en edge)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
    const { success } = await rateLimit(`track:${tenantSlug}:${orderId}:${ip}`, 30, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasMpConfigured = tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('status statusTimestamps orderNumber total items customer.name notes payment.status payment.method payment.mercadopagoId payment.baseTotal payment.surchargePercent payment.surchargeAmount payment.transferConfirmed orderTiming scheduledPickupAt scheduledStatus deliveryConfirmation deliveryAddress trackingToken trackingTokenUsedAt hiddenRewardClaims')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validación estricta del tracking token (solo por header)
    const suppliedToken = request.headers.get(TRACKING_HEADER)
    if (!order.trackingToken) {
      console.warn(`[track] 403: orden ${order.orderNumber} sin trackingToken (sin backfill) ip=${ip}`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!suppliedToken || suppliedToken !== order.trackingToken) {
      console.warn(`[track] 403: token inválido para orden ${order.orderNumber} ip=${ip}`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Registrar primer uso (auditoría de abuso — no invalida el token)
    if (!order.trackingTokenUsedAt) {
      Order.updateOne(
        { _id: order._id, trackingTokenUsedAt: null },
        { $set: { trackingTokenUsedAt: new Date() } }
      ).catch(() => {})
    }

    let currentStatus = order.status

    // Si es transferencia, no verificar MP — el flujo es manual
    if (order.payment?.method === 'transfer') {
      // Check if impact was registered for this order
      const impactExists = await ImpactEvent.exists({ orderId: order._id })

      // Hidden reward summary (solo para órdenes confirmadas con claims)
      let hiddenRewardSummary: { menuItemId: string; title: string; discountPercentage: number }[] | null = null
      if (order.hiddenRewardClaims?.length > 0 && ['confirmed', 'preparing', 'ready', 'en_ruta', 'arrived', 'delivered'].includes(currentStatus)) {
        const claims = await HiddenRewardClaim.find({ _id: { $in: order.hiddenRewardClaims } })
          .select('menuItemId rewardTitle discountPercentage')
          .lean()
        hiddenRewardSummary = claims.map(c => ({
          menuItemId: c.menuItemId?.toString() ?? '',
          title: c.rewardTitle ?? '',
          discountPercentage: c.discountPercentage ?? 0,
        }))
      }

      return NextResponse.json({
        status: currentStatus,
        orderNumber: order.orderNumber,
        confirmedAt: order.statusTimestamps?.confirmedAt ?? null,
        estimatedReadyAt: order.statusTimestamps?.estimatedReadyAt ?? null,
        customerEstimatedReadyAt: order.statusTimestamps?.customerEstimatedReadyAt ?? null,
        orderTiming: order.orderTiming ?? 'immediate',
        scheduledPickupAt: order.scheduledPickupAt ?? null,
        scheduledStatus: order.scheduledStatus ?? null,
        impactRegistered: !!impactExists,
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
        hiddenRewardSummary,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    // Si el pedido está esperando pago, verificamos el estado real en MercadoPago
    if (order.status === 'awaiting_payment' && order.payment?.mercadopagoId && hasMpConfigured && tenant.mercadopago?.accessToken) {
      const accessToken = decrypt(tenant.mercadopago.accessToken) as string
      const tenantId = (tenant as any)._id?.toString()
      const mpStatus = await verifyPaymentStatus(order, accessToken, tenantId)

      // Si MP aprobó el pago, actualizamos el pedido en DB
      if (mpStatus === 'approved') {
        const dbOrder = await Order.findOne({ _id: order._id, status: 'awaiting_payment' })
        if (dbOrder) {
          dbOrder.payment.status = 'approved'
          dbOrder.status = 'confirmed'
          await dbOrder.save()
          finalizeHiddenRewardClaims(dbOrder._id, dbOrder.customerPhoneHash).catch(() => {})
          currentStatus = 'confirmed'
        } else {
          // El pedido ya fue actualizado por el webhook
          const updatedOrder = await Order.findById(order._id)
          currentStatus = updatedOrder?.status || 'confirmed'
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

    // Check if impact was registered for this order
    const impactExists = await ImpactEvent.exists({ orderId: order._id })

    // Hidden reward summary (solo para órdenes que ya confirmaron y tienen claims)
    let hiddenRewardSummary: { menuItemId: string; title: string; discountPercentage: number }[] | null = null
    if (order.hiddenRewardClaims?.length > 0 && ['confirmed', 'preparing', 'ready', 'en_ruta', 'arrived', 'delivered'].includes(currentStatus)) {
      const claims = await HiddenRewardClaim.find({ _id: { $in: order.hiddenRewardClaims } })
        .select('menuItemId rewardTitle discountPercentage')
        .lean()
      hiddenRewardSummary = claims.map(c => ({
        menuItemId: c.menuItemId?.toString() ?? '',
        title: c.rewardTitle ?? '',
        discountPercentage: c.discountPercentage ?? 0,
      }))
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
      impactRegistered:    !!impactExists,
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
      hiddenRewardSummary,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
