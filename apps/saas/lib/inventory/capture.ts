// ============================================================================
// Captura de evidencia: recepción, conteo, merma, ajuste, producción
// ============================================================================
// Reglas comunes (DECISIONES_VIGENTES D-07, D-09, D-10):
//   · `source`, `actorId` y `locationId` los define el SERVIDOR (sesión y
//     depósito), nunca el body.
//   · Idempotencia: el cliente manda `clientEventId` (uuid generado al abrir
//     el formulario). Reintentar el mismo envío no duplica el movimiento.
//   · Cantidades convertidas a la unidad canónica del insumo; una unidad de
//     otra dimensión se rechaza (o se declara con presentación: "2 cajas de
//     6 kg").
//   · `occurredAt` puede venir del cliente (carga atrasada) pero nunca en el
//     futuro ni más de 30 días atrás.
// ============================================================================

import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import InventorySKU from '@/models/InventorySKU'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventoryState from '@/models/InventoryState'
import { convertQuantity, isInventoryUnit, beliefAt } from '@takeasygo/business/inventory'
import { appendEvents, beliefParamsForLocation, stateFromDoc } from './projector'
import { requireSku, requireStorage, loadSkuMap } from './catalog'
import { InventoryError, type InventoryContext } from './route'

const MAX_BACKDATE_MS = 30 * 86_400_000
const OBSERVATION_METHODS = ['connected_scale', 'manual_scale', 'visual_count', 'estimation'] as const
const UNITS = ['kg', 'g', 'l', 'ml', 'unit'] as const

