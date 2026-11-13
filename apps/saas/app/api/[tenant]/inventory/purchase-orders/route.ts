import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { createOrder, createOrderSchema, listOrders, toPoViews } from '@/lib/inventory/purchasing'

/**
 * GET  /api/[tenant]/inventory/purchase-orders?estado=abiertas|cerradas&proveedor=  (read)
 *   Órdenes con alguna sede en tu alcance, con lo que podés hacer (`actions`),
 *   el texto para el proveedor y el link de WhatsApp.
 * POST /api/[tenant]/inventory/purchase-orders  (manage)
 *   Body: { supplierId, lines: [{ skuId, unitCostCents?, allocations: [{ locationId, storageLocationId?, quantity }] }], note?, expectedAt? }
 *   Nace en borrador. Cantidades en la unidad base del insumo.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const sp = ctx.request.nextUrl.searchParams
  const estado = sp.get('estado')
  const orders = await listOrders(ctx, { open: estado === 'abiertas' ? true : estado === 'cerradas' ? false : undefined, supplierId: sp.get('proveedor') })
  return NextResponse.json({ orders })
})

export const POST = inventoryRoute('manage', async (ctx) => {
  const input = createOrderSchema.parse(await readInventoryBody(ctx.request))
  const doc = await createOrder(ctx, input)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.purchase.create', entity: 'inventory', entityId: String(doc._id), details: { number: doc.number, lines: doc.lines.length }, request: ctx.request })
  return NextResponse.json({ order: (await toPoViews(ctx, [doc]))[0] }, { status: 201 })
})
