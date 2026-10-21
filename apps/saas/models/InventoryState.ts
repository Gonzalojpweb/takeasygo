import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryState v2 — Proyección de la creencia por insumo × depósito
// Colección: inventory_state · DECISIONES_VIGENTES D-05
// ============================================================================
// Caché descartable del ledger: guarda el BeliefState del núcleo de dominio
// (@takeasygo/business/inventory) proyectado hasta `asOf`. Se recalcula desde
// el último snapshot cada vez que entra un evento del agregado, y se escribe
// con control de concurrencia optimista (`rev`): si otro proceso escribió en
// el medio, se recalcula de nuevo. No hace falta transacción multi-documento.
//
// La lectura proyecta la deriva hasta "ahora" (beliefAt) sin escribir.
// ============================================================================

export interface IInventoryState extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  skuId: mongoose.Types.ObjectId
  storageLocationId: mongoose.Types.ObjectId
  // ── BeliefState ──
  mu: number
  variance: number
  asOf: Date | null
  anchored: boolean
  lastObservedAt: Date | null
  lastObservationMethod: string | null
  avgUnitCostCents: number
  usageRaw: number
  usageWeight: number
  dayIndex: number | null
  dayUsage: number
  lastDiscrepancy: Record<string, unknown> | null
  timesIgnored: number
  eventsApplied: number
  // ── Control ──
  rev: number
  paramsVersion: string
  rebuiltAt: Date
  updatedAt: Date
}

const InventoryStateSchema = new Schema<IInventoryState>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  storageLocationId: { type: Schema.Types.ObjectId, ref: 'InventoryStorageLocation', required: true },
  mu: { type: Number, default: 0 },
  variance: { type: Number, default: 0 },
  asOf: { type: Date, default: null },
  anchored: { type: Boolean, default: false },
  lastObservedAt: { type: Date, default: null },
  lastObservationMethod: { type: String, default: null },
  avgUnitCostCents: { type: Number, default: 0 },
  usageRaw: { type: Number, default: 0 },
  usageWeight: { type: Number, default: 0 },
  dayIndex: { type: Number, default: null },
  dayUsage: { type: Number, default: 0 },
  lastDiscrepancy: { type: Schema.Types.Mixed, default: null },
  timesIgnored: { type: Number, default: 0 },
  eventsApplied: { type: Number, default: 0 },
  rev: { type: Number, default: 0 },
  paramsVersion: { type: String, default: '' },
  rebuiltAt: { type: Date, default: () => new Date() },
}, { timestamps: { createdAt: true, updatedAt: true }, minimize: false })

InventoryStateSchema.index({ tenantId: 1, skuId: 1, storageLocationId: 1 }, { unique: true, name: 'state_aggregate' })
InventoryStateSchema.index({ tenantId: 1, locationId: 1 }, { name: 'state_location' })

const InventoryState =
  (mongoose.models.InventoryState as mongoose.Model<IInventoryState>) ||
  mongoose.model<IInventoryState>('InventoryState', InventoryStateSchema, 'inventory_state')
export default InventoryState