const baseSchema = z.object({
  clientEventId: z.string().regex(/^[\w-]{8,64}$/).optional(),
  skuId: z.string(),
  storageLocationId: z.string(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
})

function resolveOccurredAt(value: string | undefined): Date {
  if (!value) return new Date()
  const at = new Date(value)
  const now = Date.now()
  if (at.getTime() > now + 5 * 60_000) throw InventoryError.validation('La fecha no puede ser futura')
  if (at.getTime() < now - MAX_BACKDATE_MS) throw InventoryError.validation('No se pueden cargar movimientos de más de 30 días')
  return at
}

function eventIdFor(kind: string, clientEventId: string | undefined): string {
  return `${kind}:${clientEventId ?? crypto.randomUUID()}`
}

/** Convierte a la unidad canónica o lanza 400 con un mensaje operativo. */
function toCanonical(quantity: number, unit: string, sku: { name: string; canonicalUnit: string }): number {
  if (!isInventoryUnit(unit) || !isInventoryUnit(sku.canonicalUnit)) throw InventoryError.validation(`Unidad inválida: ${unit}`)
  const q = convertQuantity(quantity, unit, sku.canonicalUnit)
  if (q === null) {
    throw InventoryError.validation(`"${sku.name}" se mide en ${sku.canonicalUnit}; indicá la presentación (ej. caja de 6 kg)`)
  }
  return q
}

async function loadContext(ctx: InventoryContext, skuId: string, storageLocationId: string) {
  const [sku, storage] = await Promise.all([
    requireSku(ctx.tenantObjectId, skuId),
    requireStorage(ctx.tenantObjectId, storageLocationId, ctx.assertLocation),
  ])
  if (!sku.isActive) throw InventoryError.validation(`El insumo "${sku.name}" está inactivo`)
  if (!storage.isActive) throw InventoryError.validation(`El depósito "${storage.name}" está inactivo`)
  return { sku, storage }
}

/** Creencia actual del agregado (para registrar lo esperado al contar). */
async function currentBelief(tenantId: mongoose.Types.ObjectId, skuId: string, storageLocationId: string, locationId: unknown) {
  const doc = await InventoryState.findOne({ tenantId, skuId, storageLocationId }).lean()
  if (!doc) return null
  const params = await beliefParamsForLocation(locationId)
  return beliefAt(stateFromDoc(doc as unknown as Record<string, unknown>), Date.now(), params)
}

// ── Recepción ────────────────────────────────────────────────────────────────

export const receiveSchema = baseSchema.extend({
  quantity: z.number().finite().positive(),
  unit: z.string(),
  /** Presentación: "2 cajas" de 6 kg → quantity=2, unit='caja', pack={6,'kg'}. */
  pack: z.object({ quantity: z.number().finite().positive(), unit: z.enum(UNITS) }).optional(),
  /** Total de la línea de la factura/remito. @storedAs cents */
  totalCostCents: z.number().int().min(0).optional(),
  supplierName: z.string().trim().max(120).nullish(),
  invoiceRef: z.string().trim().max(80).nullish(),
  observationMethod: z.enum(OBSERVATION_METHODS).optional(),
})

export async function recordReceipt(ctx: InventoryContext, input: z.infer<typeof receiveSchema>) {
  const { sku, storage } = await loadContext(ctx, input.skuId, input.storageLocationId)
  const quantity = input.pack
    ? toCanonical(input.quantity * input.pack.quantity, input.pack.unit, sku)
    : toCanonical(input.quantity, input.unit, sku)
  const unitCostCents = input.totalCostCents !== undefined ? Math.round(input.totalCostCents / quantity) : null

  const res = await appendEvents([{
    eventId: eventIdFor('receipt', input.clientEventId),
    tenantId: ctx.tenantObjectId,
    locationId: storage.locationId,
    skuId: sku._id,
    storageLocationId: storage._id,
    eventType: 'GoodsReceived',
    occurredAt: resolveOccurredAt(input.occurredAt),
    source: 'manual',
    actorId: ctx.user.id,
    observationMethod: input.observationMethod ?? null,
    payload: {
      quantity,
      unit: sku.canonicalUnit,
      unitCostCents,
      supplierName: input.supplierName || sku.supplierName || null,
      invoiceRef: input.invoiceRef || null,
      declared: { quantity: input.quantity, unit: input.pack ? `${input.unit} de ${input.pack.quantity} ${input.pack.unit}` : input.unit },
    },
  }])

  if (res.inserted > 0) {
    // Precio de referencia y presentación habitual ("caja de 6 kg"): la
    // próxima recepción de este insumo arranca con esos datos.
    const set: Record<string, unknown> = {}
    if (unitCostCents !== null) set.lastUnitCostCents = unitCostCents
    if (input.supplierName) set.supplierName = input.supplierName
    if (input.pack) set.lastPack = { label: input.unit.trim().slice(0, 40) || 'bulto', quantity: input.pack.quantity, unit: input.pack.unit }
    if (Object.keys(set).length > 0) await InventorySKU.updateOne({ _id: sku._id, tenantId: ctx.tenantObjectId }, { $set: set })
  }
  return { duplicate: res.inserted === 0, quantity, unit: sku.canonicalUnit, unitCostCents }
}

// ── Conteo físico ────────────────────────────────────────────────────────────

export const countSchema = baseSchema.extend({
  observedQuantity: z.number().finite().min(0),
  unit: z.string(),
  observationMethod: z.enum(OBSERVATION_METHODS),
  requestEventId: z.string().max(120).nullish(),
})

export async function recordCount(ctx: InventoryContext, input: z.infer<typeof countSchema>) {
  const { sku, storage } = await loadContext(ctx, input.skuId, input.storageLocationId)
  const observed = toCanonical(input.observedQuantity, input.unit, sku)
  const before = await currentBelief(ctx.tenantObjectId, input.skuId, input.storageLocationId, storage.locationId)

  const res = await appendEvents([{
    eventId: eventIdFor('count', input.clientEventId),
    tenantId: ctx.tenantObjectId,
    locationId: storage.locationId,
    skuId: sku._id,
    storageLocationId: storage._id,
    eventType: 'PhysicalCountObserved',
    occurredAt: resolveOccurredAt(input.occurredAt),
    source: input.observationMethod === 'connected_scale' ? 'scale' : 'manual',
    actorId: ctx.user.id,
    observationMethod: input.observationMethod,
    payload: {
      observedQuantity: observed,
      unit: sku.canonicalUnit,
      expectedAtRecord: before ? { mu: before.mu, sigma: before.sigma } : null,
      requestEventId: input.requestEventId ?? null,
    },
  }])

  const after = await currentBelief(ctx.tenantObjectId, input.skuId, input.storageLocationId, storage.locationId)
  return {
    duplicate: res.inserted === 0,
    observed,
    unit: sku.canonicalUnit,
    before: before ? { mu: before.mu, sigma: before.sigma, anchored: before.anchored } : null,
    after: after ? { mu: after.mu, sigma: after.sigma } : null,
    discrepancy: after?.lastDiscrepancy ?? null,
  }
}

// ── Merma ────────────────────────────────────────────────────────────────────

export const wasteSchema = baseSchema.extend({
  quantity: z.number().finite().positive(),
  unit: z.string(),
  reason: z.enum(['expiration', 'damage', 'preparation', 'contamination', 'staff_meal', 'other']),
  notes: z.string().trim().max(300).nullish(),
  observationMethod: z.enum(OBSERVATION_METHODS).optional(),
})

export async function recordWaste(ctx: InventoryContext, input: z.infer<typeof wasteSchema>) {
  const { sku, storage } = await loadContext(ctx, input.skuId, input.storageLocationId)
  const quantity = toCanonical(input.quantity, input.unit, sku)
  const res = await appendEvents([{
    eventId: eventIdFor('waste', input.clientEventId),
    tenantId: ctx.tenantObjectId,
    locationId: storage.locationId,
    skuId: sku._id,
    storageLocationId: storage._id,
    eventType: 'WasteRecorded',
    occurredAt: resolveOccurredAt(input.occurredAt),
    source: 'manual',
    actorId: ctx.user.id,
    observationMethod: input.observationMethod ?? 'estimation',
    payload: { quantity, unit: sku.canonicalUnit, reason: input.reason, notes: input.notes || null },
  }])
  return { duplicate: res.inserted === 0, quantity, unit: sku.canonicalUnit }
}

// ── Ajuste (solo admin/manager: lo garantiza la capacidad 'manage') ─────────

export const adjustSchema = baseSchema.extend({
  delta: z.number().finite().refine((n) => n !== 0, 'el ajuste no puede ser 0'),
  unit: z.string(),
  reason: z.string().trim().min(10, 'el motivo debe ser descriptivo (mínimo 10 caracteres)').max(300),
})

export async function recordAdjustment(ctx: InventoryContext, input: z.infer<typeof adjustSchema>) {
  const { sku, storage } = await loadContext(ctx, input.skuId, input.storageLocationId)
  const delta = toCanonical(input.delta, input.unit, sku)
  const res = await appendEvents([{
    eventId: eventIdFor('adjust', input.clientEventId),
    tenantId: ctx.tenantObjectId,
    locationId: storage.locationId,
    skuId: sku._id,
    storageLocationId: storage._id,
    eventType: 'AdjustmentApplied',
    occurredAt: resolveOccurredAt(input.occurredAt),
    source: 'manual',
    actorId: ctx.user.id,
    payload: { delta, unit: sku.canonicalUnit, reason: input.reason },
  }])
  return { duplicate: res.inserted === 0, delta, unit: sku.canonicalUnit }
}

// ── Producción (preparación: insumos → insumo elaborado) ────────────────────

export const productionSchema = z.object({
  clientEventId: z.string().regex(/^[\w-]{8,64}$/).optional(),
  recipeId: z.string(),
  storageLocationId: z.string(),
  /** Tandas producidas (1 = la receta tal cual). */
  batches: z.number().finite().positive().max(1000),
  /** Cantidad realmente obtenida (si se pesó); si no, la de la receta. */
  actualOutputQuantity: z.number().finite().positive().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
})

export async function recordProduction(ctx: InventoryContext, input: z.infer<typeof productionSchema>) {
  if (!mongoose.Types.ObjectId.isValid(input.recipeId)) throw InventoryError.validation('recipeId inválido')
  const recipe = await InventoryRecipe.findOne({ _id: input.recipeId, tenantId: ctx.tenantObjectId, kind: 'preparation' }).lean()
  if (!recipe || !recipe.outputSkuId || !recipe.outputQuantity) throw InventoryError.notFound('Preparación no encontrada')
  const storage = await requireStorage(ctx.tenantObjectId, input.storageLocationId, ctx.assertLocation)
  const skus = await loadSkuMap(ctx.tenantObjectId, [...recipe.items.map((i) => String(i.skuId)), String(recipe.outputSkuId)])
  const output = skus.get(String(recipe.outputSkuId))
  if (!output) throw InventoryError.validation('El insumo de salida no existe')

  const batchId = input.clientEventId ?? crypto.randomUUID()
  const occurredAt = resolveOccurredAt(input.occurredAt)
  const params = await beliefParamsForLocation(storage.locationId)

  // Costo de la tanda = Σ insumos × costo promedio actual del depósito.
  let batchCostCents = 0
  const inputs: Array<{ sku: NonNullable<ReturnType<typeof skus.get>>; qty: number }> = []
  for (const item of recipe.items) {
    const sku = skus.get(String(item.skuId))
    if (!sku) continue
    const qty = toCanonical(item.quantity * input.batches, item.unit, sku)
    const doc = await InventoryState.findOne({ tenantId: ctx.tenantObjectId, skuId: sku._id, storageLocationId: storage._id }).lean()
    const cost = (doc ? beliefAt(stateFromDoc(doc as unknown as Record<string, unknown>), Date.now(), params).avgUnitCostCents : 0) || sku.lastUnitCostCents
    batchCostCents += qty * cost
    inputs.push({ sku, qty })
  }
  const outputQty = input.actualOutputQuantity ?? toCanonical(recipe.outputQuantity * input.batches, output.canonicalUnit, output)

  const common = {
    tenantId: ctx.tenantObjectId,
    locationId: storage.locationId,
    storageLocationId: storage._id,
    eventType: 'ProductionTransformed' as const,
    occurredAt,
    source: 'manual' as const,
    actorId: ctx.user.id,
    correlationId: `production:${batchId}`,
  }
  const res = await appendEvents([
    ...inputs.map(({ sku, qty }) => ({
      ...common,
      eventId: `production:${batchId}:in:${sku._id}`,
      skuId: sku._id,
      payload: { direction: 'input', quantity: qty, unit: sku.canonicalUnit, batchId, recipeId: String(recipe._id) },
    })),
    {
      ...common,
      eventId: `production:${batchId}:out`,
      skuId: output._id,
      payload: {
        direction: 'output',
        quantity: outputQty,
        unit: output.canonicalUnit,
        batchId,
        recipeId: String(recipe._id),
        unitCostCents: outputQty > 0 ? Math.round(batchCostCents / outputQty) : null,
      },
    },
  ])
  return { duplicate: res.inserted === 0, batchId, outputQuantity: outputQty, unit: output.canonicalUnit }
}
