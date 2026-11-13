import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { createSupplier, listSuppliers, supplierInputSchema } from '@/lib/inventory/purchasing'

/**
 * GET  /api/[tenant]/inventory/suppliers?todos=1  (read) — proveedores del comercio.
 * POST /api/[tenant]/inventory/suppliers  (manage) — alta de proveedor.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const all = ctx.request.nextUrl.searchParams.get('todos') === '1'
  return NextResponse.json({ suppliers: await listSuppliers(ctx, all) })
})

export const POST = inventoryRoute('manage', async (ctx) => {
  const input = supplierInputSchema.parse(await readInventoryBody(ctx.request))
  const supplier = await createSupplier(ctx, input)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.supplier.create', entity: 'inventory', entityId: supplier._id, details: { name: supplier.name }, request: ctx.request })
  return NextResponse.json({ supplier }, { status: 201 })
})
