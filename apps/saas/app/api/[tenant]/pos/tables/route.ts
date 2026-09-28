import { NextResponse } from 'next/server'
import type { TableStatus } from '@takeasygo/types'
import Table from '@/models/Table'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import {
  toSaasTable,
  toPosTable,
  TABLE_STATUSES,
  type PosTableInput,
} from '@/lib/pos-online/tableMapper'
import type { PosTableDoc } from '@/lib/pos-online/tableRepo'

// ============================================================================
// GET  /api/[tenant]/pos/tables — mesas de la sede (filtro por sección/estado)
// POST /api/[tenant]/pos/tables — crea una mesa (openTable del POS)
// ============================================================================

function readListFilters(url: string) {
  const searchParams = new URL(url).searchParams
  const section = searchParams.get('section')
  const status = searchParams.get('status')

  const filter: Record<string, unknown> = {}
  if (section) {
    if (section.length > 100) throw PosError.validation('section demasiado larga')
    filter.section = section
  }
  if (status) {
    if (!TABLE_STATUSES.includes(status as TableStatus)) {
      throw PosError.validation('Estado de mesa desconocido')
    }
    filter.status = status
  }
  return filter
}

function isDuplicateKey(error: unknown, field: string): boolean {
  const e = error as { code?: number; keyPattern?: unknown }
  if (e?.code !== 11000) return false
  const pattern = e.keyPattern
  if (typeof pattern !== 'object' || pattern === null) return false
  return Object.prototype.hasOwnProperty.call(pattern, field)
}

export const GET = posRoute(async (ctx) => {
  const filter = readListFilters(ctx.request.url)

  const tables = await Table.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    ...filter,
  })
    .sort({ number: 1 })
    .lean()
    .exec()

  return NextResponse.json({
    tables: tables.map((t) => toPosTable(t as unknown as PosTableDoc)),
    serverTime: new Date().toISOString(),
  })
})

export const POST = posRoute(async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['id', 'number', 'capacity'])

  const draft = toSaasTable(body as unknown as PosTableInput, {
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
  })

  const existing = await Table.findOne({ tenantId: ctx.tenantId, posId: draft.posId })
    .lean()
    .exec()
  if (existing) return replay(existing as unknown as PosTableDoc, draft)

  let created
  try {
    created = await Table.create(draft)
  } catch (error) {
    if (isDuplicateKey(error, 'posId')) {
      const winner = await Table.findOne({ tenantId: ctx.tenantId, posId: draft.posId })
        .lean()
        .exec()
      if (winner) return replay(winner as unknown as PosTableDoc, draft)
      throw error
    }
    if (isDuplicateKey(error, 'number')) {
      throw PosError.conflict('Ya existe una mesa con ese número en esta sede', `number=${draft.number}`)
    }
    throw error
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.table.create',
    entity: 'Table',
    entityId: String(created._id),
    details: { posId: draft.posId, number: draft.number },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ table: toPosTable(created.toObject() as unknown as PosTableDoc) }, { status: 201 })
})

/**
 * Reintento con el mismo posId: misma mesa devuelta, sin duplicar nada.
 * Si el contenido cambió, el número de mesa ya no puede ser el mismo, así que
 * un posId repetido siempre es un replay del mismo alta.
 */
function replay(existing: PosTableDoc, draft: { number: number; capacity: number }): NextResponse {
  if (existing.number !== draft.number || existing.capacity !== draft.capacity) {
    throw PosError.idempotencyMismatch(
      'Ya existe una mesa con este posId y un contenido distinto',
      `posId=${existing.posId}`
    )
  }
  return NextResponse.json({ table: toPosTable(existing) }, { status: 200 })
}
