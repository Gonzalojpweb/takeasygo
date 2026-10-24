import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import PointIntent from '@/models/PointIntent'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosId } from '@/lib/pos-online/orderRepo'
import { logAudit } from '@/lib/audit'
import { MpPointError, createPointIntent, pointDeviceFor, pointTokenFor } from '@/lib/mp-point'

// ============================================================================
// /api/[tenant]/pos/point — MercadoPago Point desde el POS (Fase 6)
// ============================================================================
//   GET  → { enabled }: la sede tiene un posnet Point configurado.
//   POST { orderId, amount } → manda el cobro al posnet; devuelve intentId.
//        El monto no puede superar lo que falta cobrar de la orden.
// El estado se consulta en /pos/point/[intentId].
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  const deviceId = await pointDeviceFor(ctx.tenantId, ctx.locationId)
  return NextResponse.json({ enabled: Boolean(deviceId) })
})

export const POST = posRoute('orders.pay', async (ctx) => {
  const body = await readPosBody<{ orderId?: unknown; amount?: unknown }>(ctx.request)
  const orderPosId = assertPosId(body.orderId)
  const amount = body.amount
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1) {
    throw PosError.validation('amount debe ser un entero en centavos ≥ 1')
  }

  const deviceId = await pointDeviceFor(ctx.tenantId, ctx.locationId)
  if (!deviceId) throw PosError.conflict('Esta sede no tiene un posnet MercadoPago Point configurado')

  const order = await Order.findOne({ tenantId: ctx.tenantId, locationId: ctx.locationId, posId: orderPosId })
    .select('total status posPayments')
    .lean<{ total: number; status: string; posPayments?: unknown[] }>()
  if (!order) throw PosError.notFound('Orden no encontrada')
  if (order.status === 'cancelled') throw PosError.conflict('La orden está cancelada')
  if ((order.posPayments?.length ?? 0) > 0) throw PosError.conflict('La orden ya está cobrada')
  if (amount > order.total) throw PosError.validation('El monto supera el total de la orden')

  try {
    const token = await pointTokenFor(ctx.tenantId, ctx.locationId)
    const intentId = await createPointIntent(token, deviceId, {
      amountCents: amount,
      externalReference: orderPosId,
      description: 'Cobro en caja',
    })
    await PointIntent.create({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      orderPosId,
      deviceId,
      intentId,
      amountCents: amount,
      createdBy: ctx.user.id,
    })
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'pos.point.intent',
      entity: 'Order',
      entityId: orderPosId,
      details: { amount, deviceId },
      request: ctx.request,
      userId: ctx.user.id,
      userRole: ctx.user.role,
    })
    return NextResponse.json({ intentId }, { status: 201 })
  } catch (err) {
    if (err instanceof MpPointError) throw PosError.conflict(err.message)
    throw err
  }
})
