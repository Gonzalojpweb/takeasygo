import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import Location from '@/models/Location'
import InventorySKU from '@/models/InventorySKU'
import { normalizeName } from '@takeasygo/business/inventory'
import { logAudit } from '@/lib/audit'
import { canRoleUse, inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'
import {
  ensureConsumptionStorage,
  requireLocation,
  setSalesConsumption,
  setupStatusByLocation,
  skuInputSchema,
  createSku,
} from '@/lib/inventory/catalog'

/**
 * GET /api/[tenant]/inventory/setup (read)
 * Estado de inventario por sede:
 *   off       → sin inventario
 *   preparing → recetas y conteo inicial en curso; las ventas NO descuentan
 *   active    → las ventas descuentan (inventoryActive = true)
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const scoped = ctx.scopedLocationIds ? ctx.scopedLocationIds.map((id) => new mongoose.Types.ObjectId(id)) : null
  const [locations, status, skuCount] = await Promise.all([
    Location.find({ tenantId: ctx.tenantObjectId, ...(scoped ? { _id: { $in: scoped } } : {}) })
      .select('name')
      .sort({ name: 1 })
      .lean(),
    setupStatusByLocation(ctx.tenantObjectId, scoped),
    InventorySKU.countDocuments({ tenantId: ctx.tenantObjectId, isActive: true }),
  ])
  return NextResponse.json({
    skuCount,
    locations: locations.map((l) => {
      const s = status.get(String(l._id)) ?? 'off'
      return { id: String(l._id), name: l.name, status: s, inventoryActive: s === 'active' }
    }),
  })
})

const setupSchema = z.object({
  locationId: z.string(),
  /** Insumos confirmados desde las sugerencias (se omiten los que ya existen). */
  skus: z.array(skuInputSchema).max(300).default([]),
  /**
   * activate (default, compatible con la UI clásica): la sede queda ACTIVA.
   * prepare: la sede queda EN PREPARACIÓN (o sigue activa si ya lo estaba).
   * none: solo da de alta insumos; la sede tiene que existir ya.
   */
  mode: z.enum(['activate', 'prepare', 'none']).default('activate'),
})

/**
 * POST /api/[tenant]/inventory/setup (recipes; cambiar el estado exige manage)
 * Prepara o activa inventario en una sede y da de alta en bloque los insumos
 * confirmados. Idempotente.
 *
 * El jefe de cocina lo usa para dar de alta los insumos sugeridos al armar
 * una receta, pero PREPARAR o ACTIVAR una sede (que las ventas empiecen a
 * descontar) es una decisión de gestión: exige manage.
 */
export const POST = inventoryRoute('recipes', async (ctx) => {
  const input = setupSchema.parse(await readInventoryBody(ctx.request))
  const loc = await requireLocation(ctx.tenantObjectId, input.locationId, ctx.assertLocation)
  const before = (await setupStatusByLocation(ctx.tenantObjectId, [loc._id])).get(String(loc._id)) ?? 'off'
  const changesState =
    (input.mode === 'activate' && before !== 'active') || (input.mode === 'prepare' && before === 'off')
  if (changesState && !canRoleUse(ctx.user.role, 'manage')) {
    throw InventoryError.forbidden('Activar inventario en una sede lo hace un administrador, manager o gerente de operaciones')
  }
  if (input.mode === 'none' && before === 'off') {
    throw InventoryError.conflict('La sede todavía no tiene inventario: primero hay que prepararla')
  }

  const storage = await ensureConsumptionStorage(ctx.tenantObjectId, loc._id, { salesConsumption: input.mode === 'activate' })
  if (input.mode === 'activate' && before === 'preparing') {
    await setSalesConsumption(ctx.tenantObjectId, loc._id, true)
  }
  const after = input.mode === 'activate' ? 'active' : before === 'off' ? (input.mode === 'prepare' ? 'preparing' : 'off') : before

  const existing = await InventorySKU.find({ tenantId: ctx.tenantObjectId }).select('nameKey').lean()
  const known = new Map(existing.map((s) => [s.nameKey, String(s._id)]))
  const skuIds: Record<string, string> = {}
  let created = 0
  for (const sku of input.skus) {
    const key = normalizeName(sku.name)
    if (known.has(key)) {
      skuIds[sku.name] = known.get(key)!
      continue
    }
    const doc = await createSku(ctx.tenantObjectId, sku)
    known.set(key, String(doc._id))
    skuIds[sku.name] = String(doc._id)
    created++
  }

  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.setup',
    entity: 'inventory',
    entityId: String(loc._id),
    details: { storageLocationId: String(storage?._id), skusCreated: created, mode: input.mode, before, after },
    request: ctx.request,
  })
  return NextResponse.json({ storageLocationId: String(storage?._id), skusCreated: created, skuIds, status: after })
})
