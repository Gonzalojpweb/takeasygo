// ============================================================================
// Catálogo de inventario: insumos, depósitos, recetas y modificadores
// ============================================================================

import mongoose from 'mongoose'
import { z } from 'zod'
import InventorySKU, { SKU_CATEGORIES, SKU_IMPACTS, SKU_UNITS, type IInventorySKU } from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventoryModifierRule from '@/models/InventoryModifierRule'
import InventoryLedger from '@/models/InventoryLedger'
import Location from '@/models/Location'
import { convertQuantity, isInventoryUnit, normalizeName } from '@takeasygo/business/inventory'
import { InventoryError } from './route'

const unitSchema = z.enum(SKU_UNITS)
const positive = z.number().finite().positive()

// ── Insumos ──────────────────────────────────────────────────────────────────

export const skuInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(SKU_CATEGORIES),
  canonicalUnit: unitSchema,
  kind: z.enum(['raw', 'prepared']).default('raw'),
  businessImpact: z.enum(SKU_IMPACTS).default('medium'),
  skuCode: z.string().trim().max(40).nullish(),
  parLevel: z.number().finite().min(0).nullish(),
  supplierName: z.string().trim().max(120).nullish(),
  /** Precio de referencia por unidad canónica. @storedAs cents */
  lastUnitCostCents: z.number().int().min(0).optional(),
})

export type SkuInput = z.infer<typeof skuInputSchema>

export async function createSku(tenantId: mongoose.Types.ObjectId, input: SkuInput): Promise<IInventorySKU> {
  try {
    return await InventorySKU.create({
      tenantId,
      ...input,
      nameKey: normalizeName(input.name),
      skuCode: input.skuCode || null,
      parLevel: input.parLevel ?? null,
      supplierName: input.supplierName || null,
      lastUnitCostCents: input.lastUnitCostCents ?? 0,
    })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw InventoryError.conflict(`Ya existe un insumo "${input.name}" (o el código está repetido)`)
    throw err
  }
}

export const skuPatchSchema = skuInputSchema.partial().extend({ isActive: z.boolean().optional() })

export async function updateSku(tenantId: mongoose.Types.ObjectId, skuId: mongoose.Types.ObjectId, patch: z.infer<typeof skuPatchSchema>) {
  const sku = await InventorySKU.findOne({ _id: skuId, tenantId })
  if (!sku) throw InventoryError.notFound('Insumo no encontrado')
  if (patch.canonicalUnit && patch.canonicalUnit !== sku.canonicalUnit) {
    // D-07: la unidad canónica es la de TODO el ledger del insumo.
    const used = await InventoryLedger.exists({
      tenantId,
      $or: [{ skuId }, { 'payload.consumption.skuId': String(skuId) }],
    })
    if (used) throw InventoryError.conflict('No se puede cambiar la unidad de un insumo con movimientos registrados')
  }
  Object.assign(sku, patch)
  if (patch.name) sku.nameKey = normalizeName(patch.name)
  if (patch.skuCode !== undefined) sku.skuCode = patch.skuCode || null
  try {
    await sku.save()
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw InventoryError.conflict('Nombre o código repetido')
    throw err
  }
  return sku
}

/** Insumos del tenant indexados por id (para validar recetas y eventos). */
export async function loadSkuMap(tenantId: mongoose.Types.ObjectId, ids?: string[]) {
  const filter: Record<string, unknown> = { tenantId }
  if (ids) filter._id = { $in: ids.filter((id) => mongoose.Types.ObjectId.isValid(id)) }
  const skus = await InventorySKU.find(filter).lean()
  return new Map(skus.map((s) => [String(s._id), s]))
}

export async function requireSku(tenantId: mongoose.Types.ObjectId, skuId: unknown) {
  if (typeof skuId !== 'string' || !mongoose.Types.ObjectId.isValid(skuId)) throw InventoryError.validation('skuId inválido')
  const sku = await InventorySKU.findOne({ _id: skuId, tenantId }).lean()
  if (!sku) throw InventoryError.notFound('Insumo no encontrado')
  return sku
}

// ── Depósitos ────────────────────────────────────────────────────────────────

