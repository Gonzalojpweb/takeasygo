import { NextResponse } from 'next/server'
import InventoryLedger from '@/models/InventoryLedger'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'
import { transferStock } from '@/lib/inventory/transfer'

/**
 * POST /api/[tenant]/inventory/transfers  (manage: admin · manager)
 * Body: { skuId, fromStorageLocationId, toStorageLocationId, quantity, reason?, transferId? }
 *
 * Transfiere stock entre depósitos (misma u otra sede). El usuario necesita
 * alcance sobre la sede de ORIGEN; el destino tiene que ser del tenant.
 * Queda en el ledger (TransferOut + TransferIn, mismo correlationId) y en la
 * bitácora. El actor sale de la sesión, nunca del body.
 *
 * GET /api/[tenant]/inventory/transfers  (read)
 * Transferencias recientes que salen o entran a las sedes del alcance.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  const body = (await readInventoryBody(ctx.request)) as Record<string, unknown>
  if (typeof body !== 'object' || body === null) throw InventoryError.validation('Body inválido')

  const { transferId } = await transferStock({
    tenantId: ctx.tenantId,
    skuId: body.skuId as string,
    fromStorageLocationId: body.fromStorageLocationId as string,
    toStorageLocationId: body.toStorageLocationId as string,
    quantity: body.quantity as number,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
    transferId: typeof body.transferId === 'string' ? body.transferId : undefined,
    actorId: ctx.user.id,
    assertLocation: ctx.assertLocation,
  })

  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.transfer',
    entity: 'inventory',
    entityId: transferId,
    details: {
      skuId: body.skuId,
      quantity: body.quantity,
      fromStorageLocationId: body.fromStorageLocationId,
      toStorageLocationId: body.toStorageLocationId,
    },
    request: ctx.request,
  })

  return NextResponse.json({ transferId }, { status: 201 })
})

export const GET = inventoryRoute('read', async (ctx) => {
  const requested = ctx.request.nextUrl.searchParams.get('locationId')
  if (requested) ctx.assertLocation(requested)
  const sedes = requested ? [requested] : ctx.scopedLocationIds
  // La sede viaja en el payload (origen y destino): se filtra por ambas.
  const sedeMatch = sedes
    ? { $or: [{ 'payload.fromLocationId': { $in: sedes } }, { 'payload.toLocationId': { $in: sedes } }] }
    : {}

  const transfers = await InventoryLedger.find({ tenantId: ctx.tenantObjectId, eventType: 'TransferOut', ...sedeMatch })
    .sort({ occurredAt: -1 })
    .limit(100)
    .select('skuId occurredAt actorId correlationId payload')
    .lean()

  return NextResponse.json({ transfers })
})
