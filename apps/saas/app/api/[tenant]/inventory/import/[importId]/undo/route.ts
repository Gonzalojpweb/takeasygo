import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute } from '@/lib/inventory/route'
import { undoImport } from '@/lib/inventory/import/commit'

/**
 * POST /api/[tenant]/inventory/import/[importId]/undo (manage)
 * Desactiva los insumos que creó la importación si nadie los usó después.
 * Los conteos quedan en el historial (el ledger no se borra).
 */
export const POST = inventoryRoute<{ tenant: string; importId: string }>('manage', async (ctx, params) => {
  const result = await undoImport(ctx, params.importId)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.import.undo',
    entity: 'inventory',
    entityId: params.importId,
    details: result,
    request: ctx.request,
  })
  return NextResponse.json(result)
})
