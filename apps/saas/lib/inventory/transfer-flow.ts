// ============================================================================
// transfer-flow.ts — Circuito de transferencias entre sedes (F1)
// ============================================================================
// pedir → autorizar → despachar → recibir (o rechazar / cancelar). Solo
// entre sedes del mismo comercio.
//
// Quién hace cada paso (además del rol de inventario de la ruta):
//   · pedir      → alguien de la sede DESTINO (capture).
//   · autorizar / rechazar → admin, encargado o jefe de operaciones de la
//                  sede ORIGEN (manage).
//   · despachar  → alguien de la sede ORIGEN (capture). Mueve el stock: sale
//                  del depósito de origen (TransferOut).
//   · recibir    → alguien de la sede DESTINO (capture). Entra lo que llegó
//                  (TransferIn); lo que falta queda como diferencia del envío.
//   · cancelar   → antes de despachar, alguien de cualquiera de las dos sedes.
//   · envío directo (sin pedido) → manage en el origen: nace despachada.
//
// Cada paso es un cambio de estado condicional (status esperado en el
// filtro): dos personas no pueden despachar la misma transferencia. Los
// eventos del ledger tienen eventIds determinísticos; si escribirlos falla,
// el estado vuelve atrás y el paso se puede reintentar.
// ============================================================================

import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import InventoryTransfer, { type IInventoryTransfer, type TransferStatus } from '@/models/InventoryTransfer'
import InventorySKU from '@/models/InventorySKU'
import InventoryState from '@/models/InventoryState'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import Location from '@/models/Location'
import User from '@/models/User'
import { appendEvents } from './projector'
import { canRoleUse, InventoryError, type InventoryContext } from './route'

// ---------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------

export type TransferAction = 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel'

const FROM: Record<TransferAction, TransferStatus[]> = {
  approve: ['requested'],
  reject: ['requested', 'approved'],
  dispatch: ['approved'],
  receive: ['dispatched'],
  cancel: ['requested', 'approved'],
}

export function canTransition(status: TransferStatus, action: TransferAction): boolean {
  return FROM[action].includes(status)
}

/** Qué puede hacer este usuario con esta transferencia ahora. Puro. */
export function allowedActions(
  t: { status: TransferStatus; fromLocationId: string; toLocationId: string },
  user: { role: string; scopedLocationIds: string[] | null },
): TransferAction[] {
  const inScope = (id: string) => !user.scopedLocationIds || user.scopedLocationIds.includes(id)
  const capture = canRoleUse(user.role, 'capture')
  const manage = canRoleUse(user.role, 'manage')
  const out: TransferAction[] = []
  if (canTransition(t.status, 'approve') && manage && inScope(t.fromLocationId)) out.push('approve')
  if (canTransition(t.status, 'reject') && manage && inScope(t.fromLocationId)) out.push('reject')
  if (canTransition(t.status, 'dispatch') && capture && inScope(t.fromLocationId)) out.push('dispatch')
  if (canTransition(t.status, 'receive') && capture && inScope(t.toLocationId)) out.push('receive')
  if (canTransition(t.status, 'cancel') && capture && (inScope(t.fromLocationId) || inScope(t.toLocationId))) out.push('cancel')
  return out
}

/** Despachado − recibido (positivo = faltó). null si todavía no se recibió. */
export function lineDifference(line: { dispatched: number | null; received: number | null }): number | null {
  if (line.dispatched === null || line.received === null) return null
  return Math.round((line.dispatched - line.received) * 1000) / 1000
}

/**
 * Aplica cantidades parciales sobre las líneas: las que no vienen toman el
 * valor de `fallback`. Rechaza insumos que no están en la transferencia.
 */
export function mergeQuantities<T extends { skuId: unknown }>(
  lines: T[],
  given: Array<{ skuId: string; quantity: number }> | undefined,
  fallback: (l: T) => number,
): number[] {
  const map = new Map((given ?? []).map((g) => [g.skuId, g.quantity]))
  for (const id of map.keys()) {
    if (!lines.some((l) => String(l.skuId) === id)) throw InventoryError.validation('Hay un insumo que no está en la transferencia')
  }
  return lines.map((l) => {
    const q = map.get(String(l.skuId))
    return q === undefined ? fallback(l) : q
  })
}

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

