import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import CashRegister from '@/models/CashRegister'
import { generateZReport } from '@takeasygo/business'
import type { CashRegister as PosCashRegister } from '@takeasygo/types'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import {
  assertCents,
  recomputeExpectedAmount,
  toPosMovement,
  toPosRegister,
  type PosRegisterDoc,
} from '@/lib/pos-online/cashMapper'
import { findPosRegister, loadMovementsForRegister } from '@/lib/pos-online/cashRepo'

// ============================================================================
// POST /api/[tenant]/pos/cash/registers/[id]/close — cierra y genera el Z
// ============================================================================
// Consenso v1 §3: el ZReport se genera UNA VEZ y es un snapshot inmutable.
// PDF, impresión y vista web leen exclusivamente de `register.zReport`.
//
// Consenso v1 §1: el arqueo esperado se RECALCULA desde los movimientos
// reales antes de cerrar. `expectedAmount` denormalizado sirve para la vista
// en vivo; el número que entra al Z es el de la fuente de verdad.
// ============================================================================

export const POST = posRoute<{ tenant: string; id: string }>(async (ctx, params) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['finalAmount'])

  const raw = body as Record<string, unknown>
  const finalAmount = assertCents(raw.finalAmount, 'finalAmount')

  const register = await findPosRegister(ctx, params.id)
  if (register.status !== 'open') {
    throw PosError.conflict('La caja ya está cerrada')
  }

  const closedBy =
    typeof raw.closedBy === 'string' && raw.closedBy.trim()
      ? raw.closedBy.trim().slice(0, 120)
      : `${ctx.user.role} (${ctx.user.id})`

  const movementDocs = await loadMovementsForRegister(register._id)
  const movements = movementDocs.map(toPosMovement)

  const base = toPosRegister(register, movements)
  const expectedAmount = recomputeExpectedAmount(base.initialAmount, movements)
  const difference = finalAmount - expectedAmount
  const closedAt = new Date()

  const closedRegister: PosCashRegister = {
    ...base,
    status: 'closed',
    finalAmount,
    expectedAmount,
    difference,
    closedBy,
    closedAt,
  }

  const zReport = generateZReport({ register: closedRegister, movements, closedBy })
  const shareToken = randomUUID()

  // Guard con `status: 'open'` en el filtro: dos cierres simultáneos no
  // pueden generar dos Z distintos para la misma caja.
  const result = await CashRegister.updateOne(
    { _id: register._id as mongoose.Types.ObjectId, status: 'open' },
    {
      $set: {
        status: 'closed',
        finalAmount,
        expectedAmount,
        difference,
        closedBy,
        closedAt,
        zReport: zReport as unknown as Record<string, unknown>,
        shareToken,
      },
    }
  )

  if (result.matchedCount === 0) {
    throw PosError.conflict('La caja ya está cerrada')
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.cash.register.close',
    entity: 'CashRegister',
    entityId: String(register._id),
    details: {
      posId: register.posId,
      finalAmount,
      expectedAmount,
      difference,
      movements: movements.length,
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  const updated = await CashRegister.findOne({
    _id: register._id as mongoose.Types.ObjectId,
  })
    .lean()
    .exec()
  if (!updated) throw PosError.notFound('Caja no encontrada')

  return NextResponse.json({
    register: toPosRegister(updated as unknown as PosRegisterDoc, movements),
    serverTime: new Date().toISOString(),
  })
})
