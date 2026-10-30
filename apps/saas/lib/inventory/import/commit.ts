// ============================================================================
// Importador de inventario — carga y deshacer (server)
// ============================================================================
// commitImport: lo que el admin confirmó en la vista previa.
//   · Se re-valida todo en el server (el body es del cliente).
//   · Insumo: si ya existe (mismo nombre normalizado) se reutiliza; si no, se
//     crea con categoría, unidad, mínimo, costo, proveedor y código.
//   · Stock: un conteo de apertura (PhysicalCountObserved, método
//     «estimation»: viene de otro sistema, no de un conteo físico) en el
//     depósito de consumo de la sede, con correlationId = import:<lote>.
//   · La sede sin inventario queda EN PREPARACIÓN: las ventas no descuentan
//     hasta que un responsable la active. Una sede activa sigue activa.
// undoImport: desactiva los insumos que creó el lote si nadie los usó
// después (sin recetas ni otros movimientos). Lo demás queda como estaba y
// se informa.
// ============================================================================

import mongoose from 'mongoose'
import { z } from 'zod'
import { normalizeName } from '@takeasygo/business/inventory'
import InventorySKU from '@/models/InventorySKU'
import InventoryLedger from '@/models/InventoryLedger'
import InventoryRecipe from '@/models/InventoryRecipe'
import InventoryImport from '@/models/InventoryImport'
import { appendEvents, type NewLedgerEvent } from '../projector'
import { createSku, ensureConsumptionStorage, requireLocation, setupStatusByLocation } from '../catalog'
import { InventoryError, type InventoryContext } from '../route'
import { IMPORT_CATEGORIES, IMPORT_UNITS, sameDimension } from './mapping'
import { MAX_IMPORT_ROWS } from './table'

const rowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(IMPORT_CATEGORIES),
  unit: z.enum(IMPORT_UNITS),
  quantity: z.number().finite().min(0).max(1_000_000).nullable(),
  parLevel: z.number().finite().min(0).max(1_000_000).nullable(),
  costCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  supplier: z.string().trim().max(120).nullable(),
  code: z.string().trim().max(40).nullable(),
})

export const commitSchema = z.object({
  locationId: z.string(),
  fileName: z.string().trim().min(1).max(160),
  source: z.enum(['fudo', 'generic']),
  rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS),
  /** Filas que el admin dejó afuera (solo para el resumen). */
  skipped: z.number().int().min(0).max(100_000).default(0),
})

export type CommitInput = z.infer<typeof commitSchema>

export interface CommitResult {
  importId: string
  created: number
  matched: number
  stockLoaded: number
  skipped: number
  /** La sede quedó en preparación por esta importación. */
  preparedLocation: boolean
  problems: { name: string; message: string }[]
}

type SkuLean = { _id: mongoose.Types.ObjectId; name: string; nameKey: string; canonicalUnit: string; isActive: boolean }

export async function commitImport(ctx: InventoryContext, input: CommitInput): Promise<CommitResult> {
  const loc = await requireLocation(ctx.tenantObjectId, input.locationId, ctx.assertLocation)
  const before = (await setupStatusByLocation(ctx.tenantObjectId, [loc._id])).get(String(loc._id)) ?? 'off'
  // Nunca activa una sede: si no tenía inventario, queda en preparación.
  const storage = await ensureConsumptionStorage(ctx.tenantObjectId, loc._id, { salesConsumption: false })
  if (!storage) throw InventoryError.conflict('No se pudo preparar el depósito de la sede')

  // Un nombre por fila (el server no confía en el dedup del cliente).
  const unique = new Map<string, z.infer<typeof rowSchema>>()
  for (const row of input.rows) {
    const k = normalizeName(row.name)
    if (!unique.has(k)) unique.set(k, row)
  }

  const existing = await InventorySKU.find({ tenantId: ctx.tenantObjectId, nameKey: { $in: [...unique.keys()] } })
    .select('_id name nameKey canonicalUnit isActive')
    .lean<SkuLean[]>()
  const byKey = new Map(existing.map((s) => [s.nameKey, s]))

  const batch = new InventoryImport({
    tenantId: ctx.tenantObjectId,
    locationId: loc._id,
    source: input.source,
    fileName: input.fileName,
    createdBy: mongoose.isValidObjectId(ctx.user.id) ? new mongoose.Types.ObjectId(ctx.user.id) : null,
  })
  const createdIds: mongoose.Types.ObjectId[] = []
  const matchedIds: mongoose.Types.ObjectId[] = []
  const problems: CommitResult['problems'] = []
  const events: NewLedgerEvent[] = []
  const now = new Date()

  for (const [k, row] of unique) {
    let sku = byKey.get(k)
    if (sku) {
      if (!sameDimension(sku.canonicalUnit, row.unit)) {
        problems.push({ name: row.name, message: `Ya existe medido en ${sku.canonicalUnit}; el archivo dice ${row.unit}. No se cargó su stock.` })
        continue
      }
      if (!sku.isActive) await InventorySKU.updateOne({ _id: sku._id, tenantId: ctx.tenantObjectId }, { $set: { isActive: true } })
      matchedIds.push(sku._id)
    } else {
      try {
        const doc = await createSku(ctx.tenantObjectId, {
          name: row.name,
          category: row.category,
          canonicalUnit: row.unit,
          kind: 'raw',
          businessImpact: 'medium',
          skuCode: row.code,
          parLevel: row.parLevel,
          supplierName: row.supplier,
          lastUnitCostCents: row.costCents ?? undefined,
        })
        sku = { _id: doc._id as mongoose.Types.ObjectId, name: doc.name, nameKey: doc.nameKey, canonicalUnit: doc.canonicalUnit, isActive: true }
        createdIds.push(sku._id)
      } catch (err) {
        problems.push({ name: row.name, message: err instanceof InventoryError ? err.message : 'No se pudo crear el insumo' })
        continue
      }
    }
    if (row.quantity === null) continue
    // Misma dimensión: kg ↔ g y l ↔ ml se convierten al contar.
    const factor = row.unit === sku.canonicalUnit ? 1
      : row.unit === 'kg' && sku.canonicalUnit === 'g' ? 1000
      : row.unit === 'g' && sku.canonicalUnit === 'kg' ? 0.001
      : row.unit === 'l' && sku.canonicalUnit === 'ml' ? 1000
      : row.unit === 'ml' && sku.canonicalUnit === 'l' ? 0.001
      : 1
    events.push({
      eventId: `import:${batch._id}:${sku._id}`,
      tenantId: ctx.tenantObjectId,
      locationId: loc._id,
      skuId: sku._id,
      storageLocationId: storage._id as mongoose.Types.ObjectId,
      eventType: 'PhysicalCountObserved',
      occurredAt: now,
      source: 'manual',
      actorId: ctx.user.id,
      observationMethod: 'estimation',
      correlationId: `import:${batch._id}`,
      payload: { observedQuantity: row.quantity * factor, unit: sku.canonicalUnit, expectedAtRecord: null, importId: String(batch._id) },
    } as NewLedgerEvent)
  }

  const appended = await appendEvents(events)
  batch.createdSkuIds = createdIds
  batch.matchedSkuIds = matchedIds
  batch.counts = {
    created: createdIds.length,
    matched: matchedIds.length,
    stockLoaded: appended.inserted,
    skipped: input.skipped + (input.rows.length - unique.size) + problems.length,
  }
  await batch.save()

  return {
    importId: String(batch._id),
    created: createdIds.length,
    matched: matchedIds.length,
    stockLoaded: appended.inserted,
    skipped: batch.counts.skipped,
    preparedLocation: before === 'off',
    problems,
  }
}