const objectIdStr = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Identificador inválido')
const qtyLine = z.object({ skuId: objectIdStr, quantity: z.number().finite().min(0).max(1_000_000) })
const note = z.string().trim().max(300).optional()

export const createTransferSchema = z.object({
  fromLocationId: objectIdStr,
  toLocationId: objectIdStr,
  toStorageLocationId: objectIdStr.optional(),
  lines: z.array(z.object({ skuId: objectIdStr, quantity: z.number().finite().positive().max(1_000_000) })).min(1).max(50),
  note,
  /** Envío directo: el origen manda sin pedido (nace despachada). */
  dispatchNow: z.object({ fromStorageLocationId: objectIdStr }).optional(),
})

export const transferActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), lines: z.array(qtyLine).max(50).optional(), fromStorageLocationId: objectIdStr.optional() }),
  z.object({ action: z.literal('reject'), reason: note }),
  z.object({ action: z.literal('dispatch'), fromStorageLocationId: objectIdStr.optional(), lines: z.array(qtyLine).max(50).optional() }),
  z.object({ action: z.literal('receive'), toStorageLocationId: objectIdStr.optional(), lines: z.array(qtyLine).max(50).optional(), note }),
  z.object({ action: z.literal('cancel') }),
])

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

const oid = (v: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(v))

function inScope(ctx: InventoryContext, locationId: unknown): boolean {
  return !ctx.scopedLocationIds || ctx.scopedLocationIds.includes(String(locationId))
}

async function storageOf(ctx: InventoryContext, storageId: string, locationId: mongoose.Types.ObjectId, label: string) {
  const s = await InventoryStorageLocation.findOne({ _id: storageId, tenantId: ctx.tenantObjectId, locationId, isActive: { $ne: false } })
    .select('_id')
    .lean()
  if (!s) throw InventoryError.validation(`El depósito de ${label} no es de esa sede`)
  return s._id as mongoose.Types.ObjectId
}

async function defaultStorage(ctx: InventoryContext, locationId: mongoose.Types.ObjectId) {
  const s = await InventoryStorageLocation.findOne({ tenantId: ctx.tenantObjectId, locationId, isDefaultConsumption: true, isActive: { $ne: false } }).select('_id').lean()
  return (s?._id as mongoose.Types.ObjectId | undefined) ?? null
}

async function loadTransfer(ctx: InventoryContext, transferId: string) {
  if (!/^[\w-]{8,64}$/.test(transferId)) throw InventoryError.notFound('Transferencia no encontrada')
  const t = await InventoryTransfer.findOne({ tenantId: ctx.tenantObjectId, transferId }).lean<IInventoryTransfer>()
  // 404 también si no es de ninguna de mis sedes: no se revela que existe.
  if (!t || (!inScope(ctx, t.fromLocationId) && !inScope(ctx, t.toLocationId))) throw InventoryError.notFound('Transferencia no encontrada')
  return t
}

/** Cambio de estado condicional: si otro ya lo movió, 409. */
async function transition(ctx: InventoryContext, t: IInventoryTransfer, from: TransferStatus[], set: Record<string, unknown>) {
  const updated = await InventoryTransfer.findOneAndUpdate(
    { _id: t._id, tenantId: ctx.tenantObjectId, status: { $in: from } },
    { $set: set },
    { new: true },
  ).lean<IInventoryTransfer>()
  if (!updated) throw InventoryError.conflict('Alguien ya cambió esta transferencia. Actualizá para ver cómo quedó.')
  return updated
}

function requireManage(ctx: InventoryContext) {
  if (!canRoleUse(ctx.user.role, 'manage')) throw InventoryError.forbidden('Solo un encargado, administrador o jefe de operaciones puede autorizar o rechazar')
}

