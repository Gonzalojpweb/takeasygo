import { NextResponse } from 'next/server'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { createTransferSchema, createTransfer, listTransfers, transferView } from '@/lib/inventory/transfer-flow'

/**
 * Circuito de transferencias entre sedes del mismo comercio (F1).
 *
 * GET  /api/[tenant]/inventory/transfer-requests?locationId=&estado=abiertas|cerradas  (read)
 *   Transferencias que salen o entran a las sedes del alcance, con lo que el
 *   usuario puede hacer en cada una (`actions`). `sedes`: todas las sedes del
 *   comercio (solo nombre), para elegir a quién pedirle.
 *
 * POST /api/[tenant]/inventory/transfer-requests  (capture)
 *   Body: { fromLocationId, toLocationId, toStorageLocationId?, lines: [{ skuId, quantity }], note?, dispatchNow? }
 *   Pedido: lo hace la sede DESTINO. Con `dispatchNow: { fromStorageLocationId }`
 *   es un envío directo del ORIGEN (encargado): nace despachada.
 *   Cantidades en la unidad base del insumo. El actor sale de la sesión.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const sp = ctx.request.nextUrl.searchParams
  const estado = sp.get('estado')
  const [transfers, sedes] = await Promise.all([
    listTransfers(ctx, {
      locationId: sp.get('locationId'),
      open: estado === 'abiertas' ? true : estado === 'cerradas' ? false : undefined,
    }),
    Location.find({ tenantId: ctx.tenantObjectId, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean<Array<{ _id: unknown; name: string }>>(),
  ])
  return NextResponse.json({ transfers, sedes: sedes.map((l) => ({ id: String(l._id), name: l.name })) })
})

export const POST = inventoryRoute('capture', async (ctx) => {
  const input = createTransferSchema.parse(await readInventoryBody(ctx.request))
  const doc = await createTransfer(ctx, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: input.dispatchNow ? 'inventory.transfer.send' : 'inventory.transfer.request',
    entity: 'inventory',
    entityId: doc.transferId,
    details: { fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, lines: input.lines.length },
    request: ctx.request,
  })
  return NextResponse.json({ transfer: await transferView(ctx, doc) }, { status: 201 })
})
