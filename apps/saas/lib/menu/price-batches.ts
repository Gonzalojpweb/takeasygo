/**
 * lib/menu/price-batches.ts — servicio de «Actualizar precios».
 *
 * Todo cálculo se rehace en el servidor (lib/menu/price-engine) a partir del
 * plan: nunca se aplica una lista de cambios que venga del navegador.
 * Aplicar y deshacer son TODO O NADA: se revisan los conflictos en todas las
 * cartas antes de guardar; si alguna carta falla al guardarse, las ya
 * guardadas se devuelven a como estaban.
 *
 * Permisos (decisión del dueño, 07/11/2026):
 *   · Administrador y Manager: aplican, programan, aprueban, rechazan y deshacen.
 *   · Cajero: solo propone; queda pendiente hasta que un Administrador o
 *     Manager lo apruebe.
 */
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import PriceChangeBatch, { type IPriceChangeBatch, type PriceBatchActor } from '@/models/PriceChangeBatch'
import { computePlan, type PlanResult, type PricePlan, type PriceChange, type Rounding, type AdjustKind } from './price-engine'
import { applyToMenu } from './price-apply'

export const PRICE_APPLY_ROLES = ['admin', 'manager'] as const
export const PRICE_PROPOSE_ROLES = ['cashier'] as const
export const PRICE_TOOL_ROLES = [...PRICE_APPLY_ROLES, ...PRICE_PROPOSE_ROLES] as const
export const canApplyPrices = (role: string | null | undefined) => role === 'superadmin' || (PRICE_APPLY_ROLES as readonly string[]).includes(role ?? '')

export class PriceBatchError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message)
  }
}

const OID = /^[a-f0-9]{24}$/i
const ROUNDINGS: Rounding[] = ['none', '100', '500', '1000', 'end900', 'end990']
const KINDS: AdjustKind[] = ['percent', 'amount', 'set']
const MAX_SCHEDULE_DAYS = 60

// ── Validación del plan ──────────────────────────────────────────────────────

const strList = (v: unknown, max = 500) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 300).slice(0, max) : []
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parsePlan(raw: unknown): PricePlan {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rulesRaw = Array.isArray(body.rules) ? body.rules.slice(0, 50) : []
  const rules = rulesRaw.map((r, i) => {
    const rr = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const sel = (rr.selection && typeof rr.selection === 'object' ? rr.selection : {}) as Record<string, unknown>
    const adj = (rr.adjustment && typeof rr.adjustment === 'object' ? rr.adjustment : {}) as Record<string, unknown>
    const kind = KINDS.includes(adj.kind as AdjustKind) ? (adj.kind as AdjustKind) : null
    const value = num(adj.value)
    if (!kind || value === null) throw new PriceBatchError(400, 'invalid_rule', `La regla ${i + 1} no tiene un ajuste válido.`)
    if (kind === 'percent' && (value < -90 || value > 500)) throw new PriceBatchError(400, 'invalid_rule', `La regla ${i + 1}: el porcentaje tiene que estar entre -90 % y 500 %.`)
    if (kind === 'amount' && Math.abs(value) > 10_000_000) throw new PriceBatchError(400, 'invalid_rule', `La regla ${i + 1}: el monto es demasiado grande.`)
    if (kind === 'set' && (value <= 0 || value > 100_000_000)) throw new PriceBatchError(400, 'invalid_rule', `La regla ${i + 1}: el precio tiene que ser mayor a $0.`)
    const selection = {
      all: sel.all === true,
      categories: strList(sel.categories),
      subcategories: strList(sel.subcategories),
      items: strList(sel.items, 2000),
      tag: typeof sel.tag === 'string' && sel.tag ? sel.tag.slice(0, 60) : null,
      minPrice: num(sel.minPrice),
      maxPrice: num(sel.maxPrice),
      search: typeof sel.search === 'string' && sel.search ? sel.search.slice(0, 80) : null,
    }
    if (!selection.all && !selection.categories.length && !selection.subcategories.length && !selection.items.length) {
      throw new PriceBatchError(400, 'invalid_rule', `La regla ${i + 1} no tiene platos elegidos.`)
    }
    return {
      id: typeof rr.id === 'string' && rr.id ? rr.id.slice(0, 40) : `r${i + 1}`,
      selection,
      adjustment: { kind, value, rounding: ROUNDINGS.includes(adj.rounding as Rounding) ? (adj.rounding as Rounding) : '100' },
    }
  })
  const t = (body.targets && typeof body.targets === 'object' ? body.targets : {}) as Record<string, unknown>
  const targets = {
    dineIn: t.dineIn !== false,
    takeaway: t.takeaway !== false,
    business: t.business === true,
    variants: t.variants !== false,
    options: t.options === true,
  }
  const overrides: PricePlan['overrides'] = {}
  if (body.overrides && typeof body.overrides === 'object') {
    for (const [k, v] of Object.entries(body.overrides as Record<string, unknown>).slice(0, 3000)) {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
      const price = num(o.price)
      if (!k || k.length > 300 || price === null || price <= 0 || price > 10_000_000_000) continue
      const takeawayPrice = num(o.takeawayPrice)
      overrides[k] = { price: Math.round(price), ...(takeawayPrice && takeawayPrice > 0 ? { takeawayPrice: Math.round(takeawayPrice) } : {}) }
    }
  }
  if (!rules.length && !Object.keys(overrides).length) throw new PriceBatchError(400, 'empty_plan', 'Elegí al menos una regla o un precio a mano.')
  return { rules, targets, overrides }
}

