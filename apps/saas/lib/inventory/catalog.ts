// ============================================================================
// Catálogo de inventario: insumos, depósitos, recetas y modificadores
// ============================================================================

import mongoose from 'mongoose'
import { z } from 'zod'
import InventorySKU, { SKU_CATEGORIES, SKU_IMPACTS, SKU_UNITS, type IInventorySKU } from '@/models/InventorySKU'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventoryRecipe, { type IInventoryRecipe } from '@/models/InventoryRecipe'
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

export type InventorySetupStatus = 'off' | 'preparing' | 'active'

/**
 * Crea el depósito de consumo de una sede si no existe (D-12). Idempotente.
 *
 *   salesConsumption true  → sede ACTIVA: las ventas descuentan.
 *   salesConsumption false → sede EN PREPARACIÓN: se cargan recetas y el
 *                            conteo inicial sin que las ventas descuenten.
 *
 * Nunca pasa una sede activa a "en preparación": eso lo hace solo
 * setSalesConsumption, explícitamente.
 */
export async function ensureConsumptionStorage(
  tenantId: mongoose.Types.ObjectId,
  locationId: mongoose.Types.ObjectId,
  opts: { salesConsumption?: boolean } = {},
) {
  const existing = await InventoryStorageLocation.findOne({ tenantId, locationId, isDefaultConsumption: true }).lean()
  if (existing) return existing
  try {
    const created = await InventoryStorageLocation.create({
      tenantId,
      locationId,
      name: 'Cocina',
      type: 'kitchen',
      isDefaultConsumption: true,
      salesConsumption: opts.salesConsumption ?? true,
    })
    return created.toObject()
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return InventoryStorageLocation.findOne({ tenantId, locationId, isDefaultConsumption: true }).lean()
    }
    throw err
  }
}

/** Depósito del que descuentan las ventas de la sede, o null si la sede no está ACTIVA. */
export async function consumptionStorageFor(tenantId: mongoose.Types.ObjectId | string, locationId: mongoose.Types.ObjectId | string) {
  return InventoryStorageLocation.findOne({ tenantId, locationId, isDefaultConsumption: true, isActive: true, salesConsumption: { $ne: false } })
    .select('_id locationId')
    .lean<{ _id: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId }>()
}

/** Estado de inventario de cada sede pedida (off · preparing · active). */
export async function setupStatusByLocation(tenantId: mongoose.Types.ObjectId, locationIds: mongoose.Types.ObjectId[] | null) {
  const storages = await InventoryStorageLocation.find({
    tenantId,
    isDefaultConsumption: true,
    isActive: true,
    ...(locationIds ? { locationId: { $in: locationIds } } : {}),
  }).select('locationId salesConsumption').lean()
  return new Map<string, InventorySetupStatus>(
    storages.map((s) => [String(s.locationId), s.salesConsumption === false ? 'preparing' : 'active']),
  )
}

/** Activa (o pausa) el descuento por ventas de una sede ya preparada. */
export async function setSalesConsumption(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId, enabled: boolean) {
  const res = await InventoryStorageLocation.updateOne(
    { tenantId, locationId, isDefaultConsumption: true },
    { $set: { salesConsumption: enabled } },
  )
  if (res.matchedCount === 0) throw InventoryError.notFound('La sede no tiene inventario preparado')
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
  /** Variante confirmada como "igual a la base" (sin insumos propios). */
  usesBaseRecipe: z.boolean().optional(),
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

/**
 * Guarda una NUEVA versión de la receta (la anterior queda histórica).
 *
 * Orden a prueba de cortes (R5): 1) se crea la versión nueva SIN vigencia,
 * 2) la vigente deja de serlo, 3) la nueva pasa a vigente. Si el proceso se
 * corta entre 2 y 3, la clave queda sin vigente pero su versión más alta no
 * está quitada: loadCurrentRecipes la toma (y repara la marca). Antes el
 * orden era inverso y un corte dejaba el plato "sin receta" en silencio.
 *
 * Variante con `usesBaseRecipe`: confirmación explícita de que la variante
 * consume igual que la base (exige base vigente; sin insumos propios).
 */
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
    const usesBase = Boolean(input.usesBaseRecipe)
    if (usesBase) {
      if (!input.variantName) throw InventoryError.validation('Solo una variante puede usar la receta base')
      if (input.items.length > 0) throw InventoryError.validation('Una variante que usa la receta base no lleva insumos propios')
      const baseKey = dishRecipeKey(input.locationId, input.menuItemId, null)
      if (!(await loadCurrentRecipes(tenantId, { recipeKeys: [baseKey] })).has(baseKey)) {
        throw InventoryError.conflict('Primero cargá la receta base del plato')
      }
    } else if (input.items.length === 0) {
      throw InventoryError.validation('Agregá al menos un insumo a la receta')
    }
    extra = {
      locationId: input.locationId,
      menuItemId: input.menuItemId,
      variantName: input.variantName || null,
      outputSkuId: null,
      outputQuantity: null,
      usesBaseRecipe: usesBase,
    }
  } else {
    const out = (await loadSkuMap(tenantId, [input.outputSkuId])).get(input.outputSkuId)
    if (!out) throw InventoryError.validation('Insumo de salida inexistente')
    if (out.kind !== 'prepared') throw InventoryError.validation(`"${out.name}" no es un insumo elaborado`)
    if (skus.has(input.outputSkuId)) throw InventoryError.validation('Una preparación no puede consumirse a sí misma')
    recipeKey = preparationRecipeKey(input.outputSkuId)
    extra = { locationId: null, menuItemId: null, variantName: null, outputSkuId: input.outputSkuId, outputQuantity: input.outputQuantity }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await InventoryRecipe.findOne({ tenantId, recipeKey }).sort({ version: -1 }).select('version').lean()
    let created
    try {
      // 1) Versión nueva, todavía sin vigencia. El índice {recipeKey, version}
      //    descarta a la edición concurrente que eligió el mismo número.
      created = await InventoryRecipe.create({
        tenantId,
        kind: input.kind,
        recipeKey,
        name: input.name,
        items: input.items,
        version: (last?.version ?? 0) + 1,
        isCurrent: false,
        createdBy: actorId,
        ...extra,
      })
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue
      throw err
    }
    // 2) La vigente deja de serlo.
    await InventoryRecipe.updateOne({ tenantId, recipeKey, isCurrent: true, _id: { $ne: created._id } }, { $set: { isCurrent: false } })
    // 3) La nueva pasa a vigente.
    try {
      await InventoryRecipe.updateOne({ _id: created._id }, { $set: { isCurrent: true } })
    } catch (err) {
      // Otra edición tomó la vigencia entre 2 y 3: gana la otra.
      if ((err as { code?: number }).code === 11000) {
        throw InventoryError.conflict('La receta se acaba de editar desde otro lugar; revisala y volvé a guardar')
      }
      throw err
    }
    return { ...created.toObject(), isCurrent: true }
  }
  throw InventoryError.conflict('La receta se está editando desde otro lugar; reintentá')
}

