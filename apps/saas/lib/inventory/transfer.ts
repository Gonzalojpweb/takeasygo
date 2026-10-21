// ============================================================================
// transfer.ts — Transferencia de stock entre depósitos/sedes
// ============================================================================
// Una transferencia son DOS eventos del ledger con el mismo correlationId
// (= transferId): TransferOut en el depósito de origen y TransferIn en el de
// destino. Los eventId son determinísticos (`{transferId}:out|in`), así que
// reintentar la misma transferencia no duplica movimientos (idempotencia del
// ledger por eventId).
// ============================================================================

import crypto from 'node:crypto'
import mongoose from 'mongoose'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import InventorySKU from '@/models/InventorySKU'
import { processInventoryEvent } from '@/lib/inventory'

export class TransferError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

export interface StockTransferInput {
  tenantId: string
  skuId: string
  fromStorageLocationId: string
  toStorageLocationId: string
  quantity: number
  reason?: string
  actorId?: string
  /** Para reintentos idempotentes; si falta se genera uno. */
  transferId?: string
}

export async function transferStock(input: StockTransferInput): Promise<{ transferId: string }> {
  const { tenantId, skuId, fromStorageLocationId, toStorageLocationId, quantity } = input
  for (const id of [skuId, fromStorageLocationId, toStorageLocationId]) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new TransferError('Identificador inválido', 400)
  }
  if (fromStorageLocationId === toStorageLocationId) {
    throw new TransferError('El depósito de origen y el de destino son el mismo', 400)
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new TransferError('La cantidad debe ser mayor a 0', 400)
  }

  const [from, to, sku] = await Promise.all([
    InventoryStorageLocation.findOne({ _id: fromStorageLocationId, tenantId }).select('locationId').lean<{ locationId: unknown }>(),
    InventoryStorageLocation.findOne({ _id: toStorageLocationId, tenantId }).select('locationId').lean<{ locationId: unknown }>(),
    InventorySKU.exists({ _id: skuId, tenantId }),
  ])
  if (!from || !to) throw new TransferError('Depósito no encontrado', 404)
  if (!sku) throw new TransferError('Insumo no encontrado', 404)

  const transferId = input.transferId && /^[\w-]{8,64}$/.test(input.transferId)
    ? input.transferId
    : crypto.randomUUID()
  const now = new Date()
  const payload = {
    quantity,
    transferId,
    fromStorageLocationId,
    toStorageLocationId,
    fromLocationId: String(from.locationId),
    toLocationId: String(to.locationId),
    reason: input.reason?.trim().slice(0, 300) || null,
  }
  const common = {
    tenantId,
    skuId,
    occurredAt: now,
    recordedAt: now,
    actorId: input.actorId,
    source: 'manual' as const,
    confidence: 1,
    correlationId: transferId,
    payload,
  }

  // Primero la salida: si la entrada fallara, el reintento (mismo transferId)
  // completa la que falta sin duplicar la salida.
  await processInventoryEvent({ ...common, eventId: `${transferId}:out`, storageLocationId: fromStorageLocationId, eventType: 'TransferOut' })
  await processInventoryEvent({ ...common, eventId: `${transferId}:in`, storageLocationId: toStorageLocationId, eventType: 'TransferIn' })

  return { transferId }
}
