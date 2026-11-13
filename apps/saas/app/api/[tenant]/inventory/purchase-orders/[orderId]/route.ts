import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { applyPoAction, poActionSchema, toPoViews } from '@/lib/inventory/purchasing'

type Params = { tenant: string; orderId: string }

/**
 * PATCH /api/[tenant]/inventory/purchase-orders/[orderId]  (capture)
 * Body: { action: 'update' | 'send' | 'receive' | 'close' | 'cancel', ... }
 *   · update / send / close / cancel: además manage y todas las sedes de la
 *     orden en tu alcance.
 *   · receive: { receiptId, invoiceRef?, items: [{ skuId, storageLocationId, quantity, unitCostCents? }] }
 *     solo en depósitos de sedes de tu alcance; reintentar con el mismo
 *     receiptId no duplica.
 * 409 si la orden cambió en el medio.
 */
export const PATCH = inventoryRoute<Params>('capture', async (ctx, params) => {
  const input = poActionSchema.parse(await readInventoryBody(ctx.request))
  const doc = await applyPoAction(ctx, params.orderId, input)
  logAudit({ tenantId: ctx.tenantId, action: `inventory.purchase.${input.action}`, entity: 'inventory', entityId: params.orderId, details: { action: input.action, number: doc.number }, request: ctx.request })
  return NextResponse.json({ order: (await toPoViews(ctx, [doc]))[0] })
})
