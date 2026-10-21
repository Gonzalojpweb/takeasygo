import { NextResponse } from 'next/server'
import { z } from 'zod'
import Order from '@/models/Order'
import { inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'
import { reconcileRecentOrders, syncOrderConsumption } from '@/lib/inventory/sales'

const schema = z.object({
  orderId: z.string().optional(),
  hours: z.number().int().min(1).max(24 * 31).optional(),
})

/**
 * POST /api/[tenant]/inventory/sales/reconcile (manage)
 * Botón "Sincronizar ventas": registra en inventario lo que falte de una
 * orden (orderId) o de las órdenes recientes del tenant. Idempotente.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  const input = schema.parse(await readInventoryBody(ctx.request))
  if (input.orderId) {
    const order = await Order.findOne({ _id: input.orderId, tenantId: ctx.tenantObjectId }).lean()
    if (!order) throw InventoryError.notFound('Pedido no encontrado')
    ctx.assertLocation(order.locationId)
    return NextResponse.json(await syncOrderConsumption(order as never))
  }
  if (ctx.scopedLocationIds) throw InventoryError.forbidden('La sincronización masiva es de nivel comercio')
  return NextResponse.json(await reconcileRecentOrders({ tenantId: ctx.tenantId, hours: input.hours ?? 36 }))
})
