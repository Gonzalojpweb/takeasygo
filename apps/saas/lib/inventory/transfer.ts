// ============================================================================
// transfer.ts — Transferencia de stock entre depósitos/sedes (v2)
// ============================================================================
// Dos eventos del ledger con el mismo correlationId (= transferId):
// TransferOut en el origen y TransferIn en el destino. eventIds
// determinísticos (`transfer:{transferId}:out|in`): reintentar la misma
// transferencia no duplica. El costo promedio del origen viaja con la
// mercadería (costo de mercadería correcto en el destino).
// ============================================================================

import crypto from 'node:crypto'
import mongoose from 'mongoose'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventorySKU from '@/models/InventorySKU'
import InventoryState from '@/models/InventoryState'
import { appendEvents } from './projector'
import { InventoryError } from './route'

export interface StockTransferInput {
  tenantId: string
  skuId: string
  fromStorageLocationId: string
  toStorageLocationId: string
  quantity: number
  reason?: string
  actorId: string
  /** Para reintentos idempotentes; si falta se genera uno. */
  transferId?: string
  /** Lanza 404 si la sede de ORIGEN no está en el alcance del usuario. */
  assertLocation: (locationId: unknown) => void
}

export async function transferStock(input: StockTransferInput): Promise<{ transferId: string }> {
  const { tenantId, skuId, fromStorageLocationId, toStorageLocationId, quantity } = input
  for (const id of [skuId, fromStorageLocationId, toStorageLocationId]) {
    if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) throw InventoryError.validation('Identificador inválido')
  }
  if (fromStorageLocationId === toStorageLocationId) {
    throw InventoryError.validation('El depósito de origen y el de destino son el mismo')
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw InventoryError.validation('La cantidad debe ser mayor a 0')
  }

  const [from, to, sku] = await Promise.all([
    InventoryStorageLocation.findOne({ _id: fromStorageLocationId, tenantId }).select('locationId').lean<{ locationId: mongoose.Types.ObjectId }>(),
    InventoryStorageLocation.findOne({ _id: toStorageLocationId, tenantId }).select('locationId').lean<{ locationId: mongoose.Types.ObjectId }>(),
    InventorySKU.findOne({ _id: skuId, tenantId }).select('canonicalUnit lastUnitCostCents').lean<{ canonicalUnit: string; lastUnitCostCents: number }>(),
  ])
  if (!from || !to) throw InventoryError.notFound('Depósito no encontrado')
  input.assertLocation(from.locationId)
  if (!sku) throw InventoryError.notFound('Insumo no encontrado')

  const origin = await InventoryState.findOne({ tenantId, skuId, storageLocationId: fromStorageLocationId })
    .select('avgUnitCostCents')
    .lean<{ avgUnitCostCents: number }>()

  const transferId = input.transferId && /^[\w-]{8,64}$/.test(input.transferId) ? input.transferId : crypto.randomUUID()
  const now = new Date()
  const payload = {
    quantity,
    unit: sku.canonicalUnit,
    transferId,
    fromStorageLocationId,
    toStorageLocationId,
    fromLocationId: String(from.locationId),
    toLocationId: String(to.locationId),
    unitCostCents: origin?.avgUnitCostCents || sku.lastUnitCostCents || null,
    reason: input.reason?.trim().slice(0, 300) || null,
  }
  const common = {
    tenantId,
    skuId,
    occurredAt: now,
    actorId: input.actorId,
    source: 'manual' as const,
    correlationId: transferId,
    payload,
  }

  await appendEvents([
    { ...common, eventId: `transfer:${transferId}:out`, locationId: from.locationId, storageLocationId: fromStorageLocationId, eventType: 'TransferOut' },
    { ...common, eventId: `transfer:${transferId}:in`, locationId: to.locationId, storageLocationId: toStorageLocationId, eventType: 'TransferIn' },
  ])
  return { transferId }
}
