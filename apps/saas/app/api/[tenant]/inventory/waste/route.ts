import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { wasteSchema, recordWaste } from '@/lib/inventory/capture'

/**
 * POST /api/[tenant]/inventory/waste (capture)
 * Registra evidencia en el ledger. source, actor y sede los define el
 * servidor; `clientEventId` hace idempotente el reintento
 * (ver lib/inventory/capture.ts).
 */
export const POST = inventoryRoute('capture', async (ctx) => {
  const input = wasteSchema.parse(await readInventoryBody(ctx.request))
  const result = await recordWaste(ctx, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.waste',
    entity: 'inventory',
    entityId: input.clientEventId,
    details: { input, result },
    request: ctx.request,
  })
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
})
