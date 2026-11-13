import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { applyTransferAction, transferActionSchema, transferView } from '@/lib/inventory/transfer-flow'

type Params = { tenant: string; transferId: string }

/**
 * PATCH /api/[tenant]/inventory/transfer-requests/[transferId]  (capture)
 * Body: { action: 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel', ... }
 *   · approve / reject: además, admin, encargado o jefe de operaciones del ORIGEN.
 *   · dispatch: alguien del ORIGEN; saca el stock del depósito de origen.
 *   · receive: alguien del DESTINO; entra lo que llegó, lo que falta queda
 *     como diferencia del envío.
 *   · cancel: antes de despachar, alguien de cualquiera de las dos sedes.
 * 409 si el estado ya cambió (otro lo hizo antes).
 */
export const PATCH = inventoryRoute<Params>('capture', async (ctx, params) => {
  const input = transferActionSchema.parse(await readInventoryBody(ctx.request))
  const doc = await applyTransferAction(ctx, params.transferId, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: `inventory.transfer.${input.action}`,
    entity: 'inventory',
    entityId: params.transferId,
    details: { action: input.action },
    request: ctx.request,
  })
  return NextResponse.json({ transfer: await transferView(ctx, doc) })
})