export function parseLocationIds(raw: unknown): string[] {
  const ids = strList(raw, 50).filter(id => OID.test(id))
  if (!ids.length) throw new PriceBatchError(400, 'no_location', 'Elegí al menos una sede.')
  return [...new Set(ids)]
}

// ── Lectura y vista previa ───────────────────────────────────────────────────

async function menusFor(tenantId: string, locationIds: string[]) {
  const menus = await Menu.find({ tenantId: new mongoose.Types.ObjectId(tenantId), locationId: { $in: locationIds.map(id => new mongoose.Types.ObjectId(id)) } })
  if (menus.length !== locationIds.length) throw new PriceBatchError(404, 'menu_not_found', 'Alguna de las sedes no tiene carta.')
  return menus
}

export interface PreviewResult extends PlanResult {
  /** Costo de receta por plato (itemId → centavos), para el margen. */
  costs: Record<string, number>
}

export async function previewPlan(tenantId: string, locationIds: string[], plan: PricePlan): Promise<PreviewResult> {
  const menus = await menusFor(tenantId, locationIds)
  const result = computePlan(menus.map(m => m.toObject()), plan)
  const costs: Record<string, number> = {}
  try {
    const { dishCostsForLocation } = await import('@/lib/inventory/read')
    for (const id of locationIds) for (const [k, v] of await dishCostsForLocation(tenantId, id)) costs[k] = v
  } catch {
    // Sin inventario o sin recetas: sin margen, la vista previa sigue.
  }
  return { ...result, costs }
}

// ── Aplicar / deshacer (todo o nada) ─────────────────────────────────────────

const conflictView = (cs: { change: PriceChange; current: number | null }[], direction: 'forward' | 'back') =>
  cs.slice(0, 50).map(c => ({ itemName: c.change.itemName, label: c.change.label, expected: direction === 'forward' ? c.change.before : c.change.after, current: c.current }))

async function runOnMenus(tenantId: string, changes: PriceChange[], direction: 'forward' | 'back') {
  const locationIds = [...new Set(changes.map(c => c.locationId))]
  const menus = await menusFor(tenantId, locationIds)
  const byLoc = new Map(menus.map(m => [String(m.locationId), m]))
  const conflicts: { change: PriceChange; current: number | null }[] = []
  for (const id of locationIds) conflicts.push(...applyToMenu(byLoc.get(id)!, changes.filter(c => c.locationId === id), direction))
  if (conflicts.length) return { ok: false as const, conflicts }
  const saved: string[] = []
  try {
    for (const id of locationIds) {
      const m = byLoc.get(id)!
      m.markModified('categories')
      await m.save()
      saved.push(id)
    }
  } catch (err) {
    // Devuelve las cartas ya guardadas a como estaban.
    const reverse = direction === 'forward' ? 'back' : 'forward'
    for (const id of saved) {
      const [fresh] = await menusFor(tenantId, [id])
      if (applyToMenu(fresh, changes.filter(c => c.locationId === id), reverse).length === 0) {
        fresh.markModified('categories')
        await fresh.save().catch(() => undefined)
      }
    }
    throw err
  }
  return { ok: true as const }
}

async function audit(batch: IPriceChangeBatch, action: string, actor: PriceBatchActor, details: Record<string, unknown> = {}) {
  try {
    await mongoose.connection.db!.collection('auditlogs').insertOne({
      tenantId: batch.tenantId, action, entity: 'price_change_batch', entityId: String(batch._id),
      userId: actor.userId && OID.test(actor.userId) ? new mongoose.Types.ObjectId(actor.userId) : null,
      userName: actor.name, userRole: actor.role,
      details: { items: batch.summary.items, changes: batch.summary.changes, ...details }, createdAt: new Date(),
    })
  } catch {
    // La auditoría no bloquea el cambio.
  }
}

