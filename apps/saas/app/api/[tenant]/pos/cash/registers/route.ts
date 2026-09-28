import { NextResponse } from 'next/server'
import CashRegister from '@/models/CashRegister'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import {
  registerSignature,
  toPosMovement,
  toPosRegister,
  toSaasRegister,
  type PosRegisterInput,
} from '@/lib/pos-online/cashMapper'
import {
  findOpenRegister,
  findRegisterByPosId,
  loadMovementsByRegisterIds,
  type RegisterWithId,
} from '@/lib/pos-online/cashRepo'

// ============================================================================
// GET  /api/[tenant]/pos/cash/registers — cajas de la sede (abiertas/cerradas)
// POST /api/[tenant]/pos/cash/registers — abre caja (idempotente por posId)
// ============================================================================

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

function isDuplicateKey(error: unknown, field: string): boolean {
  const e = error as { code?: number; keyPattern?: unknown }
  if (e?.code !== 11000) return false
  const pattern = e.keyPattern
  if (typeof pattern !== 'object' || pattern === null) return false
  return Object.prototype.hasOwnProperty.call(pattern, field)
}

function readFilters(url: string) {
  const searchParams = new URL(url).searchParams
  const statusRaw = searchParams.get('status')
  const limitRaw = searchParams.get('limit')

  let status: 'open' | 'closed' | null = null
  if (statusRaw && statusRaw !== 'all') {
    if (statusRaw !== 'open' && statusRaw !== 'closed') {
      throw PosError.validation('status inválido')
    }
    status = statusRaw
  }

  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    throw PosError.validation('limit debe ser un entero > 0')
  }

  const sort: Record<string, 1 | -1> =
    status === 'open'
      ? { openedAt: -1 }
      : status === 'closed'
        ? { closedAt: -1, openedAt: -1 }
        : { updatedAt: -1 }

  return { status, limit: Math.min(parsedLimit, MAX_LIMIT), sort }
}

/** Une cada caja con sus movimientos en UNA query extra (sin N+1). */
async function withMovements(registers: RegisterWithId[]) {
  const grouped = await loadMovementsByRegisterIds(registers.map((r) => r._id))
  return registers.map((register) =>
    toPosRegister(
      register,
      (grouped.get(String(register._id)) ?? []).map((m) => toPosMovement(m))
    )
  )
}

/** Variante singular: el contrato responde `{ register: {...} }`, no una lista. */
async function withMovement(register: RegisterWithId) {
  const [mapped] = await withMovements([register])
  return mapped
}

/**
 * Reintento de una apertura.
 *  · misma sede, misma firma, caja abierta → se devuelve tal cual (200)
 *  · misma firma pero la caja ya cerró     → 409 (el POS no podría reabrirla)
 *  · firma distinta o sede distinta        → 409
 *
 * Lanza; quien llama responde con la caja ya cargada.
 */
function assertReplay(
  existing: RegisterWithId,
  draft: ReturnType<typeof toSaasRegister>,
  locationId: string
): void {
  const sameLocation = String(existing.locationId) === locationId
  const sameSignature = registerSignature(existing) === registerSignature(draft)

  if (!sameLocation || !sameSignature) {
    throw PosError.idempotencyMismatch(
      'Ya existe una caja con este posId y una apertura distinta',
      `posId=${draft.posId}`
    )
  }
  if (existing.status !== 'open') {
    throw PosError.conflict('La caja de este posId ya está cerrada')
  }
}

export const GET = posRoute(async (ctx) => {
  const { status, limit, sort } = readFilters(ctx.request.url)

  const query: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
  }
  if (status) query.status = status

  const registers = (await CashRegister.find(query)
    .sort(sort)
    .limit(limit)
    .lean()
    .exec()) as unknown as RegisterWithId[]

  return NextResponse.json({
    registers: await withMovements(registers),
    serverTime: new Date().toISOString(),
  })
})

export const POST = posRoute(async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['id', 'initialAmount'])

  const draft = toSaasRegister(body as unknown as PosRegisterInput, {
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    user: ctx.user,
  })

  const replayTarget = await findRegisterByPosId(ctx, draft.posId)
  if (replayTarget) {
    assertReplay(replayTarget, draft, ctx.locationId)
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'pos.cash.register.replay',
      entity: 'CashRegister',
      entityId: String(replayTarget._id),
      details: { posId: draft.posId },
      request: ctx.request,
      userId: ctx.user.id,
      userRole: ctx.user.role,
    })
    return NextResponse.json(
      { register: await withMovement(replayTarget) },
      { status: 200 }
    )
  }

  // §2 — UNA caja abierta por sede. El índice parcial único lo garantiza en
  // DB; acá se devuelve un 409 legible antes de llegar al driver.
  const alreadyOpen = await findOpenRegister(ctx)
  if (alreadyOpen) {
    throw PosError.conflict('Ya hay una caja abierta en esta sede')
  }

  let created
  try {
    created = await CashRegister.create(draft)
  } catch (error) {
    if (isDuplicateKey(error, 'posId')) {
      // Dos reintentos simultáneos con el mismo posId: gana el primero.
      const winner = await findRegisterByPosId(ctx, draft.posId)
      if (winner) {
        assertReplay(winner, draft, ctx.locationId)
        return NextResponse.json({ register: await withMovement(winner) }, { status: 200 })
      }
      throw error
    }
    if (isDuplicateKey(error, 'locationId')) {
      // Carrera entre dos aperturas distintas en la misma sede.
      throw PosError.conflict('Ya hay una caja abierta en esta sede')
    }
    throw error
  }

  const doc = created.toObject() as unknown as RegisterWithId

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.cash.register.open',
    entity: 'CashRegister',
    entityId: String(doc._id),
    details: {
      posId: draft.posId,
      initialAmount: draft.initialAmount,
      defaultForChannel: draft.defaultForChannel,
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ register: await withMovement(doc) }, { status: 201 })
})
