import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import Table from '@/models/Table'
import { logAudit } from '@/lib/audit'
import { generateOrderNumber } from '@/lib/orderNumber'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import {
  toSaasOrder,
  toPosOrder,
  type PosOrderInput,
  type SaasOrderDraft,
} from '@/lib/pos-online/orderMapper'

// ============================================================================
// GET  /api/[tenant]/pos/orders — lista (habilita el diff-then-put de M5)
// POST /api/[tenant]/pos/orders — crea con idempotencia por posId
// ============================================================================

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 200

/** Documento mínimo que el read model necesita. */
type PosOrderDoc = Parameters<typeof toPosOrder>[0]

/**
 * Huella del contenido de una orden.
 *
 * Es lo que compara el server ante un reintento con el mismo `posId`:
 * mismo payload → replay idéntico (200); payload distinto → 409.
 * Sin esto, "idempotente" sería "silenciosamente acepto lo que sea".
 */
function orderSignature(order: {
  items?: { name: string; quantity: number; basePrice: number; price: number; subtotal: number }[]
  total: number
  posTableId?: string | null
  menuVersion?: number
}): string {
  return JSON.stringify({
    total: order.total,
    table: order.posTableId ?? null,
    menuVersion: order.menuVersion ?? 1,
    items: (order.items ?? []).map((i) => [i.name, i.quantity, i.basePrice, i.price, i.subtotal]),
  })
}

function isDuplicateKey(error: unknown, field: string): boolean {
  const e = error as { code?: number; keyPattern?: unknown }
  if (e?.code !== 11000) return false
  const pattern = e.keyPattern
  if (typeof pattern !== 'object' || pattern === null) return false
  return Object.prototype.hasOwnProperty.call(pattern, field)
}

function readSearchFilters(url: string) {
  const searchParams = new URL(url).searchParams
  const statuses = searchParams.get('status')
  const tableId = searchParams.get('tableId')
  const updatedSinceRaw = searchParams.get('updatedSince')
  const limitRaw = searchParams.get('limit')

  // El read model del POS solo guarda órdenes del POS. `posId: $type: 'string'`
  // garantiza que nunca llegue acá un documento sin posId (el mapper lo
  // rechazaría y tiraría abajo toda la lista con un 500).
  const filter: Record<string, unknown> = { source: 'pos', posId: { $type: 'string' } }

  if (statuses) {
    const list = statuses
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
    if (list.length) filter.status = { $in: list }
  }

  if (tableId) filter.posTableId = tableId

  if (updatedSinceRaw) {
    const since = new Date(updatedSinceRaw)
    if (Number.isNaN(since.getTime())) {
      throw PosError.validation('updatedSince debe ser una fecha ISO válida')
    }
    filter.updatedAt = { $gt: since }
  }

  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    throw PosError.validation('limit debe ser un entero > 0')
  }
  return { filter, limit: Math.min(parsedLimit, MAX_LIMIT) }
}

async function assertTableExists(
  posTableId: string,
  tenantId: string,
  locationId: string
): Promise<void> {
  // `tableId` es el `posId` de la mesa: un UUID que genera el POS, NO un
  // ObjectId. Se exige string acotado para que no llegue un operador de
  // query ($ne, objeto, etc.) al filtro.
  if (typeof posTableId !== 'string' || posTableId.length === 0 || posTableId.length > 100) {
    throw PosError.validation('tableId inválido')
  }
  const table = await Table.findOne({ tenantId, locationId, posId: posTableId })
    .select('_id')
    .lean()
  if (!table) {
    throw PosError.notFound('Mesa no encontrada en esta sede')
  }
}

function findExisting(tenantId: string, posId: string): Promise<PosOrderDoc | null> {
  return Order.findOne({ tenantId, posId })
    .lean()
    .exec() as unknown as Promise<PosOrderDoc | null>
}

/**
 * Reintento con el mismo posId.
 *  · payload idéntico → 200 con la orden ya creada (el POS no duplica nada)
 *  · payload distinto  → 409: mismo id, dos significados distintos
 */
function replayOrConflict(existing: PosOrderDoc, draft: SaasOrderDraft): NextResponse {
  if (orderSignature(existing) !== orderSignature(draft)) {
    throw PosError.idempotencyMismatch(
      'Ya existe una orden con este posId y un contenido distinto',
      `posId=${draft.posId}`
    )
  }
  return NextResponse.json({ order: toPosOrder(existing) }, { status: 200 })
}

export const GET = posRoute(async (ctx) => {
  const { filter, limit } = readSearchFilters(ctx.request.url)

  const orders = await Order.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    ...filter,
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec()

  return NextResponse.json({
    orders: orders.map((o) => toPosOrder(o as unknown as PosOrderDoc)),
    serverTime: new Date().toISOString(),
  })
})

export const POST = posRoute(async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['id', 'items'])

  const input = body as unknown as PosOrderInput

  // La Idempotency-Key del header, si viene, tiene que ser el mismo posId.
  const headerKey = ctx.request.headers.get('idempotency-key')?.trim()
  if (headerKey && headerKey !== input.id) {
    throw PosError.idempotencyMismatch(
      'Idempotency-Key y body.id no coinciden',
      `header=${headerKey} body=${input.id}`
    )
  }

  const draft = toSaasOrder(input, {
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    tenantSlug: ctx.tenantSlug,
  })

  if (draft.posTableId) {
    await assertTableExists(draft.posTableId, ctx.tenantId, ctx.locationId)
  }

  const existing = await findExisting(ctx.tenantId, draft.posId)
  if (existing) return replayOrConflict(existing, draft)

  let created
  try {
    created = await Order.create(draft)
  } catch (error) {
    if (isDuplicateKey(error, 'posId')) {
      // Carrera entre dos reintentos simultáneos: gana el primero.
      const winner = await findExisting(ctx.tenantId, draft.posId)
      if (winner) return replayOrConflict(winner, draft)
      throw error
    }
    if (isDuplicateKey(error, 'orderNumber')) {
      // Colisión del número aleatorio del día: reintenta con otro.
      draft.orderNumber = generateOrderNumber(ctx.tenantSlug)
      created = await Order.create(draft)
    } else {
      throw error
    }
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.create',
    entity: 'Order',
    entityId: String(created._id),
    details: { posId: draft.posId, total: draft.total, source: 'pos' },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json(
    { order: toPosOrder(created.toObject() as unknown as PosOrderDoc) },
    { status: 201 }
  )
})
