import { NextResponse } from 'next/server'
import InventorySKU from '@/models/InventorySKU'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { createSku, skuInputSchema } from '@/lib/inventory/catalog'

/** GET /api/[tenant]/inventory/skus (capture) — catálogo de insumos. */
export const GET = inventoryRoute('capture', async (ctx) => {
  const includeInactive = ctx.request.nextUrl.searchParams.get('all') === '1'
  const skus = await InventorySKU.find({ tenantId: ctx.tenantObjectId, ...(includeInactive ? {} : { isActive: true }) })
    .select('-nameKey -__v')
    .sort({ name: 1 })
    .lean()
  return NextResponse.json({ skus })
})

/** POST /api/[tenant]/inventory/skus (manage) — alta de insumo. */
export const POST = inventoryRoute('manage', async (ctx) => {
  const input = skuInputSchema.parse(await readInventoryBody(ctx.request))
  const sku = await createSku(ctx.tenantObjectId, input)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.sku.create', entity: 'inventory', entityId: String(sku._id), details: { name: sku.name, unit: sku.canonicalUnit }, request: ctx.request })
  return NextResponse.json({ sku }, { status: 201 })
})
