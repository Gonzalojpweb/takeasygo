import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute } from '@/lib/inventory/route'
import { importSuppliersFromSkus } from '@/lib/inventory/purchasing'

/**
 * POST /api/[tenant]/inventory/suppliers/import  (manage)
 * Crea proveedores a partir del texto «proveedor» que ya tienen los insumos.
 * No duplica: a los existentes les suma los insumos.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  const result = await importSuppliersFromSkus(ctx)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.supplier.import', entity: 'inventory', details: result, request: ctx.request })
  return NextResponse.json(result)
})
