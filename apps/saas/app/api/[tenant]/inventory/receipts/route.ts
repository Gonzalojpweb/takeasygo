import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { receiveSchema, recordReceipt } from '@/lib/inventory/capture'

/**
 * POST /api/[tenant]/inventory/receipts (capture)
 * Registra evidencia en el ledger. source, actor y sede los define el
 * servidor; `clientEventId` hace idempotente el reintento
 * (ver lib/inventory/capture.ts).
 */
export const POST = inventoryRoute('capture', async (ctx) => {
  const input = receiveSchema.parse(await readInventoryBody(ctx.request))
  const result = await recordReceipt(ctx, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.receipts',
    entity: 'inventory',
    entityId: input.clientEventId,
    details: { input, result },
    request: ctx.request,
  })
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
})
