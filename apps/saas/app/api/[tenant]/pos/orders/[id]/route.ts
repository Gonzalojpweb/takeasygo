import { NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import Order from '@/models/Order'
import Table from '@/models/Table'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosCapability, orderStatusCapability } from '@/lib/pos-online/permissions'
import { isValidOrderTransition, allowedOrderTransitions } from '@takeasygo/business'
import { toPosOrder, type PosOrderStatusValue } from '@/lib/pos-online/orderMapper'
import { findPosOrder, assertPosId, type PosOrderDoc } from '@/lib/pos-online/orderRepo'
import { claimCheckoutRedemptionsForOrder } from '@/lib/store-redemptions'

// ============================================================================
// GET   /api/[tenant]/pos/orders/[id] — una orden por su posId
// PATCH /api/[tenant]/pos/orders/[id] — transición de estado (o notas)
// ============================================================================

/** Estados que liberan la mesa (espejo de cancelOrder/deliverOrder del POS). */
const RELEASES_TABLE: PosOrderStatusValue[] = ['cancelled', 'delivered']

const STATUSES = new Set<string>([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'en_ruta',
  'arrived',
  'delivered',
  'cancelled',
  'requires_manual_attention',
])

type OrderDoc = PosOrderDoc

/**
 * Campos `statusTimestamps.*` que se tumban al entrar a un estado.
 *
 * Se escribe con claves LITERALES a propósito: una clave armada en runtime
 * (`update[\`statusTimestamps.${field}\`]`) es exactamente lo que el linter
 * de seguridad marca como inyectable, y acá no aporta nada.
 */
function statusTimestampsFor(to: PosOrderStatusValue): Record<string, unknown> {
  const now = new Date()
  switch (to) {
    case 'confirmed':
      return { 'statusTimestamps.confirmedAt': now }
    case 'preparing':
      return { 'statusTimestamps.preparingAt': now }
    case 'ready':
      return { 'statusTimestamps.readyAt': now }
    case 'en_ruta':
      return { 'statusTimestamps.enRutaAt': now }
    case 'arrived':
      return { 'statusTimestamps.arrivedAt': now }
    case 'delivered':
      return { 'statusTimestamps.deliveredAt': now }
    case 'cancelled':
      return { 'statusTimestamps.cancelledAt': now, 'statusTimestamps.cancelledBy': 'admin' }
    default:
      return {}
  }
}

export const GET = posRoute('orders.read', async (ctx, { id }) => {
  const order = await findPosOrder(ctx, id)
  return NextResponse.json({ order: toPosOrder(order) })
})

