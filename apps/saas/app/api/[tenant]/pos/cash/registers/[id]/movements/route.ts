import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import CashRegister from '@/models/CashRegister'
import CashMovement from '@/models/CashMovement'
import { cashExpectedDelta } from '@takeasygo/business'
import type { CashChannel, CashMovementType, PaymentMethod } from '@takeasygo/types'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import {
  ALL_CASH_MOVEMENT_TYPES,
  CASH_CHANNELS,
  PAYMENT_METHODS,
  assertCents,
  assertEnum,
  toPosMovement,
  toPosRegister,
  type PosMovementDoc,
  type PosRegisterDoc,
} from '@/lib/pos-online/cashMapper'
import { findPosRegister, loadMovementsForRegister } from '@/lib/pos-online/cashRepo'

// ============================================================================
// POST /api/[tenant]/pos/cash/registers/[id]/movements — registra un movimiento
// ============================================================================
// Reglas (Consenso v1), todas delegadas a @takeasygo/business o a la DB:
//   §1    el arqueo SOLO se mueve con efectivo → cashExpectedDelta()
//   §2.1  (registerId, relatedOrderId, type) es un índice único: el
//         reintento devuelve el existente, jamás duplica.
// ============================================================================

interface MovementDraft {
  posId: string
  tenantId: string
  locationId: string
  registerId: mongoose.Types.ObjectId
  type: CashMovementType
  amount: number
  reason: string
  userId: string
  channel: CashChannel
  paymentMethod: PaymentMethod
  relatedOrderId: string | null
}

/** Huella del hecho de negocio. Distinta huella con el mismo posId → 409. */
function movementSignature(m: unknown): string {
  const raw = (m ?? {}) as Record<string, unknown>
  return JSON.stringify([
    String(raw.registerId ?? ''),
    raw.type ?? null,
    raw.amount ?? null,
    raw.paymentMethod ?? null,
    raw.channel ?? null,
    raw.relatedOrderId ?? null,
    raw.reason ?? null,
  ])
}

function isDuplicateKey(error: unknown, field: string): boolean {
  const e = error as { code?: number; keyPattern?: unknown }
  if (e?.code !== 11000) return false
  const pattern = e.keyPattern
  if (typeof pattern !== 'object' || pattern === null) return false
  return Object.prototype.hasOwnProperty.call(pattern, field)
}

function assertSameFact(existing: unknown, draft: unknown, posId: string): void {
  if (movementSignature(existing) !== movementSignature(draft)) {
    throw PosError.idempotencyMismatch(
      'Ya existe un movimiento con este posId y un contenido distinto',
      `posId=${posId}`
    )
  }
}

/** Devuelve el movimiento + la caja refrescada (contrato del POS). 201 al crear. */
async function respond(
  ctx: { tenantId: string; locationId: string },
  registerId: unknown,
  movementDoc: unknown,
  status = 200
) {
  const [register, movements] = await Promise.all([
    CashRegister.findOne({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      _id: registerId as mongoose.Types.ObjectId,
    })
      .lean()
      .exec(),
    loadMovementsForRegister(registerId),
  ])

  if (!register) throw PosError.notFound('Caja no encontrada')

  return NextResponse.json(
    {
      movement: toPosMovement(movementDoc as PosMovementDoc),
      register: toPosRegister(register as unknown as PosRegisterDoc, movements.map(toPosMovement)),
      serverTime: new Date().toISOString(),
    },
    { status }
  )
}

export const POST = posRoute<{ tenant: string; id: string }>(async (ctx, params) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['id', 'type', 'amount', 'reason', 'channel', 'paymentMethod'])

  const raw = body as Record<string, unknown>

  const posId = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!posId || posId.length > 100) {
    throw PosError.validation('id inválido')
  }

  const register = await findPosRegister(ctx, params.id)
  if (register.status !== 'open') {
    throw PosError.conflict('La caja está cerrada')
  }

  const type = assertEnum(raw.type, ALL_CASH_MOVEMENT_TYPES, 'type')
  const amount = assertCents(raw.amount, 'amount', 1)
  const channel = assertEnum(raw.channel, CASH_CHANNELS, 'channel')
  const paymentMethod = assertEnum(raw.paymentMethod, PAYMENT_METHODS, 'paymentMethod')

  const reason = String(raw.reason).trim()
  if (!reason) throw PosError.validation('reason requerido')

  const userId =
    typeof raw.userId === 'string' && raw.userId.trim()
      ? raw.userId.trim().slice(0, 120)
      : ctx.user.id

  let relatedOrderId: string | null = null
  if (raw.relatedOrderId !== undefined && raw.relatedOrderId !== null) {
    if (typeof raw.relatedOrderId !== 'string' || raw.relatedOrderId.length > 100) {
      throw PosError.validation('relatedOrderId inválido')
    }
    if (raw.relatedOrderId) relatedOrderId = raw.relatedOrderId
  }

  const draft: MovementDraft = {
    posId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    registerId: register._id as mongoose.Types.ObjectId,
    type,
    amount,
    reason,
    userId,
    channel,
    paymentMethod,
    relatedOrderId,
  }

  const scopedRegisterId = String(register._id)

  // ── Idempotencia por posId (reintento del mismo hecho) ──────────────────
  const byPosId = await CashMovement.findOne({ tenantId: ctx.tenantId, posId }).lean().exec()
  if (byPosId) {
    assertSameFact(byPosId, draft, posId)
    return respond(ctx, register._id, byPosId)
  }

  // ── Idempotencia de negocio §2.1: (registerId, relatedOrderId, type) ────
  if (relatedOrderId) {
    const byOrder = await CashMovement.findOne({
      registerId: scopedRegisterId,
      relatedOrderId,
      type,
    })
      .lean()
      .exec()
    if (byOrder) {
      assertSameFact(byOrder, draft, posId)
      return respond(ctx, register._id, byOrder)
    }
  }

  let created
  try {
    created = await CashMovement.create(draft)
  } catch (error) {
    if (isDuplicateKey(error, 'posId')) {
      const winner = await CashMovement.findOne({ tenantId: ctx.tenantId, posId }).lean().exec()
      if (winner) {
        assertSameFact(winner, draft, posId)
        return respond(ctx, register._id, winner)
      }
      throw error
    }
    if (isDuplicateKey(error, 'relatedOrderId') && relatedOrderId) {
      // Carrera entre dos reintentos simultáneos del mismo hecho §2.1.
      const winner = await CashMovement.findOne({
        registerId: scopedRegisterId,
        relatedOrderId,
        type,
      })
        .lean()
        .exec()
      if (winner) {
        assertSameFact(winner, draft, posId)
        return respond(ctx, register._id, winner)
      }
      throw error
    }
    throw error
  }

  // ── §1 — el arqueo solo se mueve con efectivo ──────────────────────────
  // Insert primero, `$inc` después: si el insert falla (duplicado) nunca se
  // aplicó el delta; si el `$inc` se perdiera después, el cierre recalcula
  // desde los movimientos reales y no hereda la deriva.
  const delta = cashExpectedDelta(type, paymentMethod, amount)
  if (delta !== 0) {
    await CashRegister.updateOne(
      { _id: register._id as mongoose.Types.ObjectId, status: 'open' },
      { $inc: { expectedAmount: delta } }
    )
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.cash.movement.create',
    entity: 'CashMovement',
    entityId: String(created._id),
    details: { posId, type, amount, paymentMethod, relatedOrderId },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return respond(ctx, register._id, created.toObject(), 201)
})
