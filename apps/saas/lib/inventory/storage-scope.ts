// ============================================================================
// storage-scope.ts — Pertenencia de la ubicación de stock (multisede)
// ============================================================================
// Las rutas de inventario reciben `storageLocationId` del body. La ubicación
// tiene que ser del tenant del URL y de una sede dentro del alcance del
// usuario; si no, 404 (sin filtrar existencia).
// ============================================================================

import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { guardRequestLocation } from '@/lib/location-scope'

const NOT_FOUND = 'Ubicación de stock no encontrada'

/** null si pasa. Sin storageLocationId → null (lo valida cada ruta como requerido). */
export async function guardStorageLocation(
  request: NextRequest,
  tenantId: unknown,
  storageLocationId: unknown
): Promise<NextResponse | null> {
  if (storageLocationId === undefined || storageLocationId === null || storageLocationId === '') return null
  if (typeof storageLocationId !== 'string' || !mongoose.Types.ObjectId.isValid(storageLocationId)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  }
  const storage = await InventoryStorageLocation.findOne({ _id: storageLocationId, tenantId })
    .select('locationId')
    .lean<{ locationId: unknown }>()
  if (!storage) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  return guardRequestLocation(request, storage.locationId, NOT_FOUND)
}