function step(ctx: InventoryContext) {
  return { by: mongoose.Types.ObjectId.isValid(ctx.user.id) ? oid(ctx.user.id) : null, at: new Date() }
}

async function writeOut(ctx: InventoryContext, t: IInventoryTransfer) {
  await appendEvents(
    t.lines
      .filter((l) => (l.dispatched ?? 0) > 0)
      .map((l) => ({
        eventId: `transfer:${t.transferId}:${l.skuId}:out`,
        eventType: 'TransferOut' as const,
        tenantId: String(ctx.tenantObjectId),
        skuId: String(l.skuId),
        locationId: t.fromLocationId,
        storageLocationId: String(t.fromStorageLocationId),
        occurredAt: t.dispatched!.at,
        actorId: ctx.user.id,
        source: 'manual' as const,
        correlationId: t.transferId,
        payload: {
          quantity: l.dispatched,
          unit: l.unit,
          transferId: t.transferId,
          fromStorageLocationId: String(t.fromStorageLocationId),
          toStorageLocationId: t.toStorageLocationId ? String(t.toStorageLocationId) : null,
          fromLocationId: String(t.fromLocationId),
          toLocationId: String(t.toLocationId),
          unitCostCents: l.unitCostCents,
          reason: t.note,
        },
      })),
  )
}

async function writeIn(ctx: InventoryContext, t: IInventoryTransfer) {
  await appendEvents(
    t.lines
      .filter((l) => (l.received ?? 0) > 0)
      .map((l) => ({
        eventId: `transfer:${t.transferId}:${l.skuId}:in`,
        eventType: 'TransferIn' as const,
        tenantId: String(ctx.tenantObjectId),
        skuId: String(l.skuId),
        locationId: t.toLocationId,
        storageLocationId: String(t.toStorageLocationId),
        occurredAt: t.received!.at,
        actorId: ctx.user.id,
        source: 'manual' as const,
        correlationId: t.transferId,
        payload: {
          quantity: l.received,
          unit: l.unit,
          transferId: t.transferId,
          fromStorageLocationId: String(t.fromStorageLocationId),
          toStorageLocationId: String(t.toStorageLocationId),
          fromLocationId: String(t.fromLocationId),
          toLocationId: String(t.toLocationId),
          unitCostCents: l.unitCostCents,
          dispatchedQuantity: l.dispatched,
          reason: t.receiveNote,
        },
      })),
  )
}

async function originCosts(ctx: InventoryContext, storageId: mongoose.Types.ObjectId, lines: IInventoryTransfer['lines']) {
  const ids = lines.map((l) => l.skuId)
  const [states, skus] = await Promise.all([
    InventoryState.find({ tenantId: ctx.tenantObjectId, storageLocationId: storageId, skuId: { $in: ids } }).select('skuId avgUnitCostCents').lean(),
    InventorySKU.find({ tenantId: ctx.tenantObjectId, _id: { $in: ids } }).select('lastUnitCostCents').lean(),
  ])
  const avg = new Map(states.map((s) => [String(s.skuId), s.avgUnitCostCents]))
  const last = new Map(skus.map((s) => [String(s._id), s.lastUnitCostCents]))
  return lines.map((l) => avg.get(String(l.skuId)) || last.get(String(l.skuId)) || null)
}

/** Despacha: guarda cantidades y depósito, escribe TransferOut; si falla, vuelve atrás. */
async function dispatchInternal(ctx: InventoryContext, t: IInventoryTransfer, fromStatus: TransferStatus[], fromStorageLocationId: string | undefined, quantities: number[]) {
  const storageId = fromStorageLocationId
    ? await storageOf(ctx, fromStorageLocationId, t.fromLocationId, 'origen')
    : t.fromStorageLocationId ?? (await defaultStorage(ctx, t.fromLocationId))
  if (!storageId) throw InventoryError.validation('Elegí de qué depósito sale la mercadería')
  if (!quantities.some((q) => q > 0)) throw InventoryError.validation('No hay nada para despachar')
  const costs = await originCosts(ctx, storageId, t.lines)
  const lines = t.lines.map((l, i) => ({ ...l, dispatched: quantities[i], unitCostCents: costs[i] }))
  const updated = await transition(ctx, t, fromStatus, { status: 'dispatched', fromStorageLocationId: storageId, lines, dispatched: step(ctx) })
  try {
    await writeOut(ctx, updated)
  } catch (err) {
    await InventoryTransfer.updateOne({ _id: t._id, status: 'dispatched' }, { $set: { status: t.status, lines: t.lines, fromStorageLocationId: t.fromStorageLocationId, dispatched: null } })
    throw err
  }
  return updated
}

