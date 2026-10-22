import { NextResponse } from 'next/server'
import { z } from 'zod'
import Location from '@/models/Location'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventorySKU from '@/models/InventorySKU'
import { normalizeName } from '@takeasygo/business/inventory'
import { logAudit } from '@/lib/audit'
import { canRoleUse, inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'
import { consumptionStorageFor, ensureConsumptionStorage, requireLocation, skuInputSchema, createSku } from '@/lib/inventory/catalog'

/**
 * GET /api/[tenant]/inventory/setup (read)
 * Estado de activación por sede: si tiene depósito de consumo (las ventas
 * descuentan insumos) y cuántos insumos hay en el catálogo.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const [locations, storages, skuCount] = await Promise.all([
    Location.find({ tenantId: ctx.tenantObjectId, ...(ctx.scopedLocationIds ? { _id: { $in: ctx.scopedLocationIds } } : {}) })
      .select('name')
      .sort({ name: 1 })
      .lean(),
    InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, isDefaultConsumption: true, isActive: true, ...ctx.locationFilter() })
      .select('locationId')
      .lean(),
    InventorySKU.countDocuments({ tenantId: ctx.tenantObjectId, isActive: true }),
  ])
  const active = new Set(storages.map((s) => String(s.locationId)))
  return NextResponse.json({
    skuCount,
    locations: locations.map((l) => ({ id: String(l._id), name: l.name, inventoryActive: active.has(String(l._id)) })),
  })
})

const setupSchema = z.object({
  locationId: z.string(),
  /** Insumos confirmados desde las sugerencias (se omiten los que ya existen). */
  skus: z.array(skuInputSchema).max(300).default([]),
})

/**
 * POST /api/[tenant]/inventory/setup (recipes; activar exige manage)
 * Activa inventario en una sede (crea su depósito de consumo) y da de alta
 * en bloque los insumos confirmados. Idempotente.
 *
 * El jefe de cocina lo usa para dar de alta los insumos sugeridos al armar
 * una receta, pero ACTIVAR una sede (que las ventas empiecen a descontar) es
 * una decisión de gestión: si la sede todavía no está activa, exige manage.
 */
export const POST = inventoryRoute('recipes', async (ctx) => {
  const input = setupSchema.parse(await readInventoryBody(ctx.request))
  const loc = await requireLocation(ctx.tenantObjectId, input.locationId, ctx.assertLocation)
  if (!canRoleUse(ctx.user.role, 'manage') && !(await consumptionStorageFor(ctx.tenantObjectId, loc._id))) {
    throw InventoryError.forbidden('Activar inventario en una sede lo hace un administrador, manager o gerente de operaciones')
  }
  const storage = await ensureConsumptionStorage(ctx.tenantObjectId, loc._id)

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
    details: { storageLocationId: String(storage?._id), skusCreated: created },
    request: ctx.request,
  })
  return NextResponse.json({ storageLocationId: String(storage?._id), skusCreated: created, skuIds })
})
