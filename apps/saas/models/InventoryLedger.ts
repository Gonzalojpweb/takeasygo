import mongoose, { Schema, Document } from 'mongoose'
import type { InventoryEventType, EventSource, ObservationMethod } from '@takeasygo/types'

// ============================================================================
// InventoryLedger v2 — Event Ledger append-only e inmutable
// Colección: inventory_ledger · DECISIONES_VIGENTES D-03, D-04, D-09, D-14
// ============================================================================
// · Fuente de verdad. El estado (inventory_state) es una proyección
//   descartable y recalculable desde acá.
// · Inmutable en DOS capas: estos hooks rechazan cualquier update/delete por
//   Mongoose, y en producción el usuario de base de la app no debería tener
//   permiso de update/delete sobre esta colección (ver PILOTO §Infra).
// · eventId único POR TENANT (antes global: un tenant podía "pisar" el id de
//   otro y su evento se descartaba en silencio).
// · Eventos de insumo: skuId + storageLocationId. Evento de venta
//   (SaleRecorded): un documento por línea vendida con `payload.consumption[]`.
// · `locationId` (sede) en todos los eventos: alcance de sede en lecturas.
// · Dinero en centavos enteros; cantidades en la unidad canónica del insumo.
// ============================================================================

export const LEDGER_EVENT_TYPES = [
  'GoodsReceived',
  'WasteRecorded',
  'PhysicalCountObserved',
  'AdjustmentApplied',
  'TransferOut',
  'TransferIn',
  'ProductionTransformed',
  'EvidenceRequested',
  'EvidenceIgnored',
  'SaleRecorded',
  'SaleConsumed', // legado v1 (solo lectura)
] as const satisfies readonly InventoryEventType[]

export const LEDGER_SOURCES = ['pos', 'online', 'manual', 'ocr', 'scale', 'system', 'api'] as const

export interface IInventoryEvent extends Document {
  eventId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId | null
  skuId: mongoose.Types.ObjectId | null
  storageLocationId: mongoose.Types.ObjectId | null
  eventType: InventoryEventType
  eventVersion: number
  occurredAt: Date
  recordedAt: Date
  actorId: string | null
  source: EventSource | 'api'
  observationMethod: ObservationMethod | null
  correlationId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
  createdAt: Date
}

const InventoryEventSchema = new Schema<IInventoryEvent>({
  eventId: { type: String, required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', default: null },
  storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', default: null },
  eventType: { type: String, enum: LEDGER_EVENT_TYPES, required: true },
  eventVersion: { type: Number, default: 2 },
  occurredAt: { type: Date, required: true },
  recordedAt: { type: Date, required: true },
  actorId: { type: String, default: null },
  source: { type: String, enum: LEDGER_SOURCES, required: true },
  observationMethod: { type: String, enum: ['connected_scale', 'manual_scale', 'visual_count', 'estimation', null], default: null },
  correlationId: { type: String, default: null },
  payload: { type: Schema.Types.Mixed, required: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: false,
})

// Los eventos de insumo necesitan su agregado; la venta no (toca varios).
InventoryEventSchema.pre('validate', function () {
  if (this.eventType !== 'SaleRecorded' && (!this.skuId || !this.storageLocationId)) {
    throw new Error(`${this.eventType} requiere skuId y storageLocationId`)
  }
})

// ── Inmutabilidad ────────────────────────────────────────────────────────────
const IMMUTABLE_MESSAGE = 'inventory_ledger es append-only: una corrección es un evento nuevo'
InventoryEventSchema.pre('save', function () {
  if (!this.isNew) throw new Error(IMMUTABLE_MESSAGE)
})
for (const op of [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
] as const) {
  InventoryEventSchema.pre(op, function () {
    throw new Error(IMMUTABLE_MESSAGE)
  })
}

// ── Índices ──────────────────────────────────────────────────────────────────
InventoryEventSchema.index({ tenantId: 1, eventId: 1 }, { unique: true, name: 'ledger_event_id' })
// Replay de un agregado de insumo en orden de ocurrencia.
InventoryEventSchema.index(
  { tenantId: 1, skuId: 1, storageLocationId: 1, occurredAt: 1, _id: 1 },
  { name: 'ledger_aggregate_replay' },
)
// Replay del consumo por ventas de un agregado (multikey sobre consumption[]).
InventoryEventSchema.index(
  { tenantId: 1, 'payload.consumption.skuId': 1, 'payload.consumption.storageLocationId': 1, occurredAt: 1 },
  { name: 'ledger_sale_consumption', partialFilterExpression: { eventType: 'SaleRecorded' } },
)
// Ventas de una orden (reconciliación).
InventoryEventSchema.index({ tenantId: 1, correlationId: 1, eventType: 1 }, { name: 'ledger_correlation' })
// Historial por sede.
InventoryEventSchema.index({ tenantId: 1, locationId: 1, occurredAt: -1 }, { name: 'ledger_location_history' })
// Reparación de proyecciones (cron, cruza tenants): eventos registrados en las últimas horas.
InventoryEventSchema.index({ recordedAt: 1 }, { name: 'ledger_recorded_at' })

const InventoryLedger =
  (mongoose.models.InventoryLedger as mongoose.Model<IInventoryEvent>) ||
  mongoose.model<IInventoryEvent>('InventoryLedger', InventoryEventSchema, 'inventory_ledger')
export default InventoryLedger
