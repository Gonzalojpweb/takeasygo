import { NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import Order from '@/models/Order'
import Table from '@/models/Table'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { syncOrderConsumptionSafe } from '@/lib/inventory/sales'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosCapability, orderStatusCapability } from '@/lib/pos-online/permissions'
import { isValidOrderTransition, allowedOrderTransitions } from '@takeasygo/business'
import { toPosOrder, type PosOrderStatusValue } from '@/lib/pos-online/orderMapper'
import { findPosOrder, assertPosId, type PosOrderDoc } from '@/lib/pos-online/orderRepo'
import { claimCheckoutRedemptionsForOrder } from '@/lib/store-redemptions'
import Tenant from '@/models/Tenant'
import { encrypt, hashPhone } from '@/lib/crypto'
import { addPointsFromOrder } from '@/lib/loyalty'
import { syncReferralsForOrder } from '@/lib/referrals'
import { runAfterResponse } from '@/lib/after-response'
import { requireManagerApproval } from '@/lib/pos-online/approval'

// ============================================================================
// GET   /api/[tenant]/pos/orders/[id] — una orden por su posId
// PATCH /api/[tenant]/pos/orders/[id] — transición de estado, notas o el
//       celular del cliente (socio del club: suma puntos del club y, si lo
//       invitó un socio, cuenta para el programa de referidos)
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
      // cancelledBy es el ACTOR (client/admin/system), no el usuario: el
      // usuario que canceló queda en el audit log (pos.order.update).
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
  const customerPhone = body.customerPhone

  if (nextStatus === undefined && notes === undefined && customerPhone === undefined) {
    throw PosError.validation('Se esperaba status, notes o customerPhone')
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

  // Celular del cliente: se guarda cifrado + su hash (misma forma que los
  // pedidos online). '' lo quita. El audit no guarda el número.
  if (customerPhone !== undefined) {
    if (typeof customerPhone !== 'string') throw PosError.validation('customerPhone inválido')
    const digits = customerPhone.replace(/\D/g, '')
    if (digits.length === 0) {
      update['customer.phone'] = ''
      update['customer.phoneHash'] = null
    } else if (digits.length < 8 || digits.length > 15) {
      throw PosError.validation('El celular del cliente no es válido')
    } else {
      update['customer.phone'] = encrypt(customerPhone.trim())
      update['customer.phoneHash'] = hashPhone(customerPhone)
    }
    audit.customerPhone = digits.length > 0 ? 'set' : 'cleared'
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

    // Fase 1 de caja (2026-10): una orden COBRADA no se cancela acá — se
    // anula con POST /pos/orders/[id]/void, que registra la devolución en la
    // caja y pide encargado. Cancelar un pedido que ya salió a cocina
    // también necesita encargado (la comida se hizo y no se cobra).
    if (to === 'cancelled') {
      const paid = (current as unknown as { posPayments?: unknown[] | null }).posPayments
      if (paid && paid.length > 0) {
        throw PosError.conflict('Esta orden ya está cobrada: usá «Anular venta» para devolver el dinero')
      }
      if (from !== 'pending') {
        const approval = await requireManagerApproval(
          ctx,
          'order.cancel',
          'Cancelar un pedido que ya está en cocina necesita la aprobación de un encargado'
        )
        audit.approvedBy = approval.approvedBy
      }
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

  // Inventario: una cancelación devuelve los insumos descontados; cualquier
  // otro cambio de estado se reconcilia (idempotente).
  if (update.status !== undefined) {
    const synced = await Order.findOne({ tenantId: ctx.tenantId, locationId: ctx.locationId, posId }).lean()
    if (synced) await syncOrderConsumptionSafe(synced as never)
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
      { $set: { status: 'free', currentOrderId: null, needsBill: false, guests: null } }
    )
  }

  // Club: con el celular del cliente, el pedido entregado suma los puntos del
  // club y cuenta para el programa de referidos (visita al local). Una
  // cancelación revierte el paso del referido. Después de responder.
  const finalStatus = (updated as unknown as { status: string }).status
  if (finalStatus === 'delivered' && (to === 'delivered' || customerPhone !== undefined)) {
    runAfterResponse('club (pedido POS entregado)', async () => {
      const [full, tenant] = await Promise.all([
        Order.findOne({ tenantId: ctx.tenantId, locationId: ctx.locationId, posId }),
        Tenant.findById(ctx.tenantId).select('_id loyalty pointsConfig').lean(),
      ])
      if (!full?.customer?.phoneHash || !tenant) return
      await addPointsFromOrder(full, tenant)
      await syncReferralsForOrder(full)
    })
  } else if (to === 'cancelled') {
    runAfterResponse('referidos (pedido POS cancelado)', () => syncReferralsForOrder(updated as never))
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
