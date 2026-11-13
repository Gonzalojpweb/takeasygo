import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { supplierPatchSchema, updateSupplier } from '@/lib/inventory/purchasing'

type Params = { tenant: string; supplierId: string }

/** PATCH /api/[tenant]/inventory/suppliers/[supplierId]  (manage) — editar, desactivar o reactivar. */
export const PATCH = inventoryRoute<Params>('manage', async (ctx, params) => {
  const patch = supplierPatchSchema.parse(await readInventoryBody(ctx.request))
  const supplier = await updateSupplier(ctx, params.supplierId, patch)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.supplier.update', entity: 'inventory', entityId: params.supplierId, details: { fields: Object.keys(patch) }, request: ctx.request })
  return NextResponse.json({ supplier })
})