/** Quita la receta vigente (el plato vuelve a "sin receta"; la historia no cambia). */
export async function removeRecipe(tenantId: mongoose.Types.ObjectId, recipeKey: string) {
  await InventoryRecipe.updateOne({ tenantId, recipeKey, isCurrent: true }, { $set: { isCurrent: false, removedAt: new Date() } })
  // Si un guardado se había cortado (sin vigente), la versión más alta también queda quitada.
  const latest = await InventoryRecipe.findOne({ tenantId, recipeKey }).sort({ version: -1 }).select('_id removedAt').lean()
  if (latest && !latest.removedAt) await InventoryRecipe.updateOne({ _id: latest._id }, { $set: { removedAt: new Date() } })
}

export type CurrentRecipe = Pick<
  IInventoryRecipe,
  'recipeKey' | 'kind' | 'name' | 'locationId' | 'menuItemId' | 'variantName' | 'outputSkuId' | 'outputQuantity' | 'items' | 'version' | 'usesBaseRecipe'
> & { _id: mongoose.Types.ObjectId }

/**
 * Recetas vigentes por clave: fuente única para ventas y lecturas.
 *
 * La vigente es la marcada `isCurrent`. Si una clave no tiene vigente pero su
 * versión más alta no está quitada (`removedAt`), es un guardado cortado
 * entre "despublicar la anterior" y "publicar la nueva" (R5): esa versión ES
 * la vigente, y se repara la marca.
 */
export async function loadCurrentRecipes(
  tenantId: mongoose.Types.ObjectId | string,
  scope: { recipeKeys: string[] } | { kind: 'dish' | 'preparation'; locationId?: mongoose.Types.ObjectId | string },
): Promise<Map<string, CurrentRecipe>> {
  const tid = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId
  const filter: Record<string, unknown> = { tenantId: tid }
  if ('recipeKeys' in scope) {
    if (scope.recipeKeys.length === 0) return new Map()
    filter.recipeKey = { $in: scope.recipeKeys }
  } else {
    filter.kind = scope.kind
    if (scope.locationId) filter.locationId = new mongoose.Types.ObjectId(String(scope.locationId))
  }
  const current = await InventoryRecipe.find({ ...filter, isCurrent: true }).lean<CurrentRecipe[]>()
  const out = new Map<string, CurrentRecipe>(current.map((r) => [r.recipeKey, r]))

  // Versión más alta de cada clave sin vigente: si no está quitada, es un guardado cortado.
  const tops = await InventoryRecipe.aggregate<{ _id: string; doc: CurrentRecipe & { removedAt: Date | null } }>([
    { $match: filter },
    { $sort: { version: -1 } },
    { $group: { _id: '$recipeKey', doc: { $first: '$$ROOT' } } },
  ])
  for (const { _id: key, doc } of tops) {
    if (out.has(key) || doc.removedAt) continue
    out.set(key, doc)
    // Reparar la marca; si otra edición ganó la vigencia, la próxima lectura la ve.
    await InventoryRecipe.updateOne({ _id: doc._id, isCurrent: false }, { $set: { isCurrent: true } }).catch(() => undefined)
  }
  return out
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