/**
 * Activa inventario en una sede: crea su depósito de consumo si no existe
 * (D-12). Idempotente.
 */
export async function ensureConsumptionStorage(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId) {
  const existing = await InventoryStorageLocation.findOne({ tenantId, locationId, isDefaultConsumption: true }).lean()
  if (existing) return existing
  try {
    const created = await InventoryStorageLocation.create({
      tenantId,
      locationId,
      name: 'Cocina',
      type: 'kitchen',
      isDefaultConsumption: true,
    })
    return created.toObject()
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return InventoryStorageLocation.findOne({ tenantId, locationId, isDefaultConsumption: true }).lean()
    }
    throw err
  }
}

export async function consumptionStorageFor(tenantId: mongoose.Types.ObjectId | string, locationId: mongoose.Types.ObjectId | string) {
  return InventoryStorageLocation.findOne({ tenantId, locationId, isDefaultConsumption: true, isActive: true })
    .select('_id locationId')
    .lean<{ _id: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId }>()
}

/** Depósito del tenant (y de una sede del alcance), o 404. */
export async function requireStorage(
  tenantId: mongoose.Types.ObjectId,
  storageLocationId: unknown,
  assertLocation: (locationId: unknown) => void,
) {
  if (typeof storageLocationId !== 'string' || !mongoose.Types.ObjectId.isValid(storageLocationId)) {
    throw InventoryError.validation('storageLocationId inválido')
  }
  const storage = await InventoryStorageLocation.findOne({ _id: storageLocationId, tenantId })
    .select('locationId name isActive')
    .lean<{ _id: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId; name: string; isActive: boolean }>()
  if (!storage) throw InventoryError.notFound('Depósito no encontrado')
  assertLocation(storage.locationId)
  return storage
}

export async function requireLocation(tenantId: mongoose.Types.ObjectId, locationId: unknown, assertLocation: (id: unknown) => void) {
  if (typeof locationId !== 'string' || !mongoose.Types.ObjectId.isValid(locationId)) throw InventoryError.validation('locationId inválido')
  assertLocation(locationId)
  const loc = await Location.findOne({ _id: locationId, tenantId }).select('_id name timezone').lean<{ _id: mongoose.Types.ObjectId; name: string; timezone?: string }>()
  if (!loc) throw InventoryError.notFound('Sede no encontrada')
  return loc
}

// ── Recetas versionadas (D-08) ──────────────────────────────────────────────

export const recipeItemSchema = z.object({
  skuId: z.string(),
  quantity: z.number().finite().refine((n) => n !== 0, 'la cantidad no puede ser 0'),
  unit: unitSchema,
})

export const dishRecipeSchema = z.object({
  kind: z.literal('dish'),
  locationId: z.string(),
  menuItemId: z.string().min(1).max(64),
  variantName: z.string().trim().max(120).nullish(),
  name: z.string().trim().min(1).max(160),
  items: z.array(recipeItemSchema.extend({ quantity: positive })).max(60),
})

export const preparationRecipeSchema = z.object({
  kind: z.literal('preparation'),
  outputSkuId: z.string(),
  outputQuantity: positive,
  name: z.string().trim().min(1).max(160),
  items: z.array(recipeItemSchema.extend({ quantity: positive })).min(1).max(60),
})

export const recipeInputSchema = z.discriminatedUnion('kind', [dishRecipeSchema, preparationRecipeSchema])

export function dishRecipeKey(locationId: string, menuItemId: string, variantName: string | null | undefined) {
  return `dish:${locationId}:${menuItemId}:${variantName ? normalizeName(variantName) : '*'}`
}

export function preparationRecipeKey(outputSkuId: string) {
  return `prep:${outputSkuId}`
}