export async function createTransfer(ctx: InventoryContext, input: z.infer<typeof createTransferSchema>) {
  if (input.fromLocationId === input.toLocationId) throw InventoryError.validation('La sede de origen y la de destino son la misma')
  const ids = input.lines.map((l) => l.skuId)
  if (new Set(ids).size !== ids.length) throw InventoryError.validation('Hay un insumo repetido')

  if (input.dispatchNow) {
    requireManage(ctx)
    ctx.assertLocation(input.fromLocationId)
  } else {
    ctx.assertLocation(input.toLocationId)
  }

  const [from, to, skus] = await Promise.all([
    Location.findOne({ _id: input.fromLocationId, tenantId: ctx.tenantObjectId }).select('_id').lean(),
    Location.findOne({ _id: input.toLocationId, tenantId: ctx.tenantObjectId }).select('_id').lean(),
    InventorySKU.find({ _id: { $in: ids }, tenantId: ctx.tenantObjectId, isActive: { $ne: false } }).select('canonicalUnit').lean(),
  ])
  if (!from || !to) throw InventoryError.notFound('Sede no encontrada')
  if (skus.length !== ids.length) throw InventoryError.validation('Hay un insumo que no existe o está desactivado')
  const unit = new Map(skus.map((s) => [String(s._id), s.canonicalUnit]))

  const toLoc = oid(input.toLocationId)
  const toStorage = input.toStorageLocationId ? await storageOf(ctx, input.toStorageLocationId, toLoc, 'destino') : await defaultStorage(ctx, toLoc)

  const doc = await InventoryTransfer.create({
    tenantId: ctx.tenantObjectId,
    transferId: crypto.randomUUID(),
    status: input.dispatchNow ? 'approved' : 'requested',
    fromLocationId: oid(input.fromLocationId),
    toLocationId: toLoc,
    toStorageLocationId: toStorage,
    lines: input.lines.map((l) => ({
      skuId: oid(l.skuId),
      unit: unit.get(l.skuId)!,
      requested: l.quantity,
      approved: input.dispatchNow ? l.quantity : null,
      dispatched: null,
      received: null,
      unitCostCents: null,
    })),
    note: input.note || null,
    requested: step(ctx),
    approved: input.dispatchNow ? step(ctx) : null,
  })
  const created = doc.toObject() as IInventoryTransfer
  if (!input.dispatchNow) return created
  try {
    return await dispatchInternal(ctx, created, ['approved'], input.dispatchNow.fromStorageLocationId, created.lines.map((l) => l.requested))
  } catch (err) {
    await InventoryTransfer.deleteOne({ _id: created._id, status: 'approved' })
    throw err
  }
}