export const PATCH = posRoute('orders.write', async (ctx, { id }) => {
  const body = await readPosBody(ctx.request)
  const posId = assertPosId(id)

  const nextStatus = body.status
  const notes = body.notes

  if (nextStatus === undefined && notes === undefined) {
    throw PosError.validation('Se esperaba status o notes')
  }

  const current = await findPosOrder(ctx, posId)

  const update: Record<string, unknown> = {}
  const audit: Record<string, unknown> = {}
  let from: PosOrderStatusValue | undefined
  let to: PosOrderStatusValue | undefined
  let cashSaleToRegister = false

  if (notes !== undefined) {
    if (typeof notes !== 'string' || notes.length > 2000) {
      throw PosError.validation('notes inválidas')
    }
    update.notes = notes
    audit.notes = true
  }

  if (nextStatus !== undefined) {
    if (typeof nextStatus !== 'string' || !STATUSES.has(nextStatus)) {
      throw PosError.validation('Estado desconocido')
    }
    from = current.status as PosOrderStatusValue
    to = nextStatus as PosOrderStatusValue
    // El mozo solo manda a cocina; preparar/entregar/cancelar es del Counter.
    assertPosCapability(ctx.user.role, orderStatusCapability(to))

    if (!isValidOrderTransition(from, to)) {
      // El POS no reimplementa el grafo: recibe los destinos legales.
      throw PosError.transition(from, to, allowedOrderTransitions(from))
    }

    update.status = to
    audit.from = from
    audit.to = to

    // El doc real tiene `payment` (schema Order) aunque PosOrderDoc no lo declara.
    const payment = (current as unknown as { payment?: { method?: string; status?: string } }).payment
    // Cobro en efectivo: pending → approved SOLO al entregar. El POS no
    // "cobra" cuando mueve la orden a preparación/cocina. La venta en caja
    // se registra después del update, en el mismo momento.
    if (
      to === 'delivered' &&
      payment?.method === 'cash' &&
      payment.status === 'pending'
    ) {
      update['payment.status'] = 'approved'
      cashSaleToRegister = true
    }

    Object.assign(update, statusTimestampsFor(to))
  }

  if (Object.keys(update).length === 0) {
    throw PosError.validation('Nada que actualizar')
  }

  // Concurrency optimista: solo escribimos si el estado sigue siendo el que
  // leímos. Si otro request lo cambió en el medio, es 409 y el POS reintenta
  // con la versión fresca, en vez de pisar una transición.
  const updated = await Order.findOneAndUpdate(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posId, status: current.status },
    { $set: update },
    { new: true }
  )
    .lean()
    .exec()

  if (!updated) {
    throw PosError.conflict(
      'La orden cambió de estado mientras se procesaba la petición',
      `posId=${posId}`
    )
  }

  // Canjes de checkout del pedido: al entregar se reclaman solos.
  if (to === 'delivered') {
    const deliveredOrder = updated as unknown as import('@/models/Order').IOrder
    await claimCheckoutRedemptionsForOrder(deliveredOrder._id, deliveredOrder.locationId)
  }

  // Cobro en efectivo concretado al entregar: registrar venta en caja + CIS
  // (fire-and-forget; deduplica por orderId+tenantId si otro camino también
  // registró).
  if (cashSaleToRegister) {
    const { registerCashSaleOnDelivery } = await import('@/lib/order-side-effects')
    registerCashSaleOnDelivery({
      order: updated as unknown as import('@/models/Order').IOrder,
      tenant: { _id: ctx.tenantId as unknown as Types.ObjectId },
    })
  }

  // Comanda: al confirmar se generan los printJobs que consume el
  // printer-agent de la sede (mismo hook que las órdenes online). Antes las
  // órdenes del POS nunca imprimían (Auditoría POS Online V1 §8). Se espera
  // (no fire-and-forget): en serverless el proceso puede morir al responder.
  if (to === 'confirmed') {
    const fullOrder = await Order.findOne({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
    })
    if (fullOrder) {
      const { onOrderConfirmed } = await import('@/lib/printing')
      await onOrderConfirmed(fullOrder)
    }
  }

  // Impresión en cocina diferida (flujo cash): el POS no tiene modal de
  // cajero, así que al entrar a preparing se imprime por defecto; al
  // cancelar solo se limpia el flag (sin comanda nueva).
  if ((to === 'preparing' && from === 'confirmed') || to === 'cancelled') {
    const fullOrder = await Order.findOne({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
    })
    if (fullOrder) {
      const { settleDeferredKitchenPrint } = await import('@/lib/printing')
      await settleDeferredKitchenPrint(fullOrder, { print: to !== 'cancelled' })
      await fullOrder.save()
    }
  }

  if (
    update.status !== undefined &&
    RELEASES_TABLE.includes(update.status as PosOrderStatusValue) &&
    current.posTableId
  ) {
    await Table.updateOne(
      {
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        posId: current.posTableId,
        currentOrderId: posId,
      },
      { $set: { status: 'free', currentOrderId: null, needsBill: false } }
    )
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.update',
    entity: 'Order',
    entityId: posId,
    details: { posId, ...audit },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(updated as unknown as OrderDoc) })
})
