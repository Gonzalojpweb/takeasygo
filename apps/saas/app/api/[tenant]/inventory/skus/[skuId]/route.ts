import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody, objectId } from '@/lib/inventory/route'
import { updateSku, skuPatchSchema } from '@/lib/inventory/catalog'

/** PATCH /api/[tenant]/inventory/skus/[skuId] (manage). La unidad no cambia si hay movimientos. */
export const PATCH = inventoryRoute<{ tenant: string; skuId: string }>('manage', async (ctx, { skuId }) => {
  const patch = skuPatchSchema.parse(await readInventoryBody(ctx.request))
  const sku = await updateSku(ctx.tenantObjectId, objectId(skuId, 'skuId'), patch)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.sku.update', entity: 'inventory', entityId: skuId, details: patch, request: ctx.request })
  return NextResponse.json({ sku })
})