export async function applyTransferAction(ctx: InventoryContext, transferId: string, input: z.infer<typeof transferActionSchema>) {
  const t = await loadTransfer(ctx, transferId)
  if (!canTransition(t.status, input.action)) {
    throw InventoryError.conflict(`La transferencia está ${STATUS_TEXT[t.status]}: no se puede ${ACTION_TEXT[input.action]}`)
  }

  switch (input.action) {
    case 'approve': {
      requireManage(ctx)
      ctx.assertLocation(t.fromLocationId)
      const approved = mergeQuantities(t.lines, input.lines, (l) => l.requested)
      if (!approved.some((q) => q > 0)) throw InventoryError.validation('Para no mandar nada, rechazala')
      const storage = input.fromStorageLocationId ? await storageOf(ctx, input.fromStorageLocationId, t.fromLocationId, 'origen') : t.fromStorageLocationId
      return transition(ctx, t, ['requested'], {
        status: 'approved',
        fromStorageLocationId: storage,
        lines: t.lines.map((l, i) => ({ ...l, approved: approved[i] })),
        approved: step(ctx),
      })
    }
    case 'reject': {
      requireManage(ctx)
      ctx.assertLocation(t.fromLocationId)
      return transition(ctx, t, ['requested', 'approved'], { status: 'rejected', rejectReason: input.reason || null, rejected: step(ctx) })
    }
    case 'dispatch': {
      ctx.assertLocation(t.fromLocationId)
      const qty = mergeQuantities(t.lines, input.lines, (l) => l.approved ?? l.requested)
      return dispatchInternal(ctx, t, ['approved'], input.fromStorageLocationId, qty)
    }
    case 'receive': {
      ctx.assertLocation(t.toLocationId)
      const storageId = input.toStorageLocationId
        ? await storageOf(ctx, input.toStorageLocationId, t.toLocationId, 'destino')
        : t.toStorageLocationId ?? (await defaultStorage(ctx, t.toLocationId))
      if (!storageId) throw InventoryError.validation('Elegí en qué depósito entra la mercadería')
      const received = mergeQuantities(t.lines, input.lines, (l) => l.dispatched ?? 0)
      const lines = t.lines.map((l, i) => ({ ...l, received: received[i] }))
      const updated = await transition(ctx, t, ['dispatched'], { status: 'received', toStorageLocationId: storageId, lines, receiveNote: input.note || null, received: step(ctx) })
      try {
        await writeIn(ctx, updated)
      } catch (err) {
        await InventoryTransfer.updateOne({ _id: t._id, status: 'received' }, { $set: { status: 'dispatched', lines: t.lines, toStorageLocationId: t.toStorageLocationId, receiveNote: null, received: null } })
        throw err
      }
      return updated
    }
    case 'cancel': {
      if (!inScope(ctx, t.fromLocationId) && !inScope(ctx, t.toLocationId)) throw InventoryError.notFound('Transferencia no encontrada')
      return transition(ctx, t, ['requested', 'approved'], { status: 'cancelled', cancelled: step(ctx) })
    }
  }
}

