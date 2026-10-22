import { NextResponse } from 'next/server'
import { z } from 'zod'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { requireLocation } from '@/lib/inventory/catalog'

/** GET /api/[tenant]/inventory/storage-locations (capture) — depósitos de las sedes del alcance. */
export const GET = inventoryRoute('capture', async (ctx) => {
  const storages = await InventoryStorageLocation.find({ tenantId: ctx.tenantObjectId, ...ctx.locationFilter() })
    .sort({ isDefaultConsumption: -1, name: 1 })
    .lean()
  return NextResponse.json({ storages })
})

const createSchema = z.object({
  locationId: z.string(),
  name: z.string().trim().min(2).max(80),
  type: z.enum(['cold_storage', 'dry_storage', 'bar', 'kitchen', 'other']),
})

/** POST /api/[tenant]/inventory/storage-locations (manage) — depósito adicional (cámara, barra…). */
export const POST = inventoryRoute('manage', async (ctx) => {
  const input = createSchema.parse(await readInventoryBody(ctx.request))
  const loc = await requireLocation(ctx.tenantObjectId, input.locationId, ctx.assertLocation)
  const storage = await InventoryStorageLocation.create({ tenantId: ctx.tenantObjectId, locationId: loc._id, name: input.name, type: input.type })
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.storage.create',
    entity: 'inventory',
    entityId: String(storage._id),
    details: { locationId: String(loc._id), name: input.name, type: input.type },
    request: ctx.request,
  })
  return NextResponse.json({ storage }, { status: 201 })
})