async function applyBatchDoc(batch: IPriceChangeBatch, actor: PriceBatchActor): Promise<IPriceChangeBatch> {
  const changes = batch.changes as unknown as PriceChange[]
  try {
    const r = await runOnMenus(String(batch.tenantId), changes, 'forward')
    if (!r.ok) {
      await PriceChangeBatch.updateOne({ _id: batch._id }, { $set: { status: 'failed', error: 'La carta cambió desde que se preparó este cambio. Volvé a prepararlo.', conflicts: conflictView(r.conflicts, 'forward') } })
      await audit(batch, 'menu.prices.failed', actor, { conflicts: r.conflicts.length })
      throw new PriceBatchError(409, 'conflict', 'La carta cambió desde que se preparó este cambio. Volvé a prepararlo.', { conflicts: conflictView(r.conflicts, 'forward') })
    }
  } catch (err) {
    if (err instanceof PriceBatchError) throw err
    await PriceChangeBatch.updateOne({ _id: batch._id }, { $set: { status: 'failed', error: 'No se pudo guardar la carta. No se cambió ningún precio.' } })
    throw err
  }
  await PriceChangeBatch.updateOne({ _id: batch._id }, { $set: { status: 'applied', appliedAt: new Date(), error: null, conflicts: [] } })
  await audit(batch, 'menu.prices.applied', actor)
  return (await PriceChangeBatch.findById(batch._id))!
}

/** Toma el lote en un estado y lo pasa a «aplicando» (evita dobles aplicaciones). */
async function claim(id: string, tenantId: string, from: string[], extra: Record<string, unknown> = {}) {
  const b = await PriceChangeBatch.findOneAndUpdate(
    { _id: id, tenantId: new mongoose.Types.ObjectId(tenantId), status: { $in: from } },
    { $set: { status: 'applying', ...extra } },
    { returnDocument: 'after' },
  )
  if (!b) throw new PriceBatchError(409, 'invalid_state', 'Este cambio ya no está disponible para esa acción.')
  return b
}

// ── Crear ────────────────────────────────────────────────────────────────────

export async function createBatch(input: {
  tenantId: string
  locationIds: string[]
  plan: PricePlan
  mode: 'apply' | 'propose' | 'schedule'
  scheduledFor?: Date | null
  note?: string
  source?: 'wizard' | 'excel' | 'image'
  actor: PriceBatchActor
}): Promise<IPriceChangeBatch> {
  const canApply = canApplyPrices(input.actor.role)
  let mode = input.mode
  if (!canApply) mode = 'propose' // el cajero siempre propone
  if (mode === 'schedule') {
    const at = input.scheduledFor
    if (!at || Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) throw new PriceBatchError(400, 'invalid_schedule', 'Elegí una fecha y hora futura.')
    if (at.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) throw new PriceBatchError(400, 'invalid_schedule', `Se puede programar hasta ${MAX_SCHEDULE_DAYS} días adelante.`)
  }
  const menus = await menusFor(input.tenantId, input.locationIds)
  const result = computePlan(menus.map(m => m.toObject()), input.plan)
  if (!result.changes.length) throw new PriceBatchError(400, 'no_changes', 'Con estas reglas ningún precio cambia.')

  const batch = await PriceChangeBatch.create({
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    locationIds: input.locationIds.map(id => new mongoose.Types.ObjectId(id)),
    status: mode === 'propose' ? 'pending_approval' : mode === 'schedule' ? 'scheduled' : 'applying',
    plan: input.plan as unknown as Record<string, unknown>,
    changes: result.changes as unknown as Record<string, unknown>[],
    summary: { items: result.items, changes: result.changes.filter(c => !c.hidden).length, warnings: result.warnings.slice(0, 100).map(w => ({ itemName: w.itemName, message: w.message, level: w.level })) },
    note: (input.note ?? '').slice(0, 300),
    source: input.source ?? 'wizard',
    createdBy: input.actor,
    scheduledFor: mode === 'schedule' ? input.scheduledFor : null,
  })
  await audit(batch, mode === 'propose' ? 'menu.prices.proposed' : mode === 'schedule' ? 'menu.prices.scheduled' : 'menu.prices.created', input.actor)
  if (mode === 'apply') return applyBatchDoc(batch, input.actor)
  return batch
}

// ── Acciones ─────────────────────────────────────────────────────────────────

export async function approveBatch(id: string, tenantId: string, actor: PriceBatchActor) {
  if (!canApplyPrices(actor.role)) throw new PriceBatchError(403, 'forbidden', 'Solo el Administrador o el Manager aprueban cambios de precios.')
  const b = await claim(id, tenantId, ['pending_approval'], { approvedBy: actor, approvedAt: new Date() })
  await audit(b, 'menu.prices.approved', actor)
  return applyBatchDoc(b, actor)
}