const STATUS_TEXT: Record<TransferStatus, string> = {
  requested: 'pedida', approved: 'autorizada', dispatched: 'despachada', received: 'recibida', rejected: 'rechazada', cancelled: 'cancelada',
}
const ACTION_TEXT: Record<TransferAction, string> = {
  approve: 'autorizar', reject: 'rechazar', dispatch: 'despachar', receive: 'recibir', cancel: 'cancelar',
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface TransferView {
  transferId: string
  status: TransferStatus
  from: { id: string; name: string; storageId: string | null; storageName: string | null }
  to: { id: string; name: string; storageId: string | null; storageName: string | null }
  lines: Array<{
    skuId: string
    name: string
    unit: string
    requested: number
    approved: number | null
    dispatched: number | null
    received: number | null
    difference: number | null
    unitCostCents: number | null
  }>
  note: string | null
  rejectReason: string | null
  receiveNote: string | null
  steps: Partial<Record<'requested' | 'approved' | 'dispatched' | 'received' | 'rejected' | 'cancelled', { at: string; by: string | null }>>
  /** Valor de la diferencia del envío (faltante × costo), en centavos. */
  differenceCostCents: number
  actions: TransferAction[]
  updatedAt: string
}

export async function toViews(ctx: InventoryContext, docs: IInventoryTransfer[]): Promise<TransferView[]> {
  const skuIds = new Set<string>(), locIds = new Set<string>(), storageIds = new Set<string>(), userIds = new Set<string>()
  const STEPS = ['requested', 'approved', 'dispatched', 'received', 'rejected', 'cancelled'] as const
  for (const d of docs) {
    d.lines.forEach((l) => skuIds.add(String(l.skuId)))
    locIds.add(String(d.fromLocationId)); locIds.add(String(d.toLocationId))
    if (d.fromStorageLocationId) storageIds.add(String(d.fromStorageLocationId))
    if (d.toStorageLocationId) storageIds.add(String(d.toStorageLocationId))
    for (const s of STEPS) if (d[s]?.by) userIds.add(String(d[s]!.by))
  }
  const [skus, locs, storages, users] = await Promise.all([
    InventorySKU.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...skuIds] } }).select('name').lean(),
    Location.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...locIds] } }).select('name').lean(),
    InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, _id: { $in: [...storageIds] } }).select('name').lean(),
    User.find({ _id: { $in: [...userIds] } }).select('name').lean(),
  ])
  const name = (list: Array<{ _id: unknown; name?: string }>) => new Map(list.map((x) => [String(x._id), x.name ?? '—']))
  const skuName = name(skus), locName = name(locs), storageName = name(storages), userName = name(users as never)

  return docs.map((d) => {
    const lines = d.lines.map((l) => ({
      skuId: String(l.skuId),
      name: skuName.get(String(l.skuId)) ?? '—',
      unit: l.unit,
      requested: l.requested,
      approved: l.approved,
      dispatched: l.dispatched,
      received: l.received,
      difference: lineDifference(l),
      unitCostCents: l.unitCostCents,
    }))
    const steps: TransferView['steps'] = {}
    for (const s of STEPS) if (d[s]) steps[s] = { at: new Date(d[s]!.at).toISOString(), by: d[s]!.by ? userName.get(String(d[s]!.by)) ?? null : null }
    return {
      transferId: d.transferId,
      status: d.status,
      from: { id: String(d.fromLocationId), name: locName.get(String(d.fromLocationId)) ?? '—', storageId: d.fromStorageLocationId ? String(d.fromStorageLocationId) : null, storageName: d.fromStorageLocationId ? storageName.get(String(d.fromStorageLocationId)) ?? null : null },
      to: { id: String(d.toLocationId), name: locName.get(String(d.toLocationId)) ?? '—', storageId: d.toStorageLocationId ? String(d.toStorageLocationId) : null, storageName: d.toStorageLocationId ? storageName.get(String(d.toStorageLocationId)) ?? null : null },
      lines,
      note: d.note,
      rejectReason: d.rejectReason,
      receiveNote: d.receiveNote,
      steps,
      differenceCostCents: Math.round(lines.reduce((s, l) => s + Math.max(0, l.difference ?? 0) * (l.unitCostCents ?? 0), 0)),
      actions: allowedActions({ status: d.status, fromLocationId: String(d.fromLocationId), toLocationId: String(d.toLocationId) }, { role: ctx.user.role, scopedLocationIds: ctx.scopedLocationIds }),
      updatedAt: new Date(d.updatedAt).toISOString(),
    }
  })
}

export async function listTransfers(ctx: InventoryContext, opts: { locationId?: string | null; open?: boolean }) {
  const filter: Record<string, unknown> = { tenantId: ctx.tenantObjectId }
  let sedes: string[] | null = ctx.scopedLocationIds
  if (opts.locationId) {
    ctx.assertLocation(opts.locationId)
    sedes = [opts.locationId]
  }
  if (sedes) {
    const ids = sedes.filter((id) => mongoose.Types.ObjectId.isValid(id)).map(oid)
    filter.$or = [{ fromLocationId: { $in: ids } }, { toLocationId: { $in: ids } }]
  }
  if (opts.open !== undefined) filter.status = opts.open ? { $in: ['requested', 'approved', 'dispatched'] } : { $in: ['received', 'rejected', 'cancelled'] }
  const docs = await InventoryTransfer.find(filter).sort({ updatedAt: -1 }).limit(100).lean<IInventoryTransfer[]>()
  return toViews(ctx, docs)
}

export async function transferView(ctx: InventoryContext, doc: IInventoryTransfer) {
  return (await toViews(ctx, [doc]))[0]
}
