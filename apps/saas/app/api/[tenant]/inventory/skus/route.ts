import { NextResponse } from 'next/server'
import InventorySKU from '@/models/InventorySKU'
import { logAudit } from '@/lib/audit'
import { canRoleUse, inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { createSku, skuInputSchema } from '@/lib/inventory/catalog'

/**
 * GET /api/[tenant]/inventory/skus (capture) — catálogo de insumos.
 * El costo de compra solo viaja a quien tiene `read`.
 */
export const GET = inventoryRoute('capture', async (ctx) => {
  const includeInactive = ctx.request.nextUrl.searchParams.get('all') === '1'
  const hidden = canRoleUse(ctx.user.role, 'read') ? '-nameKey -__v' : '-nameKey -__v -lastUnitCostCents'
  const skus = await InventorySKU.find({ tenantId: ctx.tenantObjectId, ...(includeInactive ? {} : { isActive: true }) })
    .select(hidden)
    .sort({ name: 1 })
    .lean()
  return NextResponse.json({ skus })
})

/** POST /api/[tenant]/inventory/skus (recipes) — alta de insumo (para armar recetas). */
export const POST = inventoryRoute('recipes', async (ctx) => {
  const input = skuInputSchema.parse(await readInventoryBody(ctx.request))
  const sku = await createSku(ctx.tenantObjectId, input)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.sku.create', entity: 'inventory', entityId: String(sku._id), details: { name: sku.name, unit: sku.canonicalUnit }, request: ctx.request })
  return NextResponse.json({ sku }, { status: 201 })
})
