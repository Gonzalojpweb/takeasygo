import { NextResponse } from 'next/server'
import { z } from 'zod'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'
import { requireStorage } from '@/lib/inventory/catalog'

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
})

/** PATCH /api/[tenant]/inventory/storage-locations/[storageId] (manage). */
export const PATCH = inventoryRoute<{ tenant: string; storageId: string }>('manage', async (ctx, { storageId }) => {
  const patch = patchSchema.parse(await readInventoryBody(ctx.request))
  const storage = await requireStorage(ctx.tenantObjectId, storageId, ctx.assertLocation)
  const doc = await InventoryStorageLocation.findById(storage._id)
  if (!doc) throw InventoryError.notFound('Depósito no encontrado')
  if (patch.isActive === false && doc.isDefaultConsumption) {
    throw InventoryError.conflict('El depósito de consumo de la sede no se puede desactivar')
  }
  Object.assign(doc, patch)
  await doc.save()
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.storage.update',
    entity: 'inventory',
    entityId: String(doc._id),
    details: patch,
    request: ctx.request,
  })
  return NextResponse.json({ storage: doc })
})
