import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { canRoleUse, inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { countSchema, recordCount } from '@/lib/inventory/capture'

/**
 * POST /api/[tenant]/inventory/counts (capture)
 * Registra evidencia en el ledger. source, actor y sede los define el
 * servidor; `clientEventId` hace idempotente el reintento
 * (ver lib/inventory/capture.ts).
 */
export const POST = inventoryRoute('capture', async (ctx) => {
  const input = countSchema.parse(await readInventoryBody(ctx.request))
  const result = await recordCount(ctx, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.counts',
    entity: 'inventory',
    entityId: input.clientEventId,
    details: { input, result },
    request: ctx.request,
  })
  // El valor en pesos de la diferencia solo viaja a quien tiene `read`.
  const body = canRoleUse(ctx.user.role, 'read') || !result.discrepancy
    ? result
    : { ...result, discrepancy: { ...result.discrepancy, valueCents: undefined } }
  return NextResponse.json(body, { status: result.duplicate ? 200 : 201 })
})