/** Valida que los ítems apunten a insumos del tenant con unidad convertible. */
async function validateRecipeItems(tenantId: mongoose.Types.ObjectId, items: Array<{ skuId: string; quantity: number; unit: string }>) {
  const skus = await loadSkuMap(tenantId, items.map((i) => i.skuId))
  const seen = new Set<string>()
  for (const item of items) {
    const sku = skus.get(item.skuId)
    if (!sku) throw InventoryError.validation(`Insumo inexistente en la receta (${item.skuId})`)
    if (!sku.isActive) throw InventoryError.validation(`El insumo "${sku.name}" está inactivo`)
    if (!isInventoryUnit(item.unit) || convertQuantity(1, item.unit, sku.canonicalUnit) === null) {
      throw InventoryError.validation(`"${sku.name}" se mide en ${sku.canonicalUnit}: no se puede cargar en ${item.unit}`)
    }
    if (seen.has(item.skuId)) throw InventoryError.validation(`"${sku.name}" está repetido en la receta`)
    seen.add(item.skuId)
  }
  return skus
}

/** Guarda una NUEVA versión de la receta (la anterior queda histórica). */
export async function saveRecipe(
  tenantId: mongoose.Types.ObjectId,
  input: z.infer<typeof recipeInputSchema>,
  actorId: string,
  assertLocation: (id: unknown) => void,
) {
  const skus = await validateRecipeItems(tenantId, input.items)
  let recipeKey: string
  let extra: Record<string, unknown>
  if (input.kind === 'dish') {
    await requireLocation(tenantId, input.locationId, assertLocation)
    recipeKey = dishRecipeKey(input.locationId, input.menuItemId, input.variantName)
    extra = { locationId: input.locationId, menuItemId: input.menuItemId, variantName: input.variantName || null, outputSkuId: null, outputQuantity: null }
  } else {
    const out = (await loadSkuMap(tenantId, [input.outputSkuId])).get(input.outputSkuId)
    if (!out) throw InventoryError.validation('Insumo de salida inexistente')
    if (out.kind !== 'prepared') throw InventoryError.validation(`"${out.name}" no es un insumo elaborado`)
    if (skus.has(input.outputSkuId)) throw InventoryError.validation('Una preparación no puede consumirse a sí misma')
    recipeKey = preparationRecipeKey(input.outputSkuId)
    extra = { locationId: null, menuItemId: null, variantName: null, outputSkuId: input.outputSkuId, outputQuantity: input.outputQuantity }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await InventoryRecipe.findOne({ tenantId, recipeKey, isCurrent: true }).lean()
    const last = await InventoryRecipe.findOne({ tenantId, recipeKey }).sort({ version: -1 }).select('version').lean()
    const version = (last?.version ?? 0) + 1
    if (current) await InventoryRecipe.updateOne({ _id: current._id, isCurrent: true }, { $set: { isCurrent: false } })
    try {
      const created = await InventoryRecipe.create({
        tenantId,
        kind: input.kind,
        recipeKey,
        name: input.name,
        items: input.items,
        version,
        isCurrent: true,
        createdBy: actorId,
        ...extra,
      })
      return created.toObject()
    } catch (err) {
      // Carrera con otra edición: devolver la vigente a su lugar y reintentar.
      if (current) await InventoryRecipe.updateOne({ _id: current._id }, { $set: { isCurrent: true } }).catch(() => {})
      if ((err as { code?: number }).code !== 11000) throw err
    }
  }
  throw InventoryError.conflict('La receta se está editando desde otro lugar; reintentá')
}

/** Desactiva la receta vigente (el plato vuelve a "sin receta"). */
export async function removeRecipe(tenantId: mongoose.Types.ObjectId, recipeKey: string) {
  await InventoryRecipe.updateOne({ tenantId, recipeKey, isCurrent: true }, { $set: { isCurrent: false } })
}

// ── Reglas de modificadores ──────────────────────────────────────────────────

export const modifierRuleSchema = z.object({
  optionName: z.string().trim().min(1).max(120),
  groupName: z.string().trim().max(120).nullish(),
  items: z.array(recipeItemSchema).min(1).max(20),
  isActive: z.boolean().default(true),
})

export async function upsertModifierRule(tenantId: mongoose.Types.ObjectId, input: z.infer<typeof modifierRuleSchema>) {
  await validateRecipeItems(tenantId, input.items)
  const groupName = input.groupName || null
  return InventoryModifierRule.findOneAndUpdate(
    { tenantId, optionKey: normalizeName(input.optionName), groupName },
    { $set: { optionName: input.optionName, items: input.items, isActive: input.isActive } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
}
