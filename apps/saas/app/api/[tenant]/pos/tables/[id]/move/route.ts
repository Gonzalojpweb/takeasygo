import { NextResponse } from 'next/server'
import Table from '@/models/Table'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { requireManagerApproval } from '@/lib/pos-online/approval'
import { toPosTable } from '@/lib/pos-online/tableMapper'
import { findPosTable, assertTablePosId, type PosTableDoc } from '@/lib/pos-online/tableRepo'

// ============================================================================
// POST /api/[tenant]/pos/tables/[id]/move — cambiar de mesa o unir mesas
// ============================================================================
// Fase C (2026-10). Body: { toTableId, join?: boolean }
//   · destino LIBRE   → CAMBIO: la cuenta entera (rondas, comensales, mozo,
//     cuenta pedida) pasa a la mesa destino; el origen queda libre.
//   · destino OCUPADO → UNIR: exige `join: true` (el POS lo confirma con el
//     operador). Las rondas del origen pasan al destino, los comensales se
//     suman y la cuenta pedida se reabre (cambió el total).
//   · destino reservado / cerrado / llamando → 409.
// Solo caja/encargado/admin (tables.manage): el mozo no reubica cuentas.
//
// Orden de escritura: destino (con concurrencia optimista) → rondas →
// origen. Si algo falla en el medio, las rondas siguen apuntando a una mesa
// existente y el operador reintenta; nunca se pierde una cuenta.
// ============================================================================

/** Rondas que todavía viven en la mesa (no cerradas ni anuladas). */
const OPEN_ORDER_FILTER = { status: { $nin: ['delivered', 'cancelled'] }, voided: { $exists: false } }

export const POST = posRoute('tables.manage', async (ctx, { id }) => {
  const fromId = assertTablePosId(id)
  const body = await readPosBody(ctx.request)
  requireFields(body, ['toTableId'])
  const toId = assertTablePosId(body.toTableId)
  if (toId === fromId) throw PosError.validation('La mesa destino es la misma')
  const join = body.join === true

  const from = (await findPosTable(ctx, fromId)) as PosTableDoc & { guests?: number | null }
  const to = (await findPosTable(ctx, toId)) as PosTableDoc & { guests?: number | null }

  if (from.status !== 'occupied') {
    throw PosError.conflict('Solo se mueve una mesa ocupada')
  }
  if (to.status !== 'free' && to.status !== 'occupied') {
    throw PosError.conflict(`La mesa destino está ${to.status === 'reserved' ? 'reservada' : 'no disponible'}`)
  }
  const merging = to.status === 'occupied'
  if (merging && !join) {
    throw PosError.conflict('La mesa destino está ocupada: confirmá si querés unir las mesas')
  }
  // Unir reabre la cuenta del destino: si ya la había pedido, es reabrirla
  // (misma regla que PATCH needsBill=false → PIN de encargado).
  if (merging && to.needsBill) {
    await requireManagerApproval(ctx, 'table.reopen', 'La mesa destino ya pidió la cuenta: unir necesita la aprobación de un encargado')
  }

  const toUpdate = merging
    ? {
        guests: (to.guests ?? 0) + (from.guests ?? 0) || null,
        needsBill: false,
        currentOrderId: to.currentOrderId ?? from.currentOrderId ?? null,
      }
    : {
        status: 'occupied',
        guests: from.guests ?? null,
        needsBill: from.needsBill ?? false,
        serverId: from.serverId ?? null,
        currentOrderId: from.currentOrderId ?? null,
      }

  const updatedTo = await Table.findOneAndUpdate(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posId: toId, updatedAt: to.updatedAt },
    { $set: toUpdate },
    { new: true }
  ).lean()
  if (!updatedTo) throw PosError.conflict('La mesa destino cambió mientras se procesaba la petición')

  const moved = await Order.updateMany(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posTableId: fromId, ...OPEN_ORDER_FILTER },
    { $set: { posTableId: toId } }
  )

  const updatedFrom = await Table.findOneAndUpdate(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, posId: fromId },
    { $set: { status: 'free', currentOrderId: null, serverId: null, needsBill: false, guests: null } },
    { new: true }
  ).lean()

  await logAudit({
    tenantId: ctx.tenantId,
    action: merging ? 'pos.table.join' : 'pos.table.move',
    entity: 'Table',
    entityId: fromId,
    details: { from: fromId, to: toId, fromNumber: from.number, toNumber: to.number, movedOrders: moved.modifiedCount },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({
    mode: merging ? 'join' : 'move',
    movedOrders: moved.modifiedCount,
    from: toPosTable(updatedFrom as unknown as PosTableDoc),
    to: toPosTable(updatedTo as unknown as PosTableDoc),
  })
})
