import { NextResponse } from 'next/server'
import Table from '@/models/Table'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import {
  isValidTableTransition,
  allowedTableTransitions,
} from '@takeasygo/business'
import type { TableStatus } from '@takeasygo/types'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosCapability, tableStatusCapability } from '@/lib/pos-online/permissions'
import { toPosTable, TABLE_STATUSES } from '@/lib/pos-online/tableMapper'
import { findPosTable, assertTablePosId, type PosTableDoc } from '@/lib/pos-online/tableRepo'

// ============================================================================
// GET   /api/[tenant]/pos/tables/[id] — una mesa por su posId
// PATCH /api/[tenant]/pos/tables/[id] — transición / mesero / pedido / factura
// ============================================================================

/**
 * Estados que solo se alcanzan cuando la orden ya terminó. Espejo exacto de
 * freeTable/closeTable en services/table.ts del POS.
 */
const RELEASE_TARGETS: TableStatus[] = ['free', 'closed']

function assertOptionalString(value: unknown, field: string, max = 100): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw PosError.validation(`${field} inválido`)
  }
  return value
}

/**
 * Libre/cerrar solo si la orden que estaba en la mesa terminó.
 * Sin esto, el server aceptaría liberar una mesa con gente comiendo.
 */
async function assertCanRelease(
  ctx: { tenantId: string; locationId: string },
  currentOrderId: string | null | undefined
): Promise<void> {
  if (!currentOrderId) return

  const order = await Order.findOne({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posId: currentOrderId,
  })
    .select('status')
    .lean()

  if (order && !['delivered', 'cancelled'].includes(order.status)) {
    throw PosError.conflict(
      `No se puede liberar la mesa: la orden ${currentOrderId} está en estado ${order.status}`
    )
  }
}

export const GET = posRoute('tables.read', async (ctx, { id }) => {
  const table = await findPosTable(ctx, id)
  return NextResponse.json({ table: toPosTable(table) })
})

export const PATCH = posRoute('tables.service', async (ctx, { id }) => {
  const body = await readPosBody(ctx.request)
  const posId = assertTablePosId(id)

  const current = await findPosTable(ctx, posId)
  const update: Record<string, unknown> = {}
  const audit: Record<string, unknown> = {}

  // ── needsBill: cambio de flag, no toca el estado ──────────────────────────
  if (body.needsBill !== undefined) {
    if (typeof body.needsBill !== 'boolean') {
      throw PosError.validation('needsBill debe ser booleano')
    }
    update.needsBill = body.needsBill
    audit.needsBill = body.needsBill
  }

  // ── comensales (Fase B): se informan al abrir la mesa, se pueden corregir ──
  if (body.guests !== undefined) {
    if (
      body.guests !== null &&
      (typeof body.guests !== 'number' || !Number.isInteger(body.guests) || body.guests < 1 || body.guests > 99)
    ) {
      throw PosError.validation('guests debe ser un entero entre 1 y 99')
    }
    update.guests = body.guests
    audit.guests = body.guests
  }

  // ── mesero / orden activa ─────────────────────────────────────────────────
  if (body.serverId !== undefined) {
    update.serverId = assertOptionalString(body.serverId, 'serverId')
    audit.serverId = update.serverId
  }
  if (body.currentOrderId !== undefined) {
    // Re-vincular una mesa que ya tiene OTRA orden es una decisión del
    // Counter (mover cuenta); el mozo solo vincula una mesa sin orden.
    const bound = (current as { currentOrderId?: string | null }).currentOrderId
    if (bound && body.currentOrderId !== bound) {
      assertPosCapability(ctx.user.role, 'tables.manage')
    }
    update.currentOrderId = assertOptionalString(body.currentOrderId, 'currentOrderId', 100)
    audit.currentOrderId = update.currentOrderId
  }

  // ── transición de estado (va después para que el clear gane) ─────────────
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !TABLE_STATUSES.includes(body.status as TableStatus)) {
      throw PosError.validation('Estado de mesa desconocido')
    }
    const from = current.status as TableStatus
    const to = body.status as TableStatus
    // Mozo: ocupar o llamar al encargado. Liberar/reservar/cerrar = Counter.
    assertPosCapability(ctx.user.role, tableStatusCapability(to))

    if (!isValidTableTransition(from, to)) {
      throw PosError.transition(from, to, allowedTableTransitions(from))
    }

    if (RELEASE_TARGETS.includes(to)) {
      await assertCanRelease(ctx, current.currentOrderId)
      update.currentOrderId = null
      update.serverId = null
      update.needsBill = false
      update.guests = null
    }

    update.status = to
    audit.from = from
    audit.to = to
  }

  if (Object.keys(update).length === 0) {
    throw PosError.validation('Nada que actualizar')
  }

  // Concurrency optimista: solo escribimos si la mesa sigue como la leímos.
  const updated = await Table.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
      updatedAt: current.updatedAt,
    },
    { $set: update },
    { new: true }
  )
    .lean()
    .exec()

  if (!updated) {
    throw PosError.conflict('La mesa cambió mientras se procesaba la petición', `posId=${posId}`)
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.table.update',
    entity: 'Table',
    entityId: posId,
    details: { posId, ...audit },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ table: toPosTable(updated as unknown as PosTableDoc) })
})