export async function rejectBatch(id: string, tenantId: string, actor: PriceBatchActor, reason?: string) {
  if (!canApplyPrices(actor.role)) throw new PriceBatchError(403, 'forbidden', 'Solo el Administrador o el Manager rechazan cambios de precios.')
  const b = await PriceChangeBatch.findOneAndUpdate(
    { _id: id, tenantId: new mongoose.Types.ObjectId(tenantId), status: 'pending_approval' },
    { $set: { status: 'rejected', rejectedBy: actor, rejectedAt: new Date(), rejectReason: (reason ?? '').slice(0, 300) || null } },
    { returnDocument: 'after' },
  )
  if (!b) throw new PriceBatchError(409, 'invalid_state', 'Este cambio ya no está pendiente.')
  await audit(b, 'menu.prices.rejected', actor)
  return b
}

/** Cancelar: un pendiente (quien lo propuso o quien aprueba) o un programado (quien aprueba). */
export async function cancelBatch(id: string, tenantId: string, actor: PriceBatchActor) {
  const b = await PriceChangeBatch.findOne({ _id: id, tenantId: new mongoose.Types.ObjectId(tenantId) })
  if (!b || !['pending_approval', 'scheduled'].includes(b.status)) throw new PriceBatchError(409, 'invalid_state', 'Este cambio ya no se puede cancelar.')
  const own = b.createdBy.userId && b.createdBy.userId === actor.userId
  if (!canApplyPrices(actor.role) && !(own && b.status === 'pending_approval')) throw new PriceBatchError(403, 'forbidden', 'No podés cancelar este cambio.')
  const r = await PriceChangeBatch.updateOne({ _id: b._id, status: b.status }, { $set: { status: 'cancelled' } })
  if (r.modifiedCount === 0) throw new PriceBatchError(409, 'invalid_state', 'Este cambio ya no se puede cancelar.')
  await audit(b, 'menu.prices.cancelled', actor)
  return PriceChangeBatch.findById(b._id)
}

export async function revertBatch(id: string, tenantId: string, actor: PriceBatchActor) {
  if (!canApplyPrices(actor.role)) throw new PriceBatchError(403, 'forbidden', 'Solo el Administrador o el Manager deshacen cambios de precios.')
  const b = await claim(id, tenantId, ['applied'])
  const changes = b.changes as unknown as PriceChange[]
  try {
    const r = await runOnMenus(tenantId, changes, 'back')
    if (!r.ok) {
      await PriceChangeBatch.updateOne({ _id: b._id }, { $set: { status: 'applied' } })
      throw new PriceBatchError(409, 'conflict', 'Algunos de estos precios se cambiaron después. Para no pisarlos, no se deshizo nada.', { conflicts: conflictView(r.conflicts, 'back') })
    }
  } catch (err) {
    if (!(err instanceof PriceBatchError)) await PriceChangeBatch.updateOne({ _id: b._id }, { $set: { status: 'applied' } })
    throw err
  }
  await PriceChangeBatch.updateOne({ _id: b._id }, { $set: { status: 'reverted', revertedBy: actor, revertedAt: new Date() } })
  await audit(b, 'menu.prices.reverted', actor)
  return PriceChangeBatch.findById(b._id)
}

export async function listBatches(tenantId: string, limit = 30) {
  return PriceChangeBatch.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    .sort({ createdAt: -1 }).limit(Math.min(Math.max(limit, 1), 100))
    .select('-plan').lean()
}

/** Historial de un plato: cambios aplicados que lo tocaron (más reciente primero). */
export async function itemHistory(tenantId: string, itemKey: string, limit = 20) {
  const batches = await PriceChangeBatch.find({ tenantId: new mongoose.Types.ObjectId(tenantId), status: { $in: ['applied', 'reverted'] }, 'changes.itemKey': itemKey })
    .sort({ appliedAt: -1 }).limit(limit).lean()
  return batches.map(b => ({
    batchId: String(b._id), status: b.status, appliedAt: b.appliedAt, by: b.approvedBy?.name || b.createdBy.name,
    changes: (b.changes as unknown as PriceChange[]).filter(c => c.itemKey === itemKey && !c.hidden).map(c => ({ label: c.label, before: c.before, after: c.after, locationId: c.locationId })),
  }))
}

/** Cron: aplica los programados vencidos. */
export async function runScheduledBatches(now = new Date()) {
  const due = await PriceChangeBatch.find({ status: 'scheduled', scheduledFor: { $lte: now } }).select('_id tenantId createdBy').limit(50).lean()
  const results: { id: string; status: string; error?: string }[] = []
  for (const d of due) {
    try {
      const b = await claim(String(d._id), String(d.tenantId), ['scheduled'])
      const done = await applyBatchDoc(b, { userId: null, name: 'Programado', role: 'system' })
      results.push({ id: String(d._id), status: done.status })
    } catch (err) {
      results.push({ id: String(d._id), status: 'failed', error: (err as Error).message })
    }
  }
  return results
}