export interface UndoResult {
  deactivated: number
  kept: { name: string; reason: string }[]
}

export async function undoImport(ctx: InventoryContext, importId: string): Promise<UndoResult> {
  if (!mongoose.isValidObjectId(importId)) throw InventoryError.validation('Importación inválida')
  const batch = await InventoryImport.findOne({ _id: importId, tenantId: ctx.tenantObjectId })
  if (!batch) throw InventoryError.notFound('Importación no encontrada')
  ctx.assertLocation(batch.locationId)
  if (batch.status === 'undone') throw InventoryError.conflict('Esta importación ya se deshizo')

  const correlation = `import:${batch._id}`
  const skus = await InventorySKU.find({ tenantId: ctx.tenantObjectId, _id: { $in: batch.createdSkuIds } })
    .select('_id name')
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
  const ids = skus.map((s) => s._id)
  // ¿Alguien los usó después? Movimientos ajenos al lote o recetas vigentes.
  const [usedByLedger, usedByRecipes] = await Promise.all([
    InventoryLedger.distinct('skuId', { tenantId: ctx.tenantObjectId, skuId: { $in: ids }, correlationId: { $ne: correlation } }),
    InventoryRecipe.distinct('items.skuId', { tenantId: ctx.tenantObjectId, isCurrent: true, 'items.skuId': { $in: ids } }),
  ])
  const used = new Set([...usedByLedger, ...usedByRecipes].map(String))

  const kept: UndoResult['kept'] = []
  const toDeactivate: mongoose.Types.ObjectId[] = []
  for (const s of skus) {
    if (used.has(String(s._id))) kept.push({ name: s.name, reason: 'ya tiene movimientos o recetas' })
    else toDeactivate.push(s._id)
  }
  if (toDeactivate.length > 0) {
    await InventorySKU.updateMany({ tenantId: ctx.tenantObjectId, _id: { $in: toDeactivate } }, { $set: { isActive: false } })
  }
  batch.status = 'undone'
  batch.undoneAt = new Date()
  batch.undoneBy = mongoose.isValidObjectId(ctx.user.id) ? new mongoose.Types.ObjectId(ctx.user.id) : null
  await batch.save()
  return { deactivated: toDeactivate.length, kept }
}

/** Historial de la sede (lo último primero). */
export async function listImports(ctx: InventoryContext, locationId: string) {
  const loc = await requireLocation(ctx.tenantObjectId, locationId, ctx.assertLocation)
  const docs = await InventoryImport.find({ tenantId: ctx.tenantObjectId, locationId: loc._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('source fileName counts status createdAt undoneAt')
    .lean<{ _id: mongoose.Types.ObjectId; source: string; fileName: string; counts: CommitResult & Record<string, number>; status: string; createdAt: Date; undoneAt: Date | null }[]>()
  return docs.map((d) => ({
    id: String(d._id),
    source: d.source,
    fileName: d.fileName,
    counts: { created: d.counts.created, matched: d.counts.matched, stockLoaded: d.counts.stockLoaded, skipped: d.counts.skipped },
    status: d.status,
    createdAt: d.createdAt,
    undoneAt: d.undoneAt,
  }))
}
