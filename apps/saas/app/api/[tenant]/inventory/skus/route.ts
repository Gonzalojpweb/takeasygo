import { NextResponse } from 'next/server'
import InventorySKU from '@/models/InventorySKU'
import { logAudit } from '@/lib/audit'
import { canRoleUse, inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { createOrReuseSku, skuInputSchema } from '@/lib/inventory/catalog'

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

/**
 * POST /api/[tenant]/inventory/skus (recipes) — alta de insumo (para armar recetas).
 * Si ya existe uno con ese nombre se devuelve ese (`outcome: existing`), y si
 * estaba desactivado se reactiva (`outcome: reactivated`): nunca un error sin salida.
 */
export const POST = inventoryRoute('recipes', async (ctx) => {
  const input = skuInputSchema.parse(await readInventoryBody(ctx.request))
  const { sku, outcome } = await createOrReuseSku(ctx.tenantObjectId, input)
  if (outcome !== 'existing') {
    logAudit({
      tenantId: ctx.tenantId,
      action: outcome === 'created' ? 'inventory.sku.create' : 'inventory.sku.reactivate',
      entity: 'inventory',
      entityId: String(sku._id),
      details: { name: sku.name, unit: sku.canonicalUnit },
      request: ctx.request,
    })
  }
  const body = sku.toObject() as Record<string, unknown>
  delete body.nameKey
  delete body.__v
  if (!canRoleUse(ctx.user.role, 'read')) delete body.lastUnitCostCents
  return NextResponse.json({ sku: body, outcome }, { status: outcome === 'created' ? 201 : 200 })
})
